// Diagnostic endpoint: dumps the raw PCO arrangement payload for a single
// song so we can see exactly which chord-chart fields are populated and in
// what format. Hit it with a browser as a logged-in admin:
//   /api/pco-debug?q=<song title>
// Returns JSON with the matched song + the first arrangement's raw attributes.

export default async function handler(req, res) {
  const id = process.env.PCO_CLIENT_ID;
  const secret = process.env.PCO_SECRET;
  if (!id || !secret) return res.status(500).json({ error: 'Missing PCO credentials' });

  const q = (req.query?.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Pass ?q=<title>' });

  const authHeader = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
  const headers = { Authorization: authHeader, Accept: 'application/json' };

  try {
    // Pull up to 500 songs and find the first one whose title contains the query.
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const needle = norm(q);

    const songsList = [];
    let offset = 0;
    while (songsList.length < 500) {
      const url = `https://api.planningcenteronline.com/services/v2/songs?per_page=100&offset=${offset}`;
      const r = await fetch(url, { headers });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return res.status(502).json({ error: `PCO list ${r.status}`, detail: text.slice(0, 300) });
      }
      const data = await r.json();
      const page = data.data || [];
      if (!page.length) break;
      songsList.push(...page);
      if (page.length < 100) break;
      offset += 100;
    }

    const match = songsList.find((s) => norm(s.attributes?.title).includes(needle))
      || songsList.find((s) => norm(s.attributes?.author).includes(needle));

    if (!match) return res.status(404).json({ error: 'No title/author match', searched: songsList.length });

    const arrRes = await fetch(
      `https://api.planningcenteronline.com/services/v2/songs/${match.id}/arrangements?per_page=5`,
      { headers }
    );
    if (!arrRes.ok) {
      const text = await arrRes.text().catch(() => '');
      return res.status(502).json({ error: `PCO arr ${arrRes.status}`, detail: text.slice(0, 300) });
    }
    const arrData = await arrRes.json();
    const arrangements = (arrData.data || []).map((a) => {
      const attrs = a.attributes || {};
      // Truncate long chart fields so the JSON stays readable.
      const snip = (v, n = 600) => typeof v === 'string' ? (v.length > n ? v.slice(0, n) + `…(+${v.length - n} chars)` : v) : v;
      return {
        id: a.id,
        name: attrs.name,
        has_chords: attrs.has_chords,
        chord_chart_key: attrs.chord_chart_key,
        bpm: attrs.bpm,
        chord_chart_len: typeof attrs.chord_chart === 'string' ? attrs.chord_chart.length : null,
        chord_chart_chord_pro_len: typeof attrs.chord_chart_chord_pro === 'string' ? attrs.chord_chart_chord_pro.length : null,
        lyrics_len: typeof attrs.lyrics === 'string' ? attrs.lyrics.length : null,
        chord_chart_preview: snip(attrs.chord_chart),
        chord_chart_chord_pro_preview: snip(attrs.chord_chart_chord_pro),
        lyrics_preview: snip(attrs.lyrics, 200),
        sequence: attrs.sequence,
      };
    });

    return res.status(200).json({
      song: { id: match.id, title: match.attributes?.title, author: match.attributes?.author },
      arrangements,
    });
  } catch (err) {
    console.error('[pco-debug]', err);
    return res.status(500).json({ error: err.message || 'Debug failed' });
  }
}
