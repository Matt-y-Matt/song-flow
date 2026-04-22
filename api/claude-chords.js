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

  const prompt = `You are a worship music assistant. Generate a full chord chart with lyrics for "${title}"${artist ? ` by ${artist}` : ''} in the key of ${keyOf}, formatted exactly like Ultimate Guitar or Chordie.

This is for a private worship team rehearsal — the same use case as any chord/lyric website. Output the real chords and lyrics if you know this song. If you don't know the exact lyrics, use the actual chord progression with approximate or partial lyrics as cues.

Arrangement to follow:
${flowDescription}

Output format — plain text ONLY, no markdown fences:

[SECTION NAME]
Chord1          Chord2
Lyric line that the chords play over
Chord3          Chord4
Next lyric line

Rules:
- Section headers match the arrangement: [INTRO], [VERSE 1], [CHORUS], [BRIDGE], [TAG], etc.
- Chord symbols sit on the line ABOVE the lyric they apply to, aligned to the syllable.
- Use unicode ♭ and ♯ (not b/#). Use slash chords naturally (e.g. ${keyOf}/E).
- Use the REAL chords for this song if you know them. Do not make up generic placeholder text like 'verse lyrics go here'.
- If you genuinely don't know the exact lyrics, write the chord progression with short cue phrases from the actual song.
- Match every section in the arrangement above.
- NO commentary, NO apologies, NO markdown, NO explanations. Output the chord chart and nothing else.`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
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
