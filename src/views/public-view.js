import { getSetlistByShareToken, updateChordSheet } from '../lib/library.js';
import { signInWithGoogle } from '../lib/auth.js';
import {
  SVG_SPOTIFY, SVG_YOUTUBE, SVG_PEN, SVG_CAL, SVG_FLOW, SVG_CHORDS,
  TAG_LABEL, escapeHtml, formatDate,
} from './editor-shared.js';

let mount = null;
let state = null;
let detachClick = null;
let detachInput = null;

// Per-song chord editor state (ephemeral, not persisted).
const chordEdit = {
  editing: new Set(),
  timers: new Map(),
  status: new Map(),
};

function findSong(id) { return state.songs.find((s) => s.id === id); }

function renderFlowRow(row, idx) {
  const tagLabel = TAG_LABEL[row.type] || row.type;
  return `<li class="flow-row" data-type="${row.type}" data-row-id="${row.id}">
    <span class="flow-idx">${String(idx + 1).padStart(2, '0')}</span>
    <span class="flow-label">${escapeHtml(row.label)}${row.note ? `<span class="note">${escapeHtml(row.note)}</span>` : ''}</span>
    <span class="flow-tag">${tagLabel}</span>
  </li>`;
}

function renderTransition(song, isFirst) {
  if (isFirst || !song.transition) return '';
  const isAltar = song.transition.style === 'altar';
  return `<div class="transition ${isAltar ? 'altar' : ''}">
    ${isAltar
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L14 8H20L15 12L17 18L12 14L7 18L9 12L4 8H10L12 2Z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M7 17L17 7M17 7H9M17 7V15"/></svg>`}
    ${escapeHtml(song.transition.label)}
  </div>`;
}

function renderLinkBtn(song, platform) {
  const url = platform === 'spotify' ? song.spotifyUrl : song.youtubeUrl;
  if (!url) return '';
  const icon = platform === 'spotify' ? SVG_SPOTIFY : SVG_YOUTUBE;
  const labelName = platform === 'spotify' ? 'Spotify' : 'YouTube';
  return `<a class="link-btn ${platform} set" href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="Open in ${labelName}" title="Open in ${labelName}">${icon}</a>`;
}

function renderChordSheetText(text) {
  return escapeHtml(text)
    .replace(/^\[([^\]]+)\]/gm, '<span class="section">$1</span>')
    .replace(/^([A-G][b♭#♯]?(?:m|maj|min|sus|aug|dim|add)?\d?(?:\/[A-G][b♭#♯]?)?(\s+[A-G][b♭#♯]?(?:m|maj|min|sus|aug|dim|add)?\d?(?:\/[A-G][b♭#♯]?)?)*)\s*$/gm, '<span class="chord">$1</span>');
}

function renderChordsView(song) {
  const chordText = song.chords?.[song.keyOf];
  const editing = chordEdit.editing.has(song.id);
  if (!chordText && !editing) {
    return `<div class="chords-pane"><div class="chords-empty">
      <div class="icon">${SVG_CHORDS}</div>
      <div class="msg">No chord chart available for the key of <strong style="color:var(--gold)">${escapeHtml(song.keyOf)}</strong>.</div>
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
        <button class="chords-action-btn" data-view-action="toggle-chord-edit" data-song-id="${song.id}" aria-label="${editing ? 'Done editing' : 'Edit chord sheet'}" title="${editing ? 'Done editing' : 'Edit chord sheet'}">${SVG_PEN} ${editing ? 'Done' : 'Edit'}</button>
      </div>
    </div>
    ${editing
      ? `<textarea class="chord-edit-area" id="chord-edit-${song.id}" data-song-id="${song.id}" spellcheck="false" style="width:100%;box-sizing:border-box;min-height:300px;padding:1rem;background:var(--bg-2);border:1px solid var(--gold);border-radius:10px;color:var(--ink);font-family:'JetBrains Mono',monospace;font-size:.78rem;line-height:1.7;resize:vertical;outline:none">${escapeHtml(text)}</textarea>`
      : `<div class="chord-sheet">${renderChordSheetText(text)}</div>`
    }
    <div class="chord-disclaimer">AI-generated · verify with your chord chart before service</div>
  </div>`;
}

function updateChordSaveIndicator(songId, status) {
  if (status) chordEdit.status.set(songId, status);
  else chordEdit.status.delete(songId);
  const el = mount?.querySelector(`#chord-save-${songId}`);
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
  const pane = mount?.querySelector(`#song-${songId} .view-chords`);
  if (pane) pane.innerHTML = renderChordsView(song);
  if (!wasEditing) {
    const ta = mount?.querySelector(`#chord-edit-${songId}`);
    if (ta) {
      ta.focus();
      try { ta.selectionStart = ta.selectionEnd = ta.value.length; } catch {}
    }
  }
}

function renderSong(song, index) {
  const num = String(index + 1).padStart(2, '0');
  const artistHtml = song.artist
    ? `<div class="song-artist">${escapeHtml(song.artist)}</div>`
    : '';
  const bpmDisplay = song.bpm ? `${song.bpm}<span class="unit">BPM</span>` : `<span class="empty">— BPM</span>`;
  const view = song.view || 'flow';
  const spotifyLink = renderLinkBtn(song, 'spotify');
  const youtubeLink = renderLinkBtn(song, 'youtube');
  const hasLinks = spotifyLink || youtubeLink;

  return `<div class="song-block" data-song-id="${song.id}">
    ${renderTransition(song, index === 0)}
    <section class="song" id="song-${song.id}">
      <div class="song-head">
        <div class="song-num">${num}</div>
        <h2 class="song-title">${escapeHtml(song.title)}</h2>
        ${artistHtml}
        <div class="song-stats">
          <div class="stat"><span class="stat-label">Key</span><span class="stat-static">${escapeHtml(song.keyOf)}</span></div>
          <div class="stat"><span class="stat-label">Tempo</span><span class="stat-static">${bpmDisplay}</span></div>
          ${hasLinks ? `<div class="stat stat-links">
            <span class="stat-label">Listen</span>
            <div class="link-row">${spotifyLink}${youtubeLink}</div>
          </div>` : ''}
        </div>
      </div>
      <div class="view-tabs">
        <button class="view-tab ${view === 'flow' ? 'active' : ''}" data-view-tab="flow" data-song-id="${song.id}">${SVG_FLOW} Flow</button>
        <button class="view-tab ${view === 'chords' ? 'active' : ''}" data-view-tab="chords" data-song-id="${song.id}">${SVG_CHORDS} Chords</button>
      </div>
      <div class="song-views" data-song-id="${song.id}">
        <div class="song-view view-flow" data-view="flow">
          <ol class="flow" data-song-id="${song.id}">
            ${song.flow.map((r, i) => renderFlowRow(r, i)).join('')}
          </ol>
        </div>
        <div class="song-view view-chords" data-view="chords">
          ${renderChordsView(song)}
        </div>
      </div>
    </section>
  </div>`;
}

function render() {
  if (!mount || !state) return;
  const keys = state.songs.map((s) => s.keyOf).join(' → ') || '—';
  const bpms = state.songs.map((s) => s.bpm).filter((b) => b && b > 0);
  const tempoRange = bpms.length === 0 ? null
    : bpms.length === 1 || Math.min(...bpms) === Math.max(...bpms) ? `${bpms[0]} BPM`
    : `${Math.min(...bpms)}–${Math.max(...bpms)} BPM`;

  mount.innerHTML = `
    <div class="view-banner">
      <div class="view-banner-text">
        Viewing <strong>${escapeHtml(state.name)}</strong> · Chord edits are shared
      </div>
      <button class="view-banner-btn" data-view-action="signin">Sign in to edit setlist</button>
    </div>
    <header>
      <div class="kicker"><span class="dot"></span>${escapeHtml(state.name)} · Setlist</div>
      <div class="date-row">
        <span class="date-display">${SVG_CAL} ${escapeHtml(formatDate(state.date))}</span>
      </div>
      <h1>Song <em>Flow</em></h1>
      <div class="meta">
        <span><strong>${String(state.songs.length).padStart(2, '0')}</strong> Songs</span>
        <span>Keys · <strong>${escapeHtml(keys)}</strong></span>
        ${tempoRange ? `<span>Tempo · <strong>${escapeHtml(tempoRange)}</strong></span>` : ''}
      </div>
    </header>
    <div id="songs-list">${state.songs.map(renderSong).join('')}</div>
    <nav class="nav-dots" aria-label="Jump">
      ${state.songs.length ? '<span>Jump</span>' : ''}
      ${state.songs.map((s, i) => `<a href="#song-${s.id}" data-sid="${s.id}" class="${i === 0 ? 'active' : ''}" aria-label="Song ${i + 1}"></a>`).join('')}
    </nav>
    <footer><span class="divider"></span>Read-only view · Swipe Flow ↔ Chords</footer>
  `;

  initObserver();
  initSongViews();
}

function initObserver() {
  const songs = mount.querySelectorAll('.song');
  const dots = mount.querySelectorAll('.nav-dots a');
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

function syncSongViewHeight(views) {
  if (!views) return;
  const songId = views.dataset.songId;
  const song = findSong(songId); if (!song) return;
  const view = song.view || 'flow';
  const active = views.querySelector(`.song-view.view-${view}`);
  if (active) views.style.height = active.scrollHeight + 'px';
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
  mount.querySelectorAll('.song-views').forEach((views) => {
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
          songEl.querySelectorAll('.view-tab').forEach((t) => t.classList.toggle('active', t.dataset.viewTab === newView));
          syncSongViewHeight(views);
        }
      }, 120);
    });
  });
}

function setSongView(songId, view) {
  const views = mount.querySelector(`.song-views[data-song-id="${songId}"]`);
  if (!views) return;
  const song = findSong(songId);
  if (song) song.view = view;
  const target = views.querySelector(`[data-view="${view}"]`);
  if (target) views.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
  mount.querySelectorAll(`#song-${songId} .view-tab`).forEach((t) => t.classList.toggle('active', t.dataset.viewTab === view));
  syncSongViewHeight(views);
}

function handleClick(e) {
  const signin = e.target.closest('[data-view-action="signin"]');
  if (signin) {
    signInWithGoogle().catch((err) => console.error('[song-flow] sign-in failed', err));
    return;
  }
  const toggle = e.target.closest('[data-view-action="toggle-chord-edit"]');
  if (toggle) {
    toggleChordEdit(toggle.dataset.songId);
    return;
  }
  const tab = e.target.closest('[data-view-tab]');
  if (tab) {
    setSongView(tab.dataset.songId, tab.dataset.viewTab);
  }
}

export async function initPublicView(token, _mount) {
  mount = _mount;
  mount.innerHTML = `<div class="boot"><span class="spinner"></span>Loading setlist…</div>`;
  try {
    state = await getSetlistByShareToken(token);
    if (!detachClick) {
      const fn = handleClick;
      document.addEventListener('click', fn);
      detachClick = () => document.removeEventListener('click', fn);
    }
    if (!detachInput) {
      const fn = handleChordInput;
      document.addEventListener('input', fn);
      detachInput = () => document.removeEventListener('input', fn);
    }
    render();
  } catch (e) {
    console.error('[song-flow] public view load failed', e);
    mount.innerHTML = `
      <div class="boot" style="flex-direction:column;gap:1rem;color:var(--ink-dim);text-align:center;padding:2rem 1rem">
        <div style="font-family:'Fraunces',serif;font-size:1.4rem;color:var(--ink)">Setlist not found</div>
        <div>This share link is invalid or has been revoked.</div>
      </div>`;
  }
}

export async function teardownPublicView() {
  detachClick?.();
  detachInput?.();
  detachClick = null;
  detachInput = null;
  state = null;
}
