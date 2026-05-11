import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parsePayload(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase server credentials' });
  }

  const payload = parsePayload(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON' });

  const shareToken = (payload.shareToken || '').toString().trim();
  const songId = (payload.songId || '').toString().trim();
  const keyOf = (payload.keyOf || '').toString().trim();
  const content = typeof payload.content === 'string' ? payload.content : null;

  if (!shareToken || !songId || !keyOf || content == null) {
    return res.status(400).json({ error: 'Missing shareToken, songId, keyOf, or content' });
  }
  if (content.length > 50000) {
    return res.status(413).json({ error: 'Chord sheet is too large' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: setlist, error: setErr } = await admin
      .from('setlists')
      .select('id')
      .eq('share_token', shareToken)
      .single();
    if (setErr || !setlist) return res.status(404).json({ error: 'Share link not found' });

    const { data: song, error: songErr } = await admin
      .from('songs')
      .select('id')
      .eq('id', songId)
      .eq('setlist_id', setlist.id)
      .single();
    if (songErr || !song) return res.status(403).json({ error: 'Song is not part of this shared setlist' });

    const { error: upsertErr } = await admin
      .from('chord_sheets')
      .upsert(
        { song_id: songId, key_of: keyOf, content },
        { onConflict: 'song_id,key_of' },
      );
    if (upsertErr) throw upsertErr;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[public-chord-sheet]', err);
    return res.status(500).json({ error: err.message || 'Chord sheet update failed' });
  }
}
