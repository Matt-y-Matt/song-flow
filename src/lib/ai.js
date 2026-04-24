// Wraps the Vercel serverless endpoints. Browser never sees the Anthropic key.

async function postJSON(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${path} ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export async function searchSong({ query, sourceUrl }) {
  return postJSON('/api/claude-search', { query, sourceUrl: sourceUrl || null });
}

export async function searchPCO({ query }) {
  return postJSON('/api/pco-search', { query });
}

export async function generateChordSheet({ title, artist, keyOf, flow, source }) {
  return postJSON('/api/claude-chords', { title, artist, keyOf, flow, source: source || 'auto' });
}
