import Sortable from 'sortablejs';
import {
  listSetlistSummaries,
  loadSetlist,
  createSetlist,
  deleteSetlist,
  renameSetlist,
  duplicateSetlist,
  scheduleSave,
  flushSave,
  saveChordSheet,
  updateChordSheet,
  onSaveStatus,
  generateShareToken,
} from '../lib/library.js';
import { searchSong, searchPCO, generateChordSheet } from '../lib/ai.js';
import { signOut } from '../lib/auth.js';
import { renderLibrarySheetHTML } from './library-sheet.js';
import {
  SVG_SPOTIFY, SVG_YOUTUBE, SVG_PEN, SVG_OPEN, SVG_TRASH, SVG_LIBRARY,
  SVG_CAL, SVG_FLOW, SVG_CHORDS, SVG_REFRESH, SVG_SIGNOUT, SVG_SHARE, SVG_COPY,
  SECTION_TYPES, TAG_LABEL, VALID_TYPES, KEYS_LIST,
  uid, todayISO, escapeHtml, formatDate,
} from './editor-shared.js';

// ---------- Module state ----------
let user = null;
let mount = null;
let state = null;           // current setlist (v7-shaped)
let summaries = [];         // all setlists for the user
let saveStatus = 'idle';

// Per-song chord editor state (ephemeral, not persisted).
const chordEdit = {
  editing: new Set(),   // song ids currently in edit mode
  timers: new Map(),    // song id -> debounce timeout id
  status: new Map(),    // song id -> 'saving' | 'saved' | 'error'
};

// ---------- Helpers ----------
function songIndex(id) { return state.songs.findIndex((s) => s.id === id); }
function findSong(id) { return state.songs.find((s) => s.id === id); }
function getLink(song, p) { return p === 'spotify' ? song.spotifyUrl : song.youtubeUrl; }
function setLink(song, p, url) { if (p === 'spotify') song.spotifyUrl = url; else song.youtubeUrl = url; }

function normalizeState() {
  if (!state) return;
  if (!state.name) state.name = 'Untitled Setlist';
  if (!state.date) state.date = todayISO();
  if (!Array.isArray(state.songs)) state.songs = [];
  state.songs.forEach((s) => {
    if (!s.id) s.id = uid();
    if (!s.title) s.title = 'Untitled';
    if (!s.keyOf) s.keyOf = 'C';
    if (!Array.isArray(s.flow)) s.flow = [];
    s.flow.forEach((f) => { if (!f.id) f.id = uid(); });
    if (!s.chords || typeof s.chords !== 'object') s.chords = {};
    if (!s.view) s.view = 'flow';
  });
}

function saveState() { scheduleSave(state); }

async function refreshSummaries() {
  try {
    summaries = await listSetlistSummaries(user.id);
  } catch (e) {
    console.error('[song-flow] summaries load failed', e);
    summaries = [];
  }
}

// ---------- Render ----------
function renderFlowRow(row, idx) {
  const tagLabel = TAG_LABEL[row.type] || row.type;
  return `<li class="flow-row" data-type="${row.type}" data-row-id="${row.id}">
    <span class="drag-handle" aria-label="Drag"><svg viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg></span>
    <span class="flow-idx">${String(idx + 1).padStart(2, '0')}</span>
    <span class="flow-label" data-action="edit-label">${escapeHtml(row.label)}${row.note ? `<span class="note">${escapeHtml(row.note)}</span>` : ''}</span>
    <span class="flow-tag" data-action="cycle-type">${tagLabel}</span>
    <button class="flow-del" data-action="delete-row" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
  </li>`;
}

function renderTransitionArea(song, isFirst) {
  if (isFirst) return '';
  if (song.transition) {
    const isAltar = song.transition.style === 'altar';
    return `<button class="transition ${isAltar ? 'altar' : ''}" data-action="edit-transition" data-song-id="${song.id}">
      ${isAltar
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L14 8H20L15 12L17 18L12 14L7 18L9 12L4 8H10L12 2Z"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M7 17L17 7M17 7H9M17 7V15"/></svg>`}
      ${escapeHtml(song.transition.label)}
    </button>`;
  }
  return `<button class="add-transition" data-action="add-transition" data-song-id="${song.id}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Add Transition</button>`;
}

function renderLinkBtn(song, platform) {
  const url = getLink(song, platform);
  const isSet = !!url;
  const icon = platform === 'spotify' ? SVG_SPOTIFY : SVG_YOUTUBE;
  const labelName = platform === 'spotify' ? 'Spotify' : 'YouTube';
  const ariaLabel = isSet ? `Open in ${labelName}` : `Add ${labelName} link`;
  return `<div class="link-btn-wrap">
    <button class="link-btn ${platform} ${isSet ? 'set' : ''}" data-action="link-tap" data-platform="${platform}" data-song-id="${song.id}" aria-label="${ariaLabel}" title="${ariaLabel}">${icon}</button>
    ${isSet ? `<button class="link-edit-overlay" data-action="link-edit" data-platform="${platform}" data-song-id="${song.id}" aria-label="Edit ${labelName} link">${SVG_PEN}</button>` : ''}
  </div>`;
}

function renderChordSheetText(text) {
  return escapeHtml(text)
    .replace(/^\[([^\]]+)\]/gm, '<span class="section">$1</span>')
    .replace(/^([A-G][b♭#♯]?(?:m|maj|min|sus|aug|dim|add)?\d?(?:\/[A-G][b♭#♯]?)?(\s+[A-G][b♭#♯]?(?:m|maj|min|sus|aug|dim|add)?\d?(?:\/[A-G][b♭#♯]?)?)*)\s*$/gm, '<span class="chord">$1</span>');
}

// PCO stores chord charts in ChordPro-ish formats: inline [G] brackets inside
// lyric lines, plus {directive} lines for sections/metadata. Our renderer
// expects chord lines above lyric lines, so flatten on import.
function normalizeChordChart(text) {
  if (!text || typeof text !== 'string') return '';
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const dir = raw.match(/^\s*\{([a-z_]+)(?:\s*:\s*(.*?))?\s*\}\s*$/i);
    if (dir) {
      const key = dir[1].toLowerCase();
      const val = (dir[2] || '').trim();
      if (key === 'soc' || key === 'start_of_chorus') { out.push('[Chorus]'); continue; }
      if (key === 'sov' || key === 'start_of_verse')  { out.push('[Verse]');  continue; }
      if (key === 'sob' || key === 'start_of_bridge') { out.push('[Bridge]'); continue; }
      if (key === 'c' || key === 'ci' || key === 'comment' || key === 'comment_italic') {
        if (val) out.push(`[${val}]`);
        continue;
      }
      continue; // swallow end_of_*, title, artist, key, tempo, etc.
    }
    const hasInlineChord = /\[[A-G][^\]]*\]/.test(raw);
    const isSectionBracket = /^\s*\[[^\]]+\]\s*$/.test(raw);
    if (hasInlineChord && !isSectionBracket) {
      let chordLine = '';
      let lyricLine = '';
      const re = /\[([^\]]+)\]/g;
      let last = 0, m;
      while ((m = re.exec(raw)) !== null) {
        const before = raw.slice(last, m.index);
        lyricLine += before;
        while (chordLine.length < lyricLine.length) chordLine += ' ';
        chordLine += m[1];
        last = re.lastIndex;
      }
      lyricLine += raw.slice(last);
      if (chordLine.trim()) out.push(chordLine.replace(/\s+$/, ''));
      if (lyricLine.trim()) out.push(lyricLine);
      if (!chordLine.trim() && !lyricLine.trim()) out.push('');
      continue;
    }
    out.push(raw);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const CHORD_LINE_RE = /^\s*[A-G][b♭#♯]?(?:m|maj|min|sus|aug|dim|add)?\d?(?:\/[A-G][b♭#♯]?)?(\s+[A-G][b♭#♯]?(?:m|maj|min|sus|aug|dim|add)?\d?(?:\/[A-G][b♭#♯]?)?)*\s*$/;
function chartHasChords(text) {
  if (!text) return false;
  return text.split(/\r?\n/).some((l) => CHORD_LINE_RE.test(l));
}

// ---- Transposition ----
const NOTE_TO_SEMI = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11,
};
const SEMI_TO_SHARP = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const SEMI_TO_FLAT  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const FLAT_KEY_ROOTS  = new Set(['F','Bb','Eb','Ab','Db','Gb','Cb','Dm','Gm','Cm','Fm','Bbm','Ebm','Abm']);
const SHARP_KEY_ROOTS = new Set(['G','D','A','E','B','F#','C#','Em','Bm','F#m','C#m','G#m','D#m','A#m']);

function asciiKey(k) {
  return String(k || '').trim().replace(/[♯]/g, '#').replace(/[♭]/g, 'b');
}
function rootOfKey(k) {
  const s = asciiKey(k);
  const m = s.match(/^([A-G][#b]?)/);
  return m ? m[1] : null;
}
function keyAccidentalPref(k) {
  const s = asciiKey(k);
  if (FLAT_KEY_ROOTS.has(s)) return 'flat';
  if (SHARP_KEY_ROOTS.has(s)) return 'sharp';
  const root = rootOfKey(s);
  if (root && root.includes('b')) return 'flat';
  if (root && root.includes('#')) return 'sharp';
  return 'sharp';
}
function semiDeltaBetween(fromKey, toKey) {
  const f = NOTE_TO_SEMI[rootOfKey(fromKey)];
  const t = NOTE_TO_SEMI[rootOfKey(toKey)];
  if (f == null || t == null) return null;
  return ((t - f) % 12 + 12) % 12;
}
function transposeNote(noteAscii, delta, pref) {
  const semi = NOTE_TO_SEMI[noteAscii];
  if (semi == null) return noteAscii;
  const next = ((semi + delta) % 12 + 12) % 12;
  return (pref === 'flat' ? SEMI_TO_FLAT : SEMI_TO_SHARP)[next];
}

// Transpose only lines that look like chord lines. Lyric and section lines are
// left untouched so we never accidentally mutate lyrics that share a letter
// with a note name (e.g. lines starting with "A" or "Be").
function transposeChart(text, fromKey, toKey) {
  if (!text || !fromKey || !toKey) return text;
  const delta = semiDeltaBetween(fromKey, toKey);
  if (delta == null || delta === 0) return text;
  const pref = keyAccidentalPref(toKey);

  const chordTokenRE = /([A-G][#b♯♭]?)([a-zA-Z0-9°øΔ+()]*)(\/([A-G][#b♯♭]?))?/g;

  return text.split('\n').map((line) => {
    if (!CHORD_LINE_RE.test(line)) return line;
    return line.replace(chordTokenRE, (match, root, quality, slashGroup, bass) => {
      const r = transposeNote(asciiKey(root), delta, pref);
      const b = bass ? '/' + transposeNote(asciiKey(bass), delta, pref) : '';
      return r + (quality || '') + b;
    });
  }).join('\n');
}

function renderChordsView(song) {
  const chordText = song.chords?.[song.keyOf];
  const editing = chordEdit.editing.has(song.id);
  if (!chordText && !editing) {
    return `<div class="chords-pane"><div class="chords-empty">
      <div class="icon">${SVG_CHORDS}</div>
      <div class="msg">No chord chart yet for the key of <strong style="color:var(--gold)">${escapeHtml(song.keyOf)}</strong>. Pull the real chart from your PCO library, or generate one with AI.</div>
      <div style="display:flex;flex-direction:column;gap:.5rem;align-items:center">
        <button class="chords-gen-btn" data-action="import-pco-chords" data-song-id="${song.id}">
          <span style="display:inline-flex;width:14px;height:14px">${SVG_CROSS}</span>
          Import from PCO
        </button>
        <button class="chords-gen-btn" data-action="gen-chords" data-song-id="${song.id}" style="background:transparent;border:1px solid var(--line);color:var(--ink-mute)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/><path d="M11.5 8.5L9 11l4 4 2.5-2.5"/><circle cx="12" cy="12" r="9"/></svg>
          Generate with AI
        </button>
      </div>
    </div></div>`;
  }
  const text = chordText || '';
  const status = chordEdit.status.get(song.id) || '';
  const statusLabels = { saving: 'Saving…', saved: 'Saved', error: 'Save error' };
  const statusColor = status === 'error' ? 'var(--danger)' : status === 'saved' ? 'var(--sage)' : 'var(--ink-mute)';
  return `<div class="chords-pane">
    <div class="chords-meta">
      <div class="chords-key-pill">Key of ${escapeHtml(song.keyOf)}</div>
      <div class="chords-actions">
        <span class="chord-save-indicator" id="chord-save-${song.id}" style="font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.18em;text-transform:uppercase;color:${statusColor}">${statusLabels[status] || ''}</span>
        <button class="chords-action-btn" data-action="toggle-chord-edit" data-song-id="${song.id}" aria-label="${editing ? 'Done editing' : 'Edit chord sheet'}" title="${editing ? 'Done editing' : 'Edit chord sheet'}">${SVG_PEN} ${editing ? 'Done' : 'Edit'}</button>
        ${!editing ? `<button class="chords-action-btn" data-action="import-pco-chords" data-song-id="${song.id}" title="Replace with chart from PCO"><span style="display:inline-flex;width:12px;height:12px">${SVG_CROSS}</span> PCO</button>` : ''}
        ${!editing ? `<button class="chords-action-btn" data-action="gen-chords" data-song-id="${song.id}" data-force="1">${SVG_REFRESH} Regenerate</button>` : ''}
      </div>
    </div>
    ${editing
      ? `<textarea class="chord-edit-area" id="chord-edit-${song.id}" data-song-id="${song.id}" spellcheck="false" style="width:100%;box-sizing:border-box;min-height:300px;padding:1rem;background:var(--bg-2);border:1px solid var(--gold);border-radius:10px;color:var(--ink);font-family:'JetBrains Mono',monospace;font-size:.78rem;line-height:1.7;resize:vertical;outline:none">${escapeHtml(text)}</textarea>`
      : `<div class="chord-sheet">${renderChordSheetText(text)}</div>`
    }
    <div class="chord-disclaimer">AI-generated · verify with your chord chart before service</div>
  </div>`;
}

function renderSong(song, index) {
  const num = String(index + 1).padStart(2, '0');
  const artistHtml = song.artist
    ? `<div class="song-artist" data-action="edit-artist" data-song-id="${song.id}">${escapeHtml(song.artist)}</div>`
    : `<div class="song-artist placeholder" data-action="edit-artist" data-song-id="${song.id}">Add artist…</div>`;
  const bpmDisplay = song.bpm ? `${song.bpm}<span class="unit">BPM</span>` : `<span class="empty">— BPM</span>`;
  const view = song.view || 'flow';

  return `<div class="song-block" data-song-id="${song.id}">
    ${renderTransitionArea(song, index === 0)}
    <section class="song" id="song-${song.id}">
      <div class="song-grip" aria-label="Drag song"><svg viewBox="0 0 26 5" fill="currentColor"><circle cx="9" cy="2.5" r="1.4"/><circle cx="13" cy="2.5" r="1.4"/><circle cx="17" cy="2.5" r="1.4"/></svg></div>
      <div class="song-head">
        <button class="song-del" data-action="delete-song" data-song-id="${song.id}" aria-label="Delete song" title="Delete song">${SVG_TRASH}</button>
        <div class="song-num">${num}</div>
        <h2 class="song-title" data-action="edit-title" data-song-id="${song.id}">${escapeHtml(song.title)}</h2>
        ${artistHtml}
        <div class="song-stats">
          <div class="stat"><span class="stat-label">Key</span><button class="stat-btn" data-action="edit-key" data-song-id="${song.id}">${escapeHtml(song.keyOf)}</button></div>
          <div class="stat"><span class="stat-label">Tempo</span><button class="stat-btn" data-action="edit-bpm" data-song-id="${song.id}">${bpmDisplay}</button></div>
          <div class="stat stat-links">
            <span class="stat-label">Listen</span>
            <div class="link-row">${renderLinkBtn(song, 'spotify')}${renderLinkBtn(song, 'youtube')}</div>
          </div>
        </div>
      </div>
      <div class="view-tabs">
        <button class="view-tab ${view === 'flow' ? 'active' : ''}" data-action="set-view" data-view="flow" data-song-id="${song.id}">${SVG_FLOW} Flow</button>
        <button class="view-tab ${view === 'chords' ? 'active' : ''}" data-action="set-view" data-view="chords" data-song-id="${song.id}">${SVG_CHORDS} Chords</button>
      </div>
      <div class="song-views" data-song-id="${song.id}">
        <div class="song-view view-flow" data-view="flow">
          <ol class="flow" data-song-id="${song.id}">
            ${song.flow.map((r, i) => renderFlowRow(r, i)).join('')}
          </ol>
          <button class="add-row" data-action="add-section" data-song-id="${song.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Add Section
          </button>
        </div>
        <div class="song-view view-chords" data-view="chords">
          ${renderChordsView(song)}
        </div>
      </div>
    </section>
  </div>`;
}

function render() {
  const app = document.getElementById('app');
  if (!state) { app.innerHTML = ''; return; }
  const keys = state.songs.map((s) => s.keyOf).join(' → ') || '—';
  const bpms = state.songs.map((s) => s.bpm).filter((b) => b && b > 0);
  const tempoRange = bpms.length === 0 ? null
    : bpms.length === 1 || Math.min(...bpms) === Math.max(...bpms) ? `${bpms[0]} BPM`
    : `${Math.min(...bpms)}–${Math.max(...bpms)} BPM`;
  const setCount = summaries.length || 1;

  app.innerHTML = `
    <div class="topbar">
      <button class="lib-btn" data-action="open-library">${SVG_LIBRARY} Setlists <span class="count">${setCount}</span></button>
      <div style="display:flex;gap:.4rem;align-items:center">
        <span id="save-dot" style="font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute)"></span>
        <button class="header-btn" data-action="share" title="Share view-only link" aria-label="Share view-only link">${SVG_SHARE}</button>
        <button class="header-btn" data-action="signout" title="Sign out" aria-label="Sign out">${SVG_SIGNOUT}</button>
      </div>
    </div>
    <header>
      <div class="kicker"><span class="dot"></span><span class="editable" data-action="edit-name">${escapeHtml(state.name)}</span> · Setlist</div>
      <div class="date-row">
        <div class="date-btn-wrap">
          <span class="date-display">${SVG_CAL} ${escapeHtml(formatDate(state.date))}</span>
          <input type="date" class="date-input-overlay" id="date-input" value="${state.date || ''}">
        </div>
      </div>
      <h1>Song <em>Flow</em></h1>
      <div class="meta">
        <span><strong>${String(state.songs.length).padStart(2, '0')}</strong> Songs</span>
        <span>Keys · <strong>${escapeHtml(keys)}</strong></span>
        ${tempoRange ? `<span>Tempo · <strong>${escapeHtml(tempoRange)}</strong></span>` : ''}
      </div>
    </header>
    <div id="songs-list">${state.songs.map(renderSong).join('')}</div>
    <button class="add-song-btn" data-action="add-song"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Add Song</button>
    <nav class="nav-dots" aria-label="Jump">
      ${state.songs.length ? '<span>Jump</span>' : ''}
      ${state.songs.map((s, i) => `<a href="#song-${s.id}" data-sid="${s.id}" class="${i === 0 ? 'active' : ''}" aria-label="Song ${i + 1}"></a>`).join('')}
    </nav>
    <footer><span class="divider"></span>Tap to edit · Swipe Flow ↔ Chords · Drag handles to reorder</footer>
  `;

  document.getElementById('date-input').addEventListener('change', (e) => {
    state.date = e.target.value || todayISO();
    saveState(); render();
    showToast(`Date set · ${formatDate(state.date)}`);
  });

  renderSaveDot();
  initSortables();
  initObserver();
  initSongViews();
}

function renderSaveDot() {
  const el = document.getElementById('save-dot');
  if (!el) return;
  const labels = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save error' };
  el.textContent = labels[saveStatus] || '';
  el.style.color = saveStatus === 'error' ? 'var(--danger)' : saveStatus === 'saved' ? 'var(--sage)' : 'var(--ink-mute)';
}

// ---------- Sortable ----------
function initSortables() {
  document.querySelectorAll('.flow').forEach((list) => {
    Sortable.create(list, {
      handle: '.drag-handle', animation: 180,
      ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen', dragClass: 'sortable-drag',
      onEnd: () => {
        const songId = list.dataset.songId;
        const song = findSong(songId); if (!song) return;
        const newIds = [...list.querySelectorAll('[data-row-id]')].map((el) => el.dataset.rowId);
        song.flow.sort((a, b) => newIds.indexOf(a.id) - newIds.indexOf(b.id));
        [...list.querySelectorAll('.flow-row')].forEach((el, i) => { el.querySelector('.flow-idx').textContent = String(i + 1).padStart(2, '0'); });
        saveState();
      },
    });
  });
  const songsList = document.getElementById('songs-list');
  if (songsList) {
    Sortable.create(songsList, {
      handle: '.song-grip', animation: 220,
      ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen', dragClass: 'sortable-drag',
      onEnd: () => {
        const newIds = [...songsList.querySelectorAll('[data-song-id]')].map((el) => el.dataset.songId);
        state.songs.sort((a, b) => newIds.indexOf(a.id) - newIds.indexOf(b.id));
        saveState(); render();
      },
    });
  }
}

function initObserver() {
  const songs = document.querySelectorAll('.song');
  const dots = document.querySelectorAll('.nav-dots a');
  if (!songs.length || !dots.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const sid = e.target.id.replace('song-', '');
        dots.forEach((d) => d.classList.toggle('active', d.dataset.sid === sid));
      }
    });
  }, { threshold: 0.4 });
  songs.forEach((s) => io.observe(s));
}

// Flow and Chords panes sit side-by-side in a horizontal scroll container for
// the swipe gesture. Without this, the container takes the height of the
// TALLEST pane (chord chart) even when the user is looking at Flow, leaving a
// giant blank gap under short flow lists. Sync the container's height to the
// currently-active pane's natural height instead.
function syncSongViewHeight(views) {
  if (!views) return;
  const songId = views.dataset.songId;
  const song = findSong(songId); if (!song) return;
  const view = song.view || 'flow';
  const active = views.querySelector(`.song-view.view-${view}`);
  if (active) views.style.height = active.scrollHeight + 'px';
}
function syncAllSongViewHeights() {
  document.querySelectorAll('.song-views').forEach(syncSongViewHeight);
}
const songViewResizeObserver = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver((entries) => {
      const seen = new Set();
      entries.forEach((e) => {
        const views = e.target.closest('.song-views');
        if (views && !seen.has(views)) { seen.add(views); syncSongViewHeight(views); }
      });
    })
  : null;

function initSongViews() {
  if (songViewResizeObserver) songViewResizeObserver.disconnect();
  document.querySelectorAll('.song-views').forEach((views) => {
    const songId = views.dataset.songId;
    const song = findSong(songId); if (!song) return;
    requestAnimationFrame(() => {
      const target = views.querySelector(`[data-view="${song.view || 'flow'}"]`);
      if (target) views.scrollLeft = target.offsetLeft;
      syncSongViewHeight(views);
    });
    if (songViewResizeObserver) {
      views.querySelectorAll('.song-view').forEach((pane) => songViewResizeObserver.observe(pane));
    }
    let scrollT;
    views.addEventListener('scroll', () => {
      clearTimeout(scrollT);
      scrollT = setTimeout(() => {
        const w = views.clientWidth;
        const idx = Math.round(views.scrollLeft / w);
        const newView = idx === 0 ? 'flow' : 'chords';
        if (song.view !== newView) {
          song.view = newView;
          const songEl = views.closest('.song');
          songEl.querySelectorAll('.view-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === newView));
          saveState();
          syncSongViewHeight(views);
        }
      }, 120);
    });
  });
}

function setSongView(songId, view) {
  const song = findSong(songId); if (!song) return;
  song.view = view;
  const views = document.querySelector(`.song-views[data-song-id="${songId}"]`);
  if (views) {
    const target = views.querySelector(`[data-view="${view}"]`);
    if (target) views.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    syncSongViewHeight(views);
  }
  document.querySelectorAll(`#song-${songId} .view-tab`).forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  saveState();
}

// ---------- Inline edit ----------
function startInlineEdit(el, currentValue, onSave) {
  el.textContent = currentValue;
  el.classList.remove('placeholder');
  el.setAttribute('contenteditable', 'true');
  el.focus();
  const range = document.createRange(); range.selectNodeContents(el);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  let cancelled = false;
  const finish = () => {
    el.removeAttribute('contenteditable');
    el.removeEventListener('keydown', onKey);
    if (cancelled) return;
    onSave(el.textContent.trim() || null);
    saveState(); render();
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelled = true; el.textContent = currentValue; el.blur(); }
  };
  el.addEventListener('blur', finish, { once: true });
  el.addEventListener('keydown', onKey);
}

// ---------- Mutations ----------
function deleteRow(songId, rowId) {
  const song = findSong(songId); if (!song) return;
  const idx = song.flow.findIndex((r) => r.id === rowId); if (idx < 0) return;
  const removed = song.flow.splice(idx, 1)[0];
  saveState(); render();
  showToast(`Removed ${removed.label}`);
}
function cycleType(songId, rowId) {
  const song = findSong(songId);
  const item = song.flow.find((r) => r.id === rowId); if (!item) return;
  const i = SECTION_TYPES.findIndex((t) => t.type === item.type);
  item.type = SECTION_TYPES[(i + 1) % SECTION_TYPES.length].type;
  saveState(); render();
}
function addSection(songId, type) {
  const song = findSong(songId); if (!song) return;
  const def = SECTION_TYPES.find((t) => t.type === type);
  const existing = song.flow.filter((r) => r.type === type).length;
  let label = def.label;
  if (['verse', 'bridge', 'tag'].includes(type) && existing >= 1) label = `${def.label} ${existing + 1}`;
  song.flow.push({ id: uid(), type, label });
  saveState(); render();
  showToast(`Added ${label}`);
}
function addBlankSong() {
  const newSong = { id: uid(), title: 'New Song', artist: null, keyOf: 'C', bpm: null, flow: [], chords: {}, view: 'flow' };
  state.songs.push(newSong);
  saveState(); render();
  showToast('Song added');
  setTimeout(() => { document.getElementById(`song-${newSong.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
}
function addSongFromPreset(result, sourceUrl) {
  const flow = (result.flow || []).filter((f) => f && VALID_TYPES.includes(f.type)).map((f) => ({
    id: uid(), type: f.type, label: f.label || (TAG_LABEL[f.type] || 'Section'),
  }));
  const keyOf = result.originalKey || 'C';
  const chords = {};
  const normalizedChart = normalizeChordChart(result.chordChart || '');
  if (normalizedChart) chords[keyOf] = normalizedChart;
  const newSong = {
    id: uid(), title: result.title || 'New Song', artist: result.artist || null,
    keyOf, bpm: result.bpm || null,
    flow, chords, view: 'flow',
  };
  if (sourceUrl) {
    if (sourceUrl.includes('spotify.com')) newSong.spotifyUrl = sourceUrl;
    else if (sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be')) newSong.youtubeUrl = sourceUrl;
  }
  if (result.spotifyUrl && !newSong.spotifyUrl) newSong.spotifyUrl = result.spotifyUrl;
  if (result.youtubeUrl && !newSong.youtubeUrl) newSong.youtubeUrl = result.youtubeUrl;
  state.songs.push(newSong);
  saveState(); render();
  if (chords[keyOf]) {
    saveChordSheet(newSong.id, keyOf, chords[keyOf]).catch((e) => console.error('[song-flow] chord save failed', e));
  }
  showToast(`${newSong.title} added`);
  setTimeout(() => { document.getElementById(`song-${newSong.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
}

function confirmDeleteSong(songId) {
  const song = findSong(songId); if (!song) return;
  setSheet(`
    <div class="sheet-title">Delete Song</div>
    <div class="sheet-sub">This can't be undone</div>
    <p class="sheet-text">Remove <strong style="color:var(--ink)">${escapeHtml(song.title)}</strong> from this setlist?</p>
    <div class="sheet-actions">
      <button class="sheet-cancel" data-close>Cancel</button>
      <button class="sheet-danger" id="confirm-del">Delete</button>
    </div>
  `);
  document.getElementById('confirm-del').addEventListener('click', () => {
    const idx = songIndex(songId);
    if (idx >= 0) state.songs.splice(idx, 1);
    saveState(); render(); closeSheet();
    showToast(`Removed ${song.title}`);
  });
  openSheetEl();
}

// ---------- Library ----------
async function openLibrarySheet() {
  await refreshSummaries();
  setSheet(renderLibrarySheetHTML({ summaries, currentId: state?.id }));
  openSheetEl();
}

async function createNewSetlist() {
  try {
    const created = await createSetlist(user.id, { name: 'New Setlist', date: todayISO() });
    state = created;
    normalizeState();
    await refreshSummaries();
    render(); closeSheet();
    showToast('New setlist created');
  } catch (e) {
    showToast('Could not create setlist');
    console.error(e);
  }
}

async function loadSetlistById(setId) {
  try {
    await flushSave(); // ensure the previous setlist is fully saved first
    state = await loadSetlist(setId);
    normalizeState();
    render(); closeSheet();
    showToast(`Loaded · ${state.name}`);
  } catch (e) {
    showToast('Could not load setlist');
    console.error(e);
  }
}

async function duplicateSetlistById(setId) {
  try {
    const copy = await duplicateSetlist(user.id, setId);
    await refreshSummaries();
    showToast(`Duplicated · ${copy.name}`);
    await openLibrarySheet();
  } catch (e) {
    showToast('Duplicate failed');
    console.error(e);
  }
}

function confirmDeleteSetlistById(setId) {
  const set = summaries.find((s) => s.id === setId); if (!set) return;
  setSheet(`
    <div class="sheet-title">Delete Setlist</div>
    <div class="sheet-sub">${escapeHtml(set.name)} · ${escapeHtml(formatDate(set.date))}</div>
    <p class="sheet-text">Permanently delete this setlist and all ${set.songCount || 0} of its songs? This can't be undone.</p>
    <div class="sheet-actions">
      <button class="sheet-cancel" data-close>Cancel</button>
      <button class="sheet-danger" id="confirm-set-del">Delete</button>
    </div>
  `);
  document.getElementById('confirm-set-del').addEventListener('click', async () => {
    try {
      await deleteSetlist(setId);
      await refreshSummaries();
      if (state?.id === setId) {
        if (summaries.length) {
          state = await loadSetlist(summaries[0].id);
          normalizeState();
        } else {
          const created = await createSetlist(user.id, { name: 'New Setlist', date: todayISO() });
          state = created; normalizeState();
          await refreshSummaries();
        }
      }
      render();
      showToast('Setlist deleted');
      setTimeout(openLibrarySheet, 100);
    } catch (e) {
      showToast('Delete failed');
      console.error(e);
    }
  });
  openSheetEl();
}

async function renameSetlistInline(setId) {
  const set = summaries.find((s) => s.id === setId); if (!set) return;
  const newName = prompt('Setlist name:', set.name);
  if (newName == null) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  try {
    await renameSetlist(setId, trimmed);
    if (state?.id === setId) { state.name = trimmed; render(); }
    await refreshSummaries();
    await openLibrarySheet();
    showToast('Renamed');
  } catch (e) {
    showToast('Rename failed');
    console.error(e);
  }
}

// ---------- Sheets ----------
function setSheet(html) { document.getElementById('sheet-body').innerHTML = html; }
function openSheetEl() {
  document.getElementById('sheet').classList.add('open');
  document.getElementById('backdrop').classList.add('open');
}
function closeSheet() {
  document.getElementById('sheet').classList.remove('open');
  document.getElementById('backdrop').classList.remove('open');
}

function openSectionSheet(songId) {
  const song = findSong(songId);
  let added = 0;
  const renderSubText = () => added === 0
    ? `Tap a type to add · Repeat freely · Close when done`
    : `${added} added · Tap more or close`;
  setSheet(`
    <div class="sheet-title">Add to ${escapeHtml(song?.title || '')}</div>
    <div class="sheet-sub" id="add-sub">${renderSubText()}</div>
    <div class="type-grid">
      ${SECTION_TYPES.map((t) => `<button class="type-btn" data-type="${t.type}"><span class="swatch" style="background:${t.swatch}"></span>${t.label}</button>`).join('')}
    </div>
    <button class="sheet-cancel" data-close>Done</button>
  `);
  document.querySelectorAll('#sheet-body .type-btn').forEach((b) => {
    b.addEventListener('click', () => {
      addSection(songId, b.dataset.type);
      added++;
      const sub = document.getElementById('add-sub');
      if (sub) sub.textContent = renderSubText();
    });
  });
  openSheetEl();
}

function openKeySheet(songId) {
  const song = findSong(songId); if (!song) return;
  setSheet(`
    <div class="sheet-title">Change Key</div>
    <div class="sheet-sub">${escapeHtml(song.title)}</div>
    <div class="type-grid">
      ${KEYS_LIST.map((k) => `<button class="type-btn key-btn${k === song.keyOf ? ' active' : ''}" data-key="${escapeHtml(k)}">${escapeHtml(k)}</button>`).join('')}
    </div>
    <button class="sheet-cancel" data-close>Cancel</button>
  `);
  document.querySelectorAll('#sheet-body .key-btn').forEach((b) => {
    b.addEventListener('click', () => {
      song.keyOf = b.dataset.key;
      saveState(); render(); closeSheet();
      showToast(`${song.title} · Key ${b.dataset.key}`);
    });
  });
  openSheetEl();
}

function openBpmSheet(songId) {
  const song = findSong(songId); if (!song) return;
  let bpm = song.bpm || 100;
  const updateDisplay = () => { const d = document.getElementById('bpm-display'); if (d) d.innerHTML = `${bpm}<span class="unit">BPM</span>`; };
  setSheet(`
    <div class="sheet-title">Tempo</div>
    <div class="sheet-sub">${escapeHtml(song.title)}</div>
    <div class="bpm-display" id="bpm-display">${bpm}<span class="unit">BPM</span></div>
    <div class="bpm-controls">
      <button class="bpm-btn" data-delta="-10">−10</button><button class="bpm-btn" data-delta="-5">−5</button>
      <button class="bpm-btn" data-delta="-1">−1</button><button class="bpm-btn" data-delta="1">+1</button>
      <button class="bpm-btn" data-delta="5">+5</button><button class="bpm-btn" data-delta="10">+10</button>
    </div>
    <input class="field-input" id="bpm-input" type="number" min="40" max="240" value="${bpm}" inputmode="numeric">
    <div class="sheet-actions">
      <button class="sheet-cancel" data-close>Cancel</button>
      <button class="sheet-save" id="bpm-save">Save</button>
    </div>
  `);
  document.querySelectorAll('#sheet-body .bpm-btn').forEach((b) => {
    b.addEventListener('click', () => { bpm = Math.max(40, Math.min(240, bpm + parseInt(b.dataset.delta, 10))); document.getElementById('bpm-input').value = bpm; updateDisplay(); });
  });
  document.getElementById('bpm-input').addEventListener('input', (e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) { bpm = Math.max(40, Math.min(240, v)); updateDisplay(); } });
  document.getElementById('bpm-save').addEventListener('click', () => {
    song.bpm = bpm; saveState(); render(); closeSheet();
    showToast(`${song.title} · ${bpm} BPM`);
  });
  openSheetEl();
}

function openTransitionSheet(songId, isAdd) {
  const idx = songIndex(songId);
  const song = state.songs[idx]; const prev = state.songs[idx - 1];
  if (!song || !prev) return;
  const t = song.transition || { label: '', style: 'default' };
  setSheet(`
    <div class="sheet-title">${isAdd ? 'Add Transition' : 'Edit Transition'}</div>
    <div class="sheet-sub">Between ${escapeHtml(prev.title)} → ${escapeHtml(song.title)}</div>
    <label class="field-label">Label</label>
    <input class="field-input" id="t-label" type="text" value="${escapeHtml(t.label)}" placeholder="e.g. Straight In · No Gap" maxlength="60">
    <label class="field-label">Style</label>
    <div class="style-row">
      <button class="style-btn ${t.style === 'default' ? 'active' : ''}" data-style="default"><span class="dot"></span>Default</button>
      <button class="style-btn ${t.style === 'altar' ? 'active' : ''}" data-style="altar"><span class="dot"></span>Altar Call</button>
    </div>
    ${!isAdd ? `<button class="sheet-delete" id="t-delete">Delete Transition</button>` : ''}
    <div class="sheet-actions">
      <button class="sheet-cancel" data-close>Cancel</button>
      <button class="sheet-save" id="t-save">Save</button>
    </div>
  `);
  let chosenStyle = t.style;
  document.querySelectorAll('#sheet-body .style-btn').forEach((b) => {
    b.addEventListener('click', () => { chosenStyle = b.dataset.style; document.querySelectorAll('#sheet-body .style-btn').forEach((x) => x.classList.toggle('active', x === b)); });
  });
  document.getElementById('t-save').addEventListener('click', () => {
    const label = document.getElementById('t-label').value.trim();
    if (!label) { showToast('Label required'); return; }
    song.transition = { label, style: chosenStyle };
    saveState(); render(); closeSheet();
    showToast(isAdd ? 'Transition added' : 'Transition updated');
  });
  if (!isAdd) {
    document.getElementById('t-delete').addEventListener('click', () => {
      delete song.transition; saveState(); render(); closeSheet();
      showToast('Transition removed');
    });
  }
  openSheetEl();
}

function openLinkSheet(songId, platform) {
  const song = findSong(songId); if (!song) return;
  const url = getLink(song, platform);
  const labelName = platform === 'spotify' ? 'Spotify' : 'YouTube';
  const placeholder = platform === 'spotify' ? 'https://open.spotify.com/track/…' : 'https://www.youtube.com/watch?v=…';
  const icon = platform === 'spotify' ? SVG_SPOTIFY : SVG_YOUTUBE;
  setSheet(`
    <div class="sheet-title">${labelName} Link</div>
    <div class="sheet-sub">${escapeHtml(song.title)}</div>
    ${url ? `<a class="link-open-btn ${platform}" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon}Open in ${labelName} ${SVG_OPEN}</a>` : ''}
    <label class="field-label">${url ? 'Edit URL' : 'Paste URL'}</label>
    <input class="field-input" id="link-input" type="url" value="${escapeHtml(url || '')}" placeholder="${placeholder}" inputmode="url" autocomplete="off">
    ${url ? `<button class="sheet-delete" id="link-remove">Remove Link</button>` : ''}
    <div class="sheet-actions">
      <button class="sheet-cancel" data-close>Cancel</button>
      <button class="sheet-save" id="link-save">Save</button>
    </div>
  `);
  document.getElementById('link-save').addEventListener('click', () => {
    const newUrl = document.getElementById('link-input').value.trim();
    setLink(song, platform, newUrl || null);
    saveState(); render(); closeSheet();
    showToast(newUrl ? `${labelName} link saved` : `${labelName} link removed`);
  });
  if (url) {
    document.getElementById('link-remove').addEventListener('click', () => {
      setLink(song, platform, null); saveState(); render(); closeSheet();
      showToast(`${labelName} link removed`);
    });
  }
  openSheetEl();
  setTimeout(() => document.getElementById('link-input')?.focus(), 200);
}

// ---------- Add song / AI search ----------
const SVG_CROSS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4v16M7 10h10"/></svg>`;
let pcoCachedResults = [];

function openAddSongSheet() {
  const tabBarStyle = 'display:flex;gap:.35rem;border-bottom:1px solid var(--line);margin:-.25rem 0 1rem;padding-bottom:0';
  const tabStyle = 'flex:1;padding:.65rem .5rem;background:transparent;border:none;color:var(--ink-mute);font-family:\'JetBrains Mono\',monospace;font-size:.68rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.4rem;position:relative;transition:color .15s';
  setSheet(`
    <div class="sheet-title">Add Song</div>
    <div class="sheet-sub" id="add-sub">Search the web, your PCO library, or add a blank song</div>
    <div class="add-tabs" style="${tabBarStyle}">
      <button class="add-tab active" data-add-tab="search" style="${tabStyle};color:var(--gold)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="width:11px;height:11px"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
        Search
      </button>
      <button class="add-tab" data-add-tab="pco" style="${tabStyle}">
        <span style="display:inline-flex;width:11px;height:11px">${SVG_CROSS}</span>
        PCO
      </button>
      <button class="add-tab" data-add-tab="manual" style="${tabStyle}">
        Manual
      </button>
    </div>

    <div class="add-pane" data-pane="search">
      <div class="search-row">
        <input class="field-input" id="song-search" type="text" placeholder="e.g. 'Abide UPPERROOM'…" autocomplete="off">
        <button class="search-btn" id="do-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>Find
        </button>
      </div>
      <div class="field-label" style="margin-top:.35rem">Or paste a Spotify or YouTube URL</div>
      <input class="field-input" id="song-url" type="url" placeholder="https://open.spotify.com/track/..." autocomplete="off" style="margin-bottom:0.75rem;font-size:.78rem">
      <div class="search-hint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        Auto-fills key, BPM & flow as a starting preset
      </div>
      <div id="search-result"></div>
    </div>

    <div class="add-pane" data-pane="pco" hidden>
      <div class="search-row">
        <input class="field-input" id="pco-search" type="text" placeholder="Search your PCO library…" autocomplete="off">
        <button class="search-btn" id="pco-do-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>Find
        </button>
      </div>
      <div class="search-hint">
        <span style="display:inline-flex;width:11px;height:11px;opacity:.7">${SVG_CROSS}</span>
        Pulls key & sequence from your default arrangement
      </div>
      <div id="pco-result"></div>
    </div>

    <div class="add-pane" data-pane="manual" hidden>
      <p class="sheet-text">Add a song with no details — fill in the title, key and flow yourself.</p>
      <button class="sheet-secondary" id="add-blank-btn">Add Blank Song</button>
    </div>

    <button class="sheet-cancel" data-close>Cancel</button>
  `);

  // Tab switching
  const panes = document.querySelectorAll('#sheet-body .add-pane');
  const tabs = document.querySelectorAll('#sheet-body .add-tab');
  const switchTab = (tab) => {
    tabs.forEach((t) => {
      const active = t.dataset.addTab === tab;
      t.classList.toggle('active', active);
      t.style.color = active ? 'var(--gold)' : 'var(--ink-mute)';
    });
    panes.forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    if (tab === 'search') setTimeout(() => document.getElementById('song-search')?.focus(), 60);
    if (tab === 'pco') setTimeout(() => document.getElementById('pco-search')?.focus(), 60);
  };
  tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.addTab)));

  // Search tab
  const input = document.getElementById('song-search');
  const urlInput = document.getElementById('song-url');
  const trigger = () => doSongSearch(input.value.trim());
  document.getElementById('do-search').addEventListener('click', trigger);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); trigger(); } });
  const tryUrl = () => {
    const raw = urlInput.value.trim();
    if (!raw) return;
    const link = parseStreamingUrl(raw);
    if (!link) return;
    doSongSearchByUrl(link);
  };
  urlInput.addEventListener('paste', () => { setTimeout(tryUrl, 0); });
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tryUrl(); } });
  urlInput.addEventListener('input', () => {
    const raw = urlInput.value.trim();
    if (parseStreamingUrl(raw)) tryUrl();
  });

  // PCO tab
  const pcoInput = document.getElementById('pco-search');
  const pcoTrigger = () => doPCOSearch(pcoInput.value.trim());
  document.getElementById('pco-do-search').addEventListener('click', pcoTrigger);
  pcoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pcoTrigger(); } });

  // Manual tab
  document.getElementById('add-blank-btn').addEventListener('click', () => { addBlankSong(); closeSheet(); });

  openSheetEl();
  setTimeout(() => input.focus(), 200);
}

async function doPCOSearch(rawQuery) {
  if (!rawQuery) return;
  const resultEl = document.getElementById('pco-result');
  resultEl.innerHTML = `<div class="search-loading"><span class="spinner"></span>Searching PCO…</div>`;
  try {
    const { results } = await searchPCO({ query: rawQuery });
    pcoCachedResults = Array.isArray(results) ? results : [];
    renderPCOResults(pcoCachedResults);
  } catch (e) {
    console.error(e);
    pcoCachedResults = [];
    resultEl.innerHTML = `<div class="search-empty">Couldn't reach PCO. Check your connection and try again.</div>`;
  }
}

function renderPCOResults(results) {
  const resultEl = document.getElementById('pco-result');
  if (!resultEl) return;
  if (!results || !results.length) {
    resultEl.innerHTML = `<div class="search-empty">No matches in your PCO library. Try a different name.</div>`;
    return;
  }
  resultEl.innerHTML = results.map((r, i) => {
    const sectionCount = (r.flow || []).length;
    return `
      <div class="song-preview" style="margin-bottom:.65rem">
        <div class="preview-top">
          <div class="preview-icon">${SVG_CROSS}</div>
          <div class="preview-meta">
            <div class="preview-title">${escapeHtml(r.title)}</div>
            <div class="preview-artist">${escapeHtml(r.artist || 'Unknown author')}</div>
            <div class="preview-stats">
              ${r.originalKey ? `<span class="pill">Key ${escapeHtml(r.originalKey)}</span>` : ''}
              ${r.bpm ? `<span class="pill">${r.bpm} BPM</span>` : ''}
              ${sectionCount ? `<span class="pill">${sectionCount} sections</span>` : `<span class="pill">No sequence</span>`}
            </div>
          </div>
        </div>
        <button class="preview-add" data-action="accept-pco" data-pco-idx="${i}">Add to Setlist</button>
      </div>`;
  }).join('');
}

function parseStreamingUrl(raw) {
  if (!raw) return null;
  const m = raw.match(/https?:\/\/[^\s]+/); if (!m) return null;
  const url = m[0];
  const spotifyTrack = url.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]+)/);
  if (spotifyTrack) return { type: 'spotify', url, id: spotifyTrack[1] };
  const ytLong = url.match(/youtube\.com\/watch\?[^#]*\bv=([A-Za-z0-9_-]{6,})/);
  if (ytLong) return { type: 'youtube', url, id: ytLong[1] };
  const ytShort = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (ytShort) return { type: 'youtube', url, id: ytShort[1] };
  return null;
}

async function doSongSearchByUrl(link) {
  const resultEl = document.getElementById('search-result');
  resultEl.innerHTML = `<div class="search-loading"><span class="spinner"></span>Reading link…</div>`;
  let context = link.url;
  const title = await fetchOembed({ type: link.type, url: link.url });
  if (title) context = title;
  resultEl.innerHTML = `<div class="search-loading"><span class="spinner"></span>Looking up song details…</div>`;
  try {
    const result = await searchSong({ query: context, sourceUrl: link.url });
    renderSearchResult(result, link.url);
  } catch (e) {
    console.error(e);
    resultEl.innerHTML = `<div class="search-empty">Couldn't reach the search service. Try again or add a blank song below.</div>`;
  }
}

function parseUrl(input) {
  const m = input.match(/https?:\/\/[^\s]+/); if (!m) return null;
  const url = m[0];
  if (url.includes('spotify.com')) return { type: 'spotify', url };
  if (url.includes('youtube.com') || url.includes('youtu.be')) return { type: 'youtube', url };
  return { type: 'other', url };
}

async function fetchOembed(linkInfo) {
  try {
    let oembedUrl;
    if (linkInfo.type === 'spotify') oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(linkInfo.url)}`;
    else if (linkInfo.type === 'youtube') oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(linkInfo.url)}&format=json`;
    else return null;
    const r = await fetch(oembedUrl);
    if (!r.ok) return null;
    const d = await r.json();
    return d.title || null;
  } catch { return null; }
}

async function doSongSearch(rawQuery) {
  if (!rawQuery) return;
  const resultEl = document.getElementById('search-result');
  resultEl.innerHTML = `<div class="search-loading"><span class="spinner"></span>Searching…</div>`;
  let context = rawQuery; let sourceUrl = null;
  const linkInfo = parseUrl(rawQuery);
  if (linkInfo) {
    sourceUrl = linkInfo.url;
    resultEl.innerHTML = `<div class="search-loading"><span class="spinner"></span>Reading link…</div>`;
    const title = await fetchOembed(linkInfo);
    if (title) context = title;
    resultEl.innerHTML = `<div class="search-loading"><span class="spinner"></span>Looking up song details…</div>`;
  }
  try {
    const result = await searchSong({ query: context, sourceUrl });
    renderSearchResult(result, sourceUrl);
  } catch (e) {
    console.error(e);
    resultEl.innerHTML = `<div class="search-empty">Couldn't reach the search service. Try again or add a blank song below.</div>`;
  }
}

function renderSearchResult(result, sourceUrl) {
  const resultEl = document.getElementById('search-result');
  if (!result || !result.found) {
    resultEl.innerHTML = `<div class="search-empty">No match found. Try a different name, or add a blank song below.</div>`;
    return;
  }
  const sectionCount = (result.flow || []).length;
  const spotifyUrl = (sourceUrl && sourceUrl.includes('spotify.com')) ? sourceUrl : (result.spotifyUrl || null);
  const youtubeUrl = (sourceUrl && (sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be'))) ? sourceUrl : (result.youtubeUrl || null);
  const openBtns = [
    spotifyUrl ? `<a class="link-open-btn spotify" href="${escapeHtml(spotifyUrl)}" target="_blank" rel="noopener" style="margin-bottom:.5rem">${SVG_SPOTIFY}Open in Spotify ${SVG_OPEN}</a>` : '',
    youtubeUrl ? `<a class="link-open-btn youtube" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener" style="margin-bottom:.5rem">${SVG_YOUTUBE}Open in YouTube ${SVG_OPEN}</a>` : '',
  ].filter(Boolean).join('');
  resultEl.innerHTML = `
    <div class="song-preview">
      <div class="preview-top">
        <div class="preview-icon">${SVG_CHORDS}</div>
        <div class="preview-meta">
          <div class="preview-title">${escapeHtml(result.title)}</div>
          <div class="preview-artist">${escapeHtml(result.artist || 'Unknown artist')}</div>
          <div class="preview-stats">
            ${result.originalKey ? `<span class="pill">Key ${escapeHtml(result.originalKey)}</span>` : ''}
            ${result.bpm ? `<span class="pill">${result.bpm} BPM</span>` : ''}
            ${sectionCount ? `<span class="pill">${sectionCount} sections</span>` : ''}
          </div>
        </div>
      </div>
      ${openBtns ? `<div class="preview-links" style="margin-top:.85rem">${openBtns}</div>` : ''}
      <button class="preview-add" id="accept-preset">Add to Setlist · Edit From Here</button>
    </div>`;
  document.getElementById('accept-preset').addEventListener('click', () => {
    addSongFromPreset(result, sourceUrl);
    closeSheet();
  });
}

// ---------- Chord editing ----------
function updateChordSaveIndicator(songId, status) {
  if (status) chordEdit.status.set(songId, status);
  else chordEdit.status.delete(songId);
  const el = document.getElementById(`chord-save-${songId}`);
  if (!el) return;
  const labels = { saving: 'Saving…', saved: 'Saved', error: 'Save error' };
  el.textContent = labels[status] || '';
  el.style.color = status === 'error' ? 'var(--danger)'
    : status === 'saved' ? 'var(--sage)'
    : 'var(--ink-mute)';
}

function scheduleChordSave(songId) {
  const song = findSong(songId); if (!song) return;
  updateChordSaveIndicator(songId, 'saving');
  const t = chordEdit.timers.get(songId);
  if (t) clearTimeout(t);
  const timeout = setTimeout(async () => {
    chordEdit.timers.delete(songId);
    const value = song.chords?.[song.keyOf] ?? '';
    try {
      await updateChordSheet(songId, song.keyOf, value);
      updateChordSaveIndicator(songId, 'saved');
      setTimeout(() => {
        if (chordEdit.status.get(songId) === 'saved') updateChordSaveIndicator(songId, null);
      }, 1400);
    } catch (e) {
      console.error('[song-flow] chord save failed', e);
      updateChordSaveIndicator(songId, 'error');
    }
  }, 600);
  chordEdit.timers.set(songId, timeout);
}

function handleChordInput(e) {
  const ta = e.target;
  if (!(ta instanceof HTMLTextAreaElement)) return;
  if (!ta.classList.contains('chord-edit-area')) return;
  const songId = ta.dataset.songId;
  const song = findSong(songId); if (!song) return;
  if (!song.chords) song.chords = {};
  song.chords[song.keyOf] = ta.value;
  scheduleChordSave(songId);
}

function toggleChordEdit(songId) {
  const song = findSong(songId); if (!song) return;
  const wasEditing = chordEdit.editing.has(songId);
  if (wasEditing) {
    // If a debounced save is pending, flush it now.
    const t = chordEdit.timers.get(songId);
    if (t) {
      clearTimeout(t);
      chordEdit.timers.delete(songId);
      const value = song.chords?.[song.keyOf] ?? '';
      updateChordSaveIndicator(songId, 'saving');
      updateChordSheet(songId, song.keyOf, value)
        .then(() => {
          updateChordSaveIndicator(songId, 'saved');
          setTimeout(() => {
            if (chordEdit.status.get(songId) === 'saved') updateChordSaveIndicator(songId, null);
          }, 1400);
        })
        .catch((e) => { console.error('[song-flow] chord save failed', e); updateChordSaveIndicator(songId, 'error'); });
    }
    chordEdit.editing.delete(songId);
  } else {
    chordEdit.editing.add(songId);
  }
  const pane = document.querySelector(`#song-${songId} .view-chords`);
  if (pane) pane.innerHTML = renderChordsView(song);
  if (!wasEditing) {
    const ta = document.getElementById(`chord-edit-${songId}`);
    if (ta) {
      ta.focus();
      try { ta.selectionStart = ta.selectionEnd = ta.value.length; } catch {}
    }
  }
}

// ---------- AI Chord Sheet ----------
const CHORD_SOURCES = [
  { id: 'auto',            label: 'Auto — try any reputable site',   sub: 'Best chance of finding the song' },
  { id: 'essential',       label: 'Essential Worship',                sub: 'essentialworship.com' },
  { id: 'ultimate',        label: 'Ultimate Guitar',                  sub: 'ultimate-guitar.com' },
  { id: 'worshipchords',   label: 'Worship Chords',                   sub: 'worshipchords.com' },
  { id: 'worshiptogether', label: 'Worship Together',                 sub: 'worshiptogether.com' },
  { id: 'praisecharts',    label: 'PraiseCharts',                     sub: 'praisecharts.com' },
];

function generateChords(songId, force) {
  const song = findSong(songId); if (!song) return;
  if (!force && song.chords?.[song.keyOf]) {
    setSongView(songId, 'chords');
    return;
  }
  openChordSourceSheet(songId);
}

function openChordSourceSheet(songId) {
  const song = findSong(songId); if (!song) return;
  const buttons = CHORD_SOURCES.map((s) => `
    <button class="sheet-secondary chord-source-pick" data-source="${s.id}" style="display:flex;flex-direction:column;align-items:flex-start;gap:.2rem;padding:.85rem 1rem;text-align:left;width:100%;margin-bottom:.4rem">
      <span style="font-size:.85rem;color:var(--ink)">${escapeHtml(s.label)}</span>
      <span style="font-size:.65rem;letter-spacing:.06em;color:var(--ink-mute)">${escapeHtml(s.sub)}</span>
    </button>
  `).join('');
  setSheet(`
    <div class="sheet-title">Find Chord Chart</div>
    <div class="sheet-sub">Search the web for <strong style="color:var(--ink)">${escapeHtml(song.title)}</strong>${song.artist ? ` by ${escapeHtml(song.artist)}` : ''} in the key of <strong style="color:var(--gold)">${escapeHtml(song.keyOf)}</strong></div>
    <div style="margin-top:.75rem">${buttons}</div>
    <button class="sheet-cancel" data-close>Cancel</button>
  `);
  document.querySelectorAll('.chord-source-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = btn.dataset.source;
      closeSheet();
      runChordGeneration(songId, src);
    });
  });
  openSheetEl();
}

async function runChordGeneration(songId, source) {
  const song = findSong(songId); if (!song) return;
  const sourceLabel = (CHORD_SOURCES.find((s) => s.id === source) || CHORD_SOURCES[0]).label;
  const pane = document.querySelector(`#song-${songId} .view-chords`);
  if (pane) pane.innerHTML = `<div class="chords-pane"><div class="chords-loading"><span class="spinner"></span>Searching ${escapeHtml(sourceLabel)} for ${escapeHtml(song.keyOf)} chord chart…<div style="font-size:.6rem;letter-spacing:.18em;color:var(--ink-mute);margin-top:.5rem">This can take 20–40 seconds</div></div></div>`;
  setSongView(songId, 'chords');

  try {
    const { content, notFound } = await generateChordSheet({
      title: song.title, artist: song.artist || '', keyOf: song.keyOf, flow: song.flow, source,
    });
    if (notFound || !content) {
      const pane2 = document.querySelector(`#song-${songId} .view-chords`);
      if (pane2) pane2.innerHTML = `<div class="chords-pane"><div class="chords-empty">
        <div class="msg">Couldn't find a published chart on <strong>${escapeHtml(sourceLabel)}</strong>. Try another source or import from PCO.</div>
        <button class="chords-gen-btn" data-action="gen-chords" data-song-id="${songId}" data-force="1">Pick a different source</button>
      </div></div>`;
      return;
    }
    if (!song.chords) song.chords = {};
    song.chords[song.keyOf] = content;
    try { await saveChordSheet(song.id, song.keyOf, content); } catch (e) { console.error('[song-flow] chord save failed', e); }
    const pane2 = document.querySelector(`#song-${songId} .view-chords`);
    if (pane2) pane2.innerHTML = renderChordsView(song);
    showToast(`Chord sheet pulled from ${sourceLabel}`);
  } catch (e) {
    console.error(e);
    const pane2 = document.querySelector(`#song-${songId} .view-chords`);
    if (pane2) pane2.innerHTML = `<div class="chords-pane"><div class="chords-empty">
      <div class="msg" style="color:var(--danger)">Couldn't generate chord sheet. Try again in a moment.</div>
      <button class="chords-gen-btn" data-action="gen-chords" data-song-id="${songId}" data-force="1">Try Again</button>
    </div></div>`;
  }
}

// ---------- Import Chord Sheet from PCO ----------
let pcoChordCachedResults = [];

function openImportPCOChordsSheet(songId) {
  const song = findSong(songId); if (!song) return;
  setSheet(`
    <div class="sheet-title">Import Chord Chart from PCO</div>
    <div class="sheet-sub">Find this song in your Planning Center library and pull its chord chart.</div>
    <div class="search-row">
      <input class="field-input" id="pco-chord-search" type="text" placeholder="Search PCO…" autocomplete="off">
      <button class="search-btn" id="pco-chord-do-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>Find
      </button>
    </div>
    <div class="search-hint">
      <span style="display:inline-flex;width:11px;height:11px;opacity:.7">${SVG_CROSS}</span>
      Chart imports in PCO's original key — you can edit it after.
    </div>
    <div id="pco-chord-result" style="margin-top:.75rem"></div>
    <button class="sheet-cancel" data-close>Cancel</button>
  `);
  const input = document.getElementById('pco-chord-search');
  input.value = song.title || '';
  const trigger = async () => {
    const q = input.value.trim();
    if (!q) return;
    const resultEl = document.getElementById('pco-chord-result');
    resultEl.innerHTML = `<div class="search-loading"><span class="spinner"></span>Searching PCO…</div>`;
    try {
      const { results } = await searchPCO({ query: q });
      pcoChordCachedResults = Array.isArray(results) ? results : [];
      renderPCOChordResults(songId);
    } catch (e) {
      console.error(e);
      pcoChordCachedResults = [];
      resultEl.innerHTML = `<div class="search-empty">Couldn't reach PCO. Check your connection and try again.</div>`;
    }
  };
  document.getElementById('pco-chord-do-search').addEventListener('click', trigger);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); trigger(); } });
  openSheetEl();
  setTimeout(() => { input.focus(); input.select(); trigger(); }, 120);
}

function renderPCOChordResults(songId) {
  const resultEl = document.getElementById('pco-chord-result');
  if (!resultEl) return;
  const results = pcoChordCachedResults;
  if (!results.length) {
    resultEl.innerHTML = `<div class="search-empty">No matches in your PCO library. Try a different name.</div>`;
    return;
  }
  const song = findSong(songId);
  const targetKey = song?.keyOf || '';
  resultEl.innerHTML = results.map((r, i) => {
    const hasChart = !!r.chordChart;
    const hasChords = r.hasChords === true;
    const chartLabel = !hasChart ? 'No chart uploaded'
      : hasChords ? 'Chart w/ chords'
      : 'Lyrics only (no chords)';
    const transposeHint = (hasChart && hasChords && r.originalKey && targetKey && r.originalKey !== targetKey)
      ? `<span class="pill" style="background:var(--bg-2);color:var(--gold)">→ ${escapeHtml(targetKey)}</span>`
      : '';
    return `
      <div class="song-preview" style="margin-bottom:.65rem">
        <div class="preview-top">
          <div class="preview-icon">${SVG_CROSS}</div>
          <div class="preview-meta">
            <div class="preview-title">${escapeHtml(r.title)}</div>
            <div class="preview-artist">${escapeHtml(r.artist || 'Unknown author')}</div>
            <div class="preview-stats">
              ${r.originalKey ? `<span class="pill">Key ${escapeHtml(r.originalKey)}</span>` : ''}
              <span class="pill" style="${hasChart && hasChords ? '' : 'opacity:.55'}">${chartLabel}</span>
              ${transposeHint}
            </div>
          </div>
        </div>
        ${hasChart ? `
          <details style="margin:.5rem 0" data-raw-details="${i}">
            <summary style="cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute)">Preview raw PCO text</summary>
            <pre style="margin:.4rem 0 0;padding:.6rem;background:var(--bg-2);border:1px solid var(--line);border-radius:6px;font-size:.68rem;line-height:1.4;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:var(--ink)">${escapeHtml(r.chordChart.slice(0, 1200))}${r.chordChart.length > 1200 ? `\n…(+${r.chordChart.length - 1200} chars)` : ''}</pre>
          </details>
        ` : ''}
        <button class="preview-add" data-action="accept-pco-chords" data-pco-idx="${i}" data-song-id="${songId}" ${hasChart ? '' : 'disabled style="opacity:.5;cursor:not-allowed"'}>Use This Chart</button>
      </div>`;
  }).join('');
}

async function applyPCOChordsToSong(songId, result) {
  const song = findSong(songId);
  if (!song || !result || !result.chordChart) return;
  console.log('[song-flow] PCO raw chart source=%s hasChords=%s len=%d', result.chordSource, result.hasChords, result.chordChart.length);
  const normalized = normalizeChordChart(result.chordChart);
  if (!normalized) return;

  // Keep the user's chosen key for this song — transpose PCO's chart to match
  // rather than overriding song.keyOf. Falls back to PCO's key only when the
  // song was literally just created and we have no better signal.
  const fromKey = result.originalKey;
  const targetKey = song.keyOf || fromKey || 'C';
  const delta = fromKey ? semiDeltaBetween(fromKey, targetKey) : null;
  const transposed = (fromKey && delta != null && delta !== 0)
    ? transposeChart(normalized, fromKey, targetKey)
    : normalized;

  if (!song.chords) song.chords = {};
  song.chords[targetKey] = transposed;
  saveState(); render();
  try { await saveChordSheet(song.id, targetKey, transposed); }
  catch (e) { console.error('[song-flow] chord save failed', e); }
  closeSheet();

  let msg;
  if (!chartHasChords(transposed)) {
    msg = 'Imported — PCO arrangement has lyrics only, add chords via Edit';
  } else if (fromKey && fromKey !== targetKey) {
    msg = `Imported from PCO · transposed ${fromKey} → ${targetKey}`;
  } else {
    msg = 'Chord chart imported from PCO';
  }
  showToast(msg);
  setTimeout(() => setSongView(songId, 'chords'), 60);
}

// ---------- Toast ----------
let toastT;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 1900);
}

// ---------- Click router ----------
function handleClick(e) {
  if (e.target.closest('[data-close]')) { closeSheet(); return; }
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  const songId = t.dataset.songId;

  switch (action) {
    case 'add-section': openSectionSheet(songId); break;
    case 'edit-key': openKeySheet(songId); break;
    case 'edit-bpm': openBpmSheet(songId); break;
    case 'edit-transition': openTransitionSheet(songId, false); break;
    case 'add-transition': openTransitionSheet(songId, true); break;
    case 'add-song': openAddSongSheet(); break;
    case 'delete-song': confirmDeleteSong(songId); break;
    case 'cycle-type': cycleType(songId, t.closest('.flow-row').dataset.rowId); break;
    case 'delete-row': deleteRow(t.closest('.flow').dataset.songId, t.closest('.flow-row').dataset.rowId); break;
    case 'set-view': setSongView(songId, t.dataset.view); break;
    case 'gen-chords': generateChords(songId, t.dataset.force === '1'); break;
    case 'import-pco-chords': openImportPCOChordsSheet(songId); break;
    case 'accept-pco-chords': {
      const idx = parseInt(t.dataset.pcoIdx, 10);
      const sid = t.dataset.songId;
      applyPCOChordsToSong(sid, pcoChordCachedResults[idx]);
      break;
    }
    case 'toggle-chord-edit': toggleChordEdit(songId); break;
    case 'open-library': openLibrarySheet(); break;
    case 'load-set': loadSetlistById(t.dataset.setId); break;
    case 'dup-set': duplicateSetlistById(t.dataset.setId); break;
    case 'del-set': confirmDeleteSetlistById(t.dataset.setId); break;
    case 'rename-set': renameSetlistInline(t.dataset.setId); break;
    case 'new-set': createNewSetlist(); break;
    case 'signout': doSignOut(); break;
    case 'share': openShareSheet(); break;
    case 'link-tap': {
      const platform = t.dataset.platform;
      const song = findSong(songId);
      const url = getLink(song, platform);
      if (url) { window.open(url, '_blank', 'noopener,noreferrer'); }
      else { openLinkSheet(songId, platform); }
      break;
    }
    case 'link-edit': openLinkSheet(songId, t.dataset.platform); break;
    case 'accept-pco': {
      const idx = parseInt(t.dataset.pcoIdx, 10);
      const result = pcoCachedResults[idx];
      if (result) {
        addSongFromPreset(result, null);
        closeSheet();
      }
      break;
    }
    case 'edit-label': {
      const sid = t.closest('.flow').dataset.songId;
      const item = findSong(sid).flow.find((r) => r.id === t.closest('.flow-row').dataset.rowId);
      startInlineEdit(t, item.label, (v) => { if (v) item.label = v; });
      break;
    }
    case 'edit-title': {
      const song = findSong(songId);
      startInlineEdit(t, song.title, (v) => { if (v) song.title = v; });
      break;
    }
    case 'edit-artist': {
      const song = findSong(songId);
      startInlineEdit(t, song.artist || '', (v) => { song.artist = v; });
      break;
    }
    case 'edit-name':
      startInlineEdit(t, state.name, (v) => { if (v) state.name = v; });
      break;
  }
}

async function openShareSheet() {
  if (!state?.id) return;
  setSheet(`
    <div class="sheet-title">Share Setlist</div>
    <div class="sheet-sub">Read-only link · anyone with the URL can view</div>
    <div class="share-loading" id="share-loading"><span class="spinner"></span>Generating link…</div>
  `);
  openSheetEl();
  try {
    const token = await generateShareToken(state.id);
    const shareUrl = `https://song-flow-one.vercel.app/view/${token}`;
    setSheet(`
      <div class="sheet-title">Share Setlist</div>
      <div class="sheet-sub">${escapeHtml(state.name)} · read-only</div>
      <p class="sheet-text">Anyone with this link can view the setlist. They won't be able to edit anything.</p>
      <label class="field-label">Share URL</label>
      <div class="share-row">
        <input class="field-input" id="share-url" type="text" value="${escapeHtml(shareUrl)}" readonly>
        <button class="search-btn" id="share-copy">${SVG_COPY} Copy</button>
      </div>
      <div class="sheet-actions" style="grid-template-columns:1fr">
        <button class="sheet-cancel" data-close>Done</button>
      </div>
    `);
    const copyBtn = document.getElementById('share-copy');
    const urlInput = document.getElementById('share-url');
    const doCopy = async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied');
      } catch {
        urlInput.select();
        try { document.execCommand('copy'); showToast('Link copied'); }
        catch { showToast('Copy failed — select and copy manually'); }
      }
    };
    copyBtn.addEventListener('click', doCopy);
    urlInput.addEventListener('focus', () => urlInput.select());
    setTimeout(() => { urlInput.select(); }, 100);
  } catch (e) {
    console.error('[song-flow] share link failed', e);
    setSheet(`
      <div class="sheet-title">Share Setlist</div>
      <div class="sheet-sub" style="color:var(--danger)">Could not generate share link</div>
      <p class="sheet-text">${escapeHtml(e?.message || 'Please try again in a moment.')}</p>
      <div class="sheet-actions" style="grid-template-columns:1fr">
        <button class="sheet-cancel" data-close>Close</button>
      </div>
    `);
  }
}

async function doSignOut() {
  try { await flushSave(); } catch {}
  await signOut();
  // main.js listens to auth changes and re-renders.
}

// Called to clean up listeners when tearing down.
let detachListeners = null;
let detachSaveStatus = null;
function attachListeners() {
  if (detachListeners) return;
  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleChordInput);
  document.getElementById('backdrop').addEventListener('click', closeSheet);
  detachSaveStatus = onSaveStatus((status) => {
    saveStatus = status;
    renderSaveDot();
    if (status === 'saved') setTimeout(() => { if (saveStatus === 'saved') { saveStatus = 'idle'; renderSaveDot(); } }, 1400);
  });
  detachListeners = () => {
    document.removeEventListener('click', handleClick);
    document.removeEventListener('input', handleChordInput);
    document.getElementById('backdrop').removeEventListener('click', closeSheet);
    detachSaveStatus?.();
  };
}

// ---------- Public entry ----------
export async function initEditor(_user, _mount) {
  user = _user;
  mount = _mount;
  mount.innerHTML = `<div class="boot"><span class="spinner"></span>Loading your setlists…</div>`;
  try {
    summaries = await listSetlistSummaries(user.id);
    if (!summaries.length) {
      const created = await createSetlist(user.id, { name: 'Impact Service', date: todayISO() });
      state = created;
      summaries = await listSetlistSummaries(user.id);
    } else {
      state = await loadSetlist(summaries[0].id);
    }
    normalizeState();
    attachListeners();
    render();
  } catch (e) {
    console.error('[song-flow] editor init failed', e);
    mount.innerHTML = `<div class="boot" style="color:var(--danger)">Could not load your setlists. ${escapeHtml(e.message || '')}</div>`;
  }
}

export async function teardownEditor() {
  try { await flushSave(); } catch {}
  detachListeners?.();
  detachListeners = null;
  state = null;
  summaries = [];
}
