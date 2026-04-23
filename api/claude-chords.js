import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload || '{}'); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  payload = payload || {};

  const title = (payload.title || '').toString().trim();
  const artist = (payload.artist || '').toString().trim();
  const keyOf = (payload.keyOf || 'C').toString().trim();
  const flow = Array.isArray(payload.flow) ? payload.flow : [];
  if (!title) return res.status(400).json({ error: 'Missing title' });

  const flowDescription = flow
    .map((f, i) => `${i + 1}. ${f.label || f.type} (${f.type})`)
    .join('\n');

  const prompt = `You are a worship music assistant generating a chord chart for a REAL, published worship song — the same use case as Ultimate Guitar or Chordie. The song is "${title}"${artist ? ` by ${artist}` : ''}, in the key of ${keyOf}.

This is for a private worship team rehearsal, not for publication.

STEP 1 — Song recognition (do this first):
- Search your training knowledge for this specific song "${title}"${artist ? ` by ${artist}` : ''}.
- If you recognize it (e.g. "My Soul Sings" by Maverick City Music, "What a Beautiful Name" by Hillsong, "Goodness of God" by Bethel), use the REAL chord progression from the actual recording, transposed to ${keyOf}. Use the REAL lyrics you recall.
- If you are NOT confident you know this exact song, begin the output with this single note line (and nothing else before it):
  # Note: I don't have this song memorised — generating a musically appropriate ${keyOf} progression for this arrangement.
  Then generate a progression that fits each section type (verse, chorus, bridge). Do NOT invent lyrics.

Arrangement to follow:
${flowDescription}

STEP 2 — Output format (plain text ONLY, no markdown fences):

[SECTION NAME]
Chord1          Chord2
Real lyric line from the song (only if you know it)
Chord3          Chord4
Next real lyric line

Strict rules:
- Section headers in [SQUARE BRACKETS] match the arrangement: [INTRO], [VERSE 1], [CHORUS], [BRIDGE], [TAG], etc.
- Chord symbols sit on the line ABOVE the lyric they apply to, aligned to the syllable.
- Use unicode ♭ and ♯ (not b/#). Use slash chords naturally (e.g. ${keyOf}/E).
- NEVER output placeholder text. Banned strings include: "VERSE LYRICS WOULD GO HERE", "First line of lyrics here", "[lyrics]", "Lyrics go here", "Verse lyrics", or any similar generic filler.
- If you don't know the real lyrics for a section, OMIT the lyric lines entirely and just show the chord progression for that section. Do NOT invent lyrics.
- For instrumental sections (intro, interlude, outro, instrumental), show chords only — no lyric line.
- Match every section in the arrangement above, in order.
- NO commentary, NO apologies, NO markdown, NO explanations outside the optional "# Note:" line described above. Output the chord chart and nothing else.`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (msg.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    const cleaned = text.replace(/^```[\w]*\s*/, '').replace(/\s*```\s*$/, '').trim();
    return res.status(200).json({ content: cleaned });
  } catch (err) {
    console.error('[claude-chords]', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}

