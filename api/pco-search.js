// Planning Center Online (PCO) Services songs search.
// Uses a server-side personal access token (PCO_CLIENT_ID + PCO_SECRET via Basic Auth)
// — no per-user OAuth, since this is the org's own library.
//
// PCO's songs endpoint does not support fuzzy search or partial title filters,
// so we paginate the full library and filter server-side by title + author.
// The list is cached in module scope for warm serverless invocations.

const SECTION_MAP = {
  intro: 'intro',
  outro: 'outro',
  ending: 'outro',
  verse: 'verse',
  prechorus: 'prechorus',
  'pre-chorus': 'prechorus',
  'pre chorus': 'prechorus',
  chorus: 'chorus',
  bridge: 'bridge',
  tag: 'tag',
  interlude: 'interlude',
  instrumental: 'instrumental',
  breakdown: 'breakdown',
  vamp: 'free',
  free: 'free',
  'free worship': 'free',
};

const MAX_SONGS = 2000;          // upper bound on how many to pull into memory
const PAGE_SIZE = 100;           // PCO max per page
const CACHE_TTL_MS = 5 * 60_000; // 5 min — warm instances reuse the library

let cachedLibrary = null;
let cachedAt = 0;

function mapSectionType(rawLabel) {
  const name = String(rawLabel || '')
    .toLowerCase()
    .replace(/\s*\d+\s*$/, '')
    .trim();
  return SECTION_MAP[name] || 'verse';
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokenised substring scoring: every query token must appear somewhere in title/author.
function scoreMatch(tokens, title, author) {
  const hay = `${norm(title)} || ${norm(author)}`;
  const titleN = norm(title);
  let score = 0;
  for (const tok of tokens) {
    if (!hay.includes(tok)) return -1;
    if (titleN.includes(tok)) score += 10;
    else score += 3;
  }
  if (titleN === tokens.join(' ')) score += 50;
  if (titleN.startsWith(tokens.join(' '))) score += 20;
  return score;
}

async function fetchAllSongs(headers) {
  const now = Date.now();
  if (cachedLibrary && now - cachedAt < CACHE_TTL_MS) return cachedLibrary;

  const all = [];
  let offset = 0;
  while (all.length < MAX_SONGS) {
    const url = `https://api.planningcenteronline.com/services/v2/songs?per_page=${PAGE_SIZE}&offset=${offset}`;
    const r = await fetch(url, { headers });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`PCO list failed (${r.status}) ${text.slice(0, 200)}`);
    }
    const data = await r.json();
    const page = Array.isArray(data.data) ? data.data : [];
    if (!page.length) break;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  cachedLibrary = all;
  cachedAt = now;
  return all;
}

async function fetchArrangement(songId, headers) {
  const url = `https://api.planningcenteronline.com/services/v2/songs/${songId}/arrangements?per_page=1`;
  const r = await fetch(url, { headers });
  if (!r.ok) return null;
  const data = await r.json();
  return Array.isArray(data.data) && data.data[0] ? data.data[0] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const id = process.env.PCO_CLIENT_ID;
  const secret = process.env.PCO_SECRET;
  if (!id || !secret) return res.status(500).json({ error: 'Missing PCO credentials' });

  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload || '{}'); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  payload = payload || {};

  const query = (payload.query || '').toString().trim();
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const authHeader = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
  const pcoHeaders = { Authorization: authHeader, Accept: 'application/json' };

  try {
    const library = await fetchAllSongs(pcoHeaders);
    const tokens = norm(query).split(' ').filter(Boolean);
    if (!tokens.length) return res.status(200).json({ results: [] });

    const scored = library
      .map((song) => {
        const attrs = song.attributes || {};
        const score = scoreMatch(tokens, attrs.title, attrs.author);
        return score < 0 ? null : { song, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const results = await Promise.all(scored.map(async ({ song }) => {
      const attrs = song.attributes || {};
      const title = attrs.title || 'Untitled';
      const artist = attrs.author || null;

      let originalKey = null;
      let bpm = null;
      let flow = [];
      let chordChart = null;

      try {
        const arr = await fetchArrangement(song.id, pcoHeaders);
        if (arr) {
          const a = arr.attributes || {};
          originalKey = a.chord_chart_key || null;
          if (typeof a.bpm === 'number' && a.bpm > 0) bpm = Math.round(a.bpm);
          const seq = Array.isArray(a.sequence) ? a.sequence : [];
          flow = seq
            .filter((label) => label != null && String(label).trim())
            .map((label) => ({ type: mapSectionType(label), label: String(label).trim() }));
          if (typeof a.chord_chart === 'string' && a.chord_chart.trim()) {
            chordChart = a.chord_chart;
          }
        }
      } catch (err) {
        console.warn('[pco-search] arrangement fetch failed for song', song.id, err?.message);
      }

      return {
        title,
        artist,
        originalKey,
        bpm,
        spotifyUrl: null,
        youtubeUrl: null,
        flow,
        chordChart,
        source: 'pco',
        pcoId: song.id,
      };
    }));

    return res.status(200).json({ results });
  } catch (err) {
    console.error('[pco-search]', err);
    return res.status(500).json({ error: err.message || 'PCO search failed' });
  }
}
