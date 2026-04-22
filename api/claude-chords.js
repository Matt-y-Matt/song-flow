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

  const prompt = `You are a worship music assistant creating a chord chart reference for a worship team rehearsal. Generate a chord-only chart (no full lyrics needed) for "${title}"${artist ? ` by ${artist}` : ''} in the key of ${keyOf}.

Arrangement:
${flowDescription}

Output format — plain text only, no markdown:

[SECTION NAME]
Chord1    Chord2    Chord3    Chord4
(optional: 2-3 keyword cue words to identify the line, not full lyrics)

Rules:
- Section headers in [SQUARE BRACKETS] matching the arrangement above.
- Each line shows chord symbols only, spaced to indicate timing/beats.
- Use unicode ♭ and ♯ (not b/#). Use slash chords where natural (e.g. ${keyOf}/E).
- If you know the chord progression for this song, use it. If not, generate a musically appropriate progression in ${keyOf} that fits the section type (verse, chorus, bridge etc).
- Add brief cue words (2-3 words max) below chord lines if helpful for navigation — these are NOT full lyrics.
- NO commentary, NO apologies, NO markdown fences, NO explanations. Pure chord chart only.
- This is for personal rehearsal use by a worship team, not for publication.`;

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
