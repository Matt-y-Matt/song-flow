import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Only these domains are searchable — guarantees any returned Spotify/YouTube
// URL came from a real search hit rather than Claude guessing a track/video ID.
const STREAMING_DOMAINS = [
  'open.spotify.com',
  'spotify.com',
  'youtube.com',
  'www.youtube.com',
  'music.youtube.com',
  'youtu.be',
];

function extractJsonBlock(text) {
  if (!text) return null;
  const m = text.match(/<<<JSON>>>([\s\S]*?)<<<ENDJSON>>>/);
  const raw = (m ? m[1] : text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(raw); } catch { return null; }
}

function looksLikeRealSpotify(url) {
  return typeof url === 'string' && /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?track\/[A-Za-z0-9]+/.test(url);
}
function looksLikeRealYoutube(url) {
  return typeof url === 'string' && /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)[A-Za-z0-9_-]{6,}/.test(url);
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

  const linkContext = sourceUrl
    ? `\n\nThe user provided this direct streaming link: ${sourceUrl}\nTreat this as the authoritative identifier for the song. Use this exact URL in the matching spotifyUrl/youtubeUrl field of the response — do not replace it with a different URL you find.`
    : '';

  const prompt = `You are helping a worship leader add a song to their setlist.

Query: "${query || '(URL-only)'}"${linkContext}

STEP 1 — Identify the song.
${sourceUrl ? 'The user already gave a direct link, so you know the song. Do NOT search for a replacement URL.' : 'Use web_search to locate the exact song on open.spotify.com and youtube.com. Search for the artist + title.'}

STEP 2 — Gather REAL streaming URLs.
${sourceUrl
    ? `Reuse the provided URL in the matching field (${isSpotify ? 'spotifyUrl' : isYoutube ? 'youtubeUrl' : 'spotifyUrl or youtubeUrl'}). For the OTHER platform, you MAY search to find a corresponding real URL, but if you don't find one on the allowed domains return null. Do not invent URLs.`
    : 'Only include a URL in your response if web_search returned that exact URL from open.spotify.com or youtube.com. If no real URL came back from search for a platform, return null for that platform. NEVER fabricate a Spotify track ID or YouTube video ID. A wrong link is worse than no link — if in doubt, return null.'}

STEP 3 — Output one JSON object inside the markers <<<JSON>>> and <<<ENDJSON>>>, and NOTHING else:

<<<JSON>>>
{
  "found": true | false,
  "title": "Song title",
  "artist": "Artist or band name",
  "originalKey": "Unicode key — e.g. 'A', 'D♭', 'F♯'",
  "bpm": 120,
  "spotifyUrl": "https://open.spotify.com/track/... or null",
  "youtubeUrl": "https://youtube.com/watch?v=... or null",
  "flow": [
    {"type": "intro|verse|prechorus|chorus|bridge|tag|breakdown|interlude|instrumental|outro|free",
     "label": "Intro | Verse 1 | Chorus | Bridge | ..."}
  ]
}
<<<ENDJSON>>>

Rules:
- Flow = most common live worship arrangement (typically 8-14 sections).
- Use 'free' for free worship / vamp / extended ministry sections.
- Number repeats only when lyrics differ ("Verse 1", "Verse 2"); choruses usually just "Chorus".
- Use D♭ not Db, B♭ not Bb, F♯ not F#.
- If you can't identify the song at all, return {"found": false} with the rest null.
- URLs must be real — prefer null over a guess.`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 3,
          allowed_domains: STREAMING_DOMAINS,
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    });

    const allText = (msg.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    const parsed = extractJsonBlock(allText);
    if (!parsed) return res.status(502).json({ error: 'Model returned non-JSON', raw: allText.slice(0, 500) });

    // Strip any URL that doesn't look like a real streaming URL shape.
    // sourceUrl is trusted — everything else must have come from web_search.
    if (parsed.spotifyUrl && !looksLikeRealSpotify(parsed.spotifyUrl)) parsed.spotifyUrl = null;
    if (parsed.youtubeUrl && !looksLikeRealYoutube(parsed.youtubeUrl)) parsed.youtubeUrl = null;
    if (sourceUrl && isSpotify) parsed.spotifyUrl = sourceUrl;
    if (sourceUrl && isYoutube) parsed.youtubeUrl = sourceUrl;

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[claude-search]', err);
    return res.status(500).json({ error: err.message || 'Search failed' });
  }
}
