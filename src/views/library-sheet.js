import { escapeHtml, formatDate, formatRelDate, SVG_LIBRARY, SVG_PEN, SVG_DUPE, SVG_TRASH } from './editor-shared.js';

export function renderLibrarySheetHTML({ summaries, currentId }) {
  const sets = [...summaries].sort((a, b) => {
    const da = a.date || '0', db = b.date || '0';
    if (da !== db) return db.localeCompare(da);
    return (b.modified || 0) - (a.modified || 0);
  });
  return `
    <div class="sheet-title">Your Setlists</div>
    <div class="sheet-sub">${sets.length} saved · Synced to your account</div>
    <button class="sheet-secondary" data-action="new-set">${SVG_LIBRARY} + Create New Setlist</button>
    <div class="setlist-list">
      ${sets.map((s) => {
        const isActive = s.id === currentId;
        const songCount = s.songCount || 0;
        const keys = (s.keys || []).slice(0, 3).join(' → ');
        return `<div class="setlist-item ${isActive ? 'active' : ''}">
          <button class="setlist-item-content" style="background:transparent;border:none;text-align:left;cursor:pointer;padding:0;color:inherit" data-action="load-set" data-set-id="${s.id}">
            <div class="set-name">${escapeHtml(s.name)}${isActive ? '<span class="lib-active-pill">Open</span>' : ''}</div>
            <div class="set-info">
              <span>${escapeHtml(formatRelDate(s.date))}</span>
              <span class="sep">·</span>
              <span>${songCount} song${songCount === 1 ? '' : 's'}</span>
              ${keys ? `<span class="sep">·</span><span>${escapeHtml(keys)}${(s.keys || []).length > 3 ? '…' : ''}</span>` : ''}
            </div>
          </button>
          <div class="setlist-actions">
            <button class="set-action" data-action="rename-set" data-set-id="${s.id}" title="Rename">${SVG_PEN}</button>
            <button class="set-action" data-action="dup-set" data-set-id="${s.id}" title="Duplicate">${SVG_DUPE}</button>
            <button class="set-action danger" data-action="del-set" data-set-id="${s.id}" title="Delete">${SVG_TRASH}</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <button class="sheet-cancel" data-close>Done</button>
  `;
}
