// Planning Center Online (PCO) Services songs search.
// Uses a server-side personal access token (PCO_CLIENT_ID + PCO_SECRET via Basic Auth)
// — no per-user OAuth, since this is the org's own library.

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

function mapSectionType(rawLabel) {
  const name = String(rawLabel || '')
    .toLowerCase()
    .replace(/\s*\d+\s*$/, '')
    .trim();
  return SECTION_MAP[name] || 'verse';
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
    const searchUrl = `https://api.planningcenteronline.com/services/v2/songs?where[search_name]=${encodeURIComponent(query)}&per_page=10`;
    const searchRes = await fetch(searchUrl, { headers: pcoHeaders });
    if (!searchRes.ok) {
      const text = await searchRes.text().catch(() => '');
      return res.status(502).json({ error: `PCO search failed (${searchRes.status})`, detail: text.slice(0, 300) });
    }
    const searchData = await searchRes.json();
    const songs = Array.isArray(searchData.data) ? searchData.data : [];

    const results = await Promise.all(songs.map(async (song) => {
      const attrs = song.attributes || {};
      const title = attrs.title || 'Untitled';
      const artist = attrs.author || null;

      let originalKey = null;
      let bpm = null;
      let flow = [];

      try {
        const arrUrl = `https://api.planningcenteronline.com/services/v2/songs/${song.id}/arrangements?per_page=1`;
        const arrRes = await fetch(arrUrl, { headers: pcoHeaders });
        if (arrRes.ok) {
          const arrData = await arrRes.json();
          const arr = Array.isArray(arrData.data) && arrData.data[0];
          if (arr) {
            const a = arr.attributes || {};
            originalKey = a.chord_chart_key || null;
            if (typeof a.bpm === 'number' && a.bpm > 0) bpm = Math.round(a.bpm);
            const seq = Array.isArray(a.sequence) ? a.sequence : [];
            flow = seq
              .filter((label) => label != null && String(label).trim())
              .map((label) => ({ type: mapSectionType(label), label: String(label).trim() }));
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
