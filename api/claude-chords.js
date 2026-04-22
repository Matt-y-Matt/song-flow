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

  const prompt = `Generate a chord chart for the worship song "${title}"${artist ? ` by ${artist}` : ''} in the key of ${keyOf}.

Arrangement to follow:
${flowDescription}

Format the output as plain text following this exact structure:

[INTRO]
| ${keyOf} | <other chords> |

[VERSE 1]
${keyOf}                 <next chord>
First line of lyrics here
<chord>             <chord>
Second line of lyrics here

[CHORUS]
<chord>          <chord>
Chorus lyrics line one
...

Rules:
- Section headers in [SQUARE BRACKETS] uppercase.
- Chord lines have only chord symbols (e.g. ${keyOf}, F♯m, B♭/D), separated by spaces aligned above the words they sound on.
- Use unicode flat (♭) and sharp (♯), not 'b' and '#'.
- Use slash chords where appropriate (e.g. ${keyOf}/E).
- Include 1-2 lines of representative lyrics per section if you know them; if not, leave just the chord progression.
- Match each section in the arrangement above. Use [INSTRUMENTAL] for instrumentals, [VAMP] for free worship vamps.
- Do NOT include any commentary, intro text, or markdown fences. Plain text only.
- Keep it concise — single example pass per section, not every repetition.`;

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
