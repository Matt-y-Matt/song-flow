import { supabase } from './supabase.js';

// ---------- Shape helpers ----------
// In-memory "state" mirrors the v7 editor shape:
// { id, name, date, songs: [
//   { id, title, artist, keyOf, bpm, spotifyUrl, youtubeUrl, transition, view,
//     flow: [ { id, type, label, note } ],
//     chords: { [keyOf]: content }
//   }
// ]}

function rowToSong(song, sections, chords) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    keyOf: song.key_of,
    bpm: song.bpm,
    spotifyUrl: song.spotify_url,
    youtubeUrl: song.youtube_url,
    transition: song.transition || null,
    view: song.view || 'flow',
    flow: (sections || [])
      .filter((s) => s.song_id === song.id)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, type: s.type, label: s.label, note: s.note || undefined })),
    chords: (chords || [])
      .filter((c) => c.song_id === song.id)
      .reduce((acc, c) => { acc[c.key_of] = c.content; return acc; }, {}),
  };
}

function rowToSetlist(row, songs = [], sections = [], chords = []) {
  const ordered = [...songs].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    songs: ordered.map((s) => rowToSong(s, sections, chords)),
    created: row.created_at ? Date.parse(row.created_at) : Date.now(),
    modified: row.modified_at ? Date.parse(row.modified_at) : Date.now(),
  };
}

// ---------- Reads ----------
export async function listSetlistSummaries(userId) {
  const { data: sets, error } = await supabase
    .from('setlists')
    .select('id, name, date, created_at, modified_at')
    .eq('user_id', userId)
    .order('date', { ascending: false, nullsFirst: false })
    .order('modified_at', { ascending: false });
  if (error) throw error;
  if (!sets?.length) return [];

  const ids = sets.map((s) => s.id);
  const { data: songs, error: sErr } = await supabase
    .from('songs')
    .select('id, setlist_id, position, key_of')
    .in('setlist_id', ids);
  if (sErr) throw sErr;

  const grouped = {};
  for (const s of songs || []) {
    (grouped[s.setlist_id] ||= []).push(s);
  }
  return sets.map((row) => {
    const list = (grouped[row.id] || []).sort((a, b) => a.position - b.position);
    return {
      id: row.id,
      name: row.name,
      date: row.date,
      songCount: list.length,
      keys: list.map((x) => x.key_of).filter(Boolean),
      modified: row.modified_at ? Date.parse(row.modified_at) : 0,
    };
  });
}

export async function loadSetlist(setlistId) {
  const { data: set, error } = await supabase
    .from('setlists')
    .select('*')
    .eq('id', setlistId)
    .single();
  if (error) throw error;

  const { data: songs, error: sErr } = await supabase
    .from('songs')
    .select('*')
    .eq('setlist_id', setlistId);
  if (sErr) throw sErr;

  const songIds = (songs || []).map((s) => s.id);
  let sections = [];
  let chords = [];
  if (songIds.length) {
    const [secRes, chRes] = await Promise.all([
      supabase.from('flow_sections').select('*').in('song_id', songIds),
      supabase.from('chord_sheets').select('*').in('song_id', songIds),
    ]);
    if (secRes.error) throw secRes.error;
    if (chRes.error) throw chRes.error;
    sections = secRes.data || [];
    chords = chRes.data || [];
  }
  return rowToSetlist(set, songs, sections, chords);
}

// ---------- Writes ----------
export async function createSetlist(userId, { name = 'New Setlist', date = null } = {}) {
  const { data, error } = await supabase
    .from('setlists')
    .insert({ user_id: userId, name, date })
    .select()
    .single();
  if (error) throw error;
  return rowToSetlist(data);
}

export async function deleteSetlist(setlistId) {
  const { error } = await supabase.from('setlists').delete().eq('id', setlistId);
  if (error) throw error;
}

export async function renameSetlist(setlistId, name) {
  const { error } = await supabase
    .from('setlists')
    .update({ name, modified_at: new Date().toISOString() })
    .eq('id', setlistId);
  if (error) throw error;
}

export async function duplicateSetlist(userId, sourceId) {
  const src = await loadSetlist(sourceId);
  const newSet = await createSetlist(userId, {
    name: `${src.name} (copy)`,
    date: new Date().toISOString().slice(0, 10),
  });
  newSet.songs = src.songs.map((s) => ({
    ...s,
    id: crypto.randomUUID(),
    flow: s.flow.map((f) => ({ ...f, id: crypto.randomUUID() })),
    chords: {}, // chord sheets intentionally NOT copied
  }));
  await saveSetlistFull(newSet);
  return newSet;
}

// Full-setlist save: upsert setlist + songs, replace flow_sections for each song.
// Chord sheets are preserved — they are written via saveChordSheet.
export async function saveSetlistFull(state) {
  if (!state?.id) return;

  // 1) Update setlist row
  const { error: sErr } = await supabase
    .from('setlists')
    .update({
      name: state.name,
      date: state.date,
      modified_at: new Date().toISOString(),
    })
    .eq('id', state.id);
  if (sErr) throw sErr;

  // 2) Determine song set delta
  const { data: existingRows, error: eErr } = await supabase
    .from('songs')
    .select('id')
    .eq('setlist_id', state.id);
  if (eErr) throw eErr;
  const existingIds = new Set((existingRows || []).map((r) => r.id));
  const desiredIds = new Set(state.songs.map((s) => s.id));
  const toDelete = [...existingIds].filter((id) => !desiredIds.has(id));
  if (toDelete.length) {
    const { error: dErr } = await supabase.from('songs').delete().in('id', toDelete);
    if (dErr) throw dErr;
  }

  // 3) Upsert all songs
  if (state.songs.length) {
    const songRows = state.songs.map((s, i) => ({
      id: s.id,
      setlist_id: state.id,
      position: i,
      title: s.title,
      artist: s.artist || null,
      key_of: s.keyOf || 'C',
      bpm: s.bpm || null,
      spotify_url: s.spotifyUrl || null,
      youtube_url: s.youtubeUrl || null,
      transition: s.transition || null,
      view: s.view || 'flow',
      modified_at: new Date().toISOString(),
    }));
    const { error: uErr } = await supabase.from('songs').upsert(songRows);
    if (uErr) throw uErr;
  }

  // 4) Replace flow_sections per song (delete all for this setlist then insert)
  const songIds = state.songs.map((s) => s.id);
  if (songIds.length) {
    const { error: dsErr } = await supabase
      .from('flow_sections')
      .delete()
      .in('song_id', songIds);
    if (dsErr) throw dsErr;

    const sectionRows = [];
    for (const song of state.songs) {
      (song.flow || []).forEach((f, i) => {
        sectionRows.push({
          id: f.id,
          song_id: song.id,
          position: i,
          type: f.type,
          label: f.label,
          note: f.note || null,
        });
      });
    }
    if (sectionRows.length) {
      const { error: isErr } = await supabase.from('flow_sections').insert(sectionRows);
      if (isErr) throw isErr;
    }
  }
}

// ---------- Share links ----------
export async function generateShareToken(setlistId) {
  const { data: existing, error: eErr } = await supabase
    .from('setlists')
    .select('share_token')
    .eq('id', setlistId)
    .single();
  if (eErr) throw eErr;
  if (existing?.share_token) return existing.share_token;

  const token = crypto.randomUUID();
  const { error } = await supabase
    .from('setlists')
    .update({ share_token: token })
    .eq('id', setlistId);
  if (error) throw error;
  return token;
}

export async function getSetlistByShareToken(token) {
  const { data: set, error } = await supabase
    .from('setlists')
    .select('*')
    .eq('share_token', token)
    .single();
  if (error) throw error;

  const { data: songs, error: sErr } = await supabase
    .from('songs')
    .select('*')
    .eq('setlist_id', set.id);
  if (sErr) throw sErr;

  const songIds = (songs || []).map((s) => s.id);
  let sections = [];
  let chords = [];
  if (songIds.length) {
    const [secRes, chRes] = await Promise.all([
      supabase.from('flow_sections').select('*').in('song_id', songIds),
      supabase.from('chord_sheets').select('*').in('song_id', songIds),
    ]);
    if (secRes.error) throw secRes.error;
    if (chRes.error) throw chRes.error;
    sections = secRes.data || [];
    chords = chRes.data || [];
  }
  return rowToSetlist(set, songs, sections, chords);
}

export async function getPublicSongs(setlistId) {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('setlist_id', setlistId);
  if (error) throw error;
  return data || [];
}

export async function getPublicSections(songIds) {
  if (!songIds?.length) return [];
  const { data, error } = await supabase
    .from('flow_sections')
    .select('*')
    .in('song_id', songIds);
  if (error) throw error;
  return data || [];
}

export async function saveChordSheet(songId, keyOf, content) {
  const { error } = await supabase
    .from('chord_sheets')
    .upsert(
      { song_id: songId, key_of: keyOf, content, generated_at: new Date().toISOString() },
      { onConflict: 'song_id,key_of' },
    );
  if (error) throw error;
}

// Edit-mode update — preserves generated_at so an edit doesn't look like a regeneration.
export async function updateChordSheet(songId, keyOf, content) {
  const { error } = await supabase
    .from('chord_sheets')
    .upsert(
      { song_id: songId, key_of: keyOf, content },
      { onConflict: 'song_id,key_of' },
    );
  if (error) throw error;
}

// ---------- Save queue (debounced, per-user) ----------
let saveTimer = null;
let pendingState = null;
let saveListeners = [];

export function onSaveStatus(cb) {
  saveListeners.push(cb);
  return () => { saveListeners = saveListeners.filter((fn) => fn !== cb); };
}
function emit(status, detail) {
  for (const fn of saveListeners) { try { fn(status, detail); } catch {} }
}

export function scheduleSave(state, delay = 400) {
  pendingState = state;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, delay);
}

export async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const state = pendingState;
  pendingState = null;
  if (!state) return;
  emit('saving');
  try {
    await saveSetlistFull(state);
    emit('saved');
  } catch (e) {
    console.error('[song-flow] save failed', e);
    emit('error', e);
  }
}
