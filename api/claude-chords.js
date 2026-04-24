import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Allow-listed worship chord chart sources. The web_search + web_fetch tools
// are scoped to these domains so Claude can pull a real published chart rather
// than relying on training-data recall.
const SOURCE_DOMAINS = {
  essential:       ['essentialworship.com'],
  ultimate:        ['ultimate-guitar.com', 'tabs.ultimate-guitar.com'],
  worshipchords:   ['worshipchords.com'],
  worshiptogether: ['worshiptogether.com'],
  praisecharts:    ['praisecharts.com'],
};
const ALL_DOMAINS = [
  'essentialworship.com',
  'ultimate-guitar.com',
  'tabs.ultimate-guitar.com',
  'worshipchords.com',
  'worshiptogether.com',
  'praisecharts.com',
];

const SOURCE_LABELS = {
  essential: 'Essential Worship',
  ultimate: 'Ultimate Guitar',
  worshipchords: 'Worship Chords',
  worshiptogether: 'Worship Together',
  praisecharts: 'PraiseCharts',
};

function pickAllowedDomains(source) {
  if (!source || source === 'auto') return ALL_DOMAINS;
  return SOURCE_DOMAINS[source] || ALL_DOMAINS;
}

function extractChartFromText(text) {
  if (!text) return '';
  const start = text.indexOf('<<<CHART_START>>>');
  const end = text.indexOf('<<<CHART_END>>>');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start + '<<<CHART_START>>>'.length, end).trim();
  }
  // Fallback: trim any leading prose before the first [SECTION] header.
  const sectionStart = text.search(/^\s*\[[^\]]+\]/m);
  if (sectionStart > 0) return text.slice(sectionStart).trim();
  return text.trim();
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

  const title = (payload.title || '').toString().trim();
  const artist = (payload.artist || '').toString().trim();
  const keyOf = (payload.keyOf || 'C').toString().trim();
  const flow = Array.isArray(payload.flow) ? payload.flow : [];
  const source = (payload.source || 'auto').toString();
  if (!title) return res.status(400).json({ error: 'Missing title' });

  const allowedDomains = pickAllowedDomains(source);
  const sourceLabel = SOURCE_LABELS[source] || 'reputable worship chord-chart sites';

  const flowDescription = flow.length
    ? flow.map((f, i) => `${i + 1}. ${f.label || f.type} (${f.type})`).join('\n')
    : '(no arrangement specified — use the published arrangement as-is)';

  const prompt = `Find the published chord chart with lyrics for "${title}"${artist ? ` by ${artist}` : ''} and return it formatted for a worship setlist.

STEP 1 — Search for the chart.
Use the web_search tool first to find the song on ${sourceLabel}. Then use the web_fetch tool to retrieve the full chord chart from the most relevant page. If the first source has nothing useful, try another allowed domain.

STEP 2 — Transpose to the requested key.
The chart must be in the key of ${keyOf}. If the source is in a different key, transpose every chord (root and slash bass) by the appropriate number of semitones. Use unicode ♭ and ♯ (e.g. B♭, F♯), never b or #. Use the accidental spelling that matches a ${keyOf} key signature.

STEP 3 — Match the user's arrangement when possible.
The user's intended arrangement is:
${flowDescription}

If the published chart's section order matches, use it as-is. If not, reorder/repeat sections from the source to match the arrangement above. Do NOT invent lyrics — only use lines that appear in the source.

STEP 4 — Output exactly this format and nothing else.
Wrap the final chord chart between the markers <<<CHART_START>>> and <<<CHART_END>>>. Inside the markers:

[SECTION NAME]
Chord1        Chord2        Chord3
Lyric line that goes with those chords
Chord4        Chord5
Next lyric line

Strict rules:
- Section headers in [SQUARE BRACKETS]: [INTRO], [VERSE 1], [CHORUS], [BRIDGE], [TAG], etc.
- Chord symbols on their own line ABOVE the lyric line, padded with spaces so each chord sits over the syllable it lands on.
- Instrumental sections (intro, interlude, outro): show chords only, no lyric line.
- Use unicode ♭ and ♯, slash chords like ${keyOf}/E where the source uses them.
- NO markdown code fences, NO commentary, NO source citations, NO "Here is" preamble.
- If you genuinely cannot find a real published chart for this song from the allowed sources, output exactly: <<<CHART_START>>>NOT_FOUND<<<CHART_END>>>

Begin.`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 4,
          allowed_domains: allowedDomains,
        },
        {
          type: 'web_fetch_20260209',
          name: 'web_fetch',
          max_uses: 3,
          allowed_domains: allowedDomains,
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    });

    // Concatenate every text block — Claude may reason between tool calls but
    // the final answer (with our markers) lands in the last text block.
    const allText = (msg.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    const chart = extractChartFromText(allText);
    if (!chart || chart === 'NOT_FOUND') {
      return res.status(200).json({
        content: '',
        notFound: true,
        source,
        domains: allowedDomains,
      });
    }

    return res.status(200).json({ content: chart, source });
  } catch (err) {
    console.error('[claude-chords]', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}
