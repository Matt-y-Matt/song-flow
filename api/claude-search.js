import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload || '{}'); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  payload = payload || {};

  const query = (payload.query || '').toString().trim();
  const sourceUrl = payload.sourceUrl ? String(payload.sourceUrl) : null;
  if (!query && !sourceUrl) return res.status(400).json({ error: 'Missing query' });

  const isSpotify = sourceUrl && sourceUrl.includes('spotify.com');
  const isYoutube = sourceUrl && (sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be'));
  let idContext = '';
  if (sourceUrl) {
    if (isSpotify) {
      const m = sourceUrl.match(/track\/([A-Za-z0-9]+)/);
      if (m) idContext = `\nSpotify track ID: ${m[1]}`;
    } else if (isYoutube) {
      const m = sourceUrl.match(/(?:[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
      if (m) idContext = `\nYouTube video ID: ${m[1]}`;
    }
  }
  const linkContext = sourceUrl
    ? `\n\nThe user provided this direct link: ${sourceUrl}. Identify the exact song at this URL and return its metadata.${idContext}\nThis is a direct ${isSpotify ? 'Spotify' : isYoutube ? 'YouTube' : 'streaming'} link. If the link refers to a ${isSpotify ? 'Spotify track' : isYoutube ? 'YouTube video' : 'track'} you recognise, prefer the information implied by the link (e.g. the artist's official upload) over a similarly named cover.`
    : '';
  const prompt = `You are a worship music database assistant. The user wants to add a song to their setlist. Query: "${query || '(none)'}"${linkContext}

Return ONLY a single JSON object (no markdown fences, no explanation). Schema:
{
  "found": true | false,
  "title": "Song title",
  "artist": "Artist or band name",
  "originalKey": "Original recording key with unicode flats/sharps (e.g. 'A', 'D♭', 'F♯')",
  "bpm": <integer 40-240>,
  "spotifyUrl": "Spotify URL if known, else null",
  "youtubeUrl": "YouTube URL if known, else null",
  "flow": [{"type": "<intro|verse|prechorus|chorus|bridge|tag|breakdown|interlude|instrumental|outro|free>", "label": "Section label like 'Verse 1', 'Chorus', 'Bridge'"}]
}

Rules:
- Flow = most common LIVE worship arrangement (8-14 sections typical).
- Use 'free' for free worship / vamp / extended ministry sections.
- Number repeats only when lyrics differ ('Verse 1', 'Verse 2'); choruses usually just 'Chorus'.
- If you don't recognize the song, return {"found": false} with everything null.
- Use D♭ not Db, B♭ not Bb, F♯ not F#.
- If a source link was provided, include that same link in the matching spotifyUrl or youtubeUrl field of the response.

JSON only.`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (msg.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    const cleaned = stripFences(text);
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch { return res.status(502).json({ error: 'Model returned non-JSON', raw: cleaned }); }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[claude-search]', err);
    return res.status(500).json({ error: err.message || 'Search failed' });
  }
}
