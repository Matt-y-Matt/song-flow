# Song Flow

Production worship setlist planner — dark editorial theme, AI-assisted song search and chord sheets, Supabase-backed sync.

Stack: **Vanilla HTML/CSS/JS + Vite** · Auth + DB: **Supabase** · Serverless: **Vercel API Routes (Node 20)** · AI: **Anthropic `claude-sonnet-4-20250514`** via serverless only (API key never touches the browser).

## Quick start

```bash
cp .env.example .env     # fill in all four values
npm install
npm run dev              # Vite only — AI endpoints won't work
# or
npx vercel dev           # Vite + Vercel API routes, uses /api/* natively
```

### Environment variables

| Name | Used by | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | client | Public |
| `VITE_SUPABASE_ANON_KEY` | client | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | serverless | Reserved for future admin tasks |
| `ANTHROPIC_API_KEY` | serverless only | Never exposed to the browser |

### Supabase setup

Run `supabase/migrations/0001_init.sql` in your Supabase project (SQL editor). It creates `profiles`, `setlists`, `songs`, `flow_sections`, `chord_sheets`, sets up RLS policies scoped to `auth.uid()`, and wires a trigger that creates a profile row when a user signs up.

For Google OAuth, enable the Google provider in Supabase Auth → Providers and add your site URL to the redirect allowlist.

### Deploy (Vercel)

1. Push this repo to GitHub.
2. Vercel → New Project → import this repo.
3. Set the four env vars in Project Settings → Environment Variables.
4. `vercel.json` declares the build command, output directory, and SPA rewrite; `api/*.js` files are auto-detected as serverless functions.

## Architecture

```
index.html ─▶ src/main.js
                 ├─ getSession() → views/login.js   (signed out)
                 └─ getSession() → views/editor.js  (signed in)

src/lib/
  supabase.js     — singleton client
  auth.js         — Google OAuth + magic link + session listener
  library.js      — CRUD for setlists/songs/flow_sections/chord_sheets, debounced save queue
  ai.js           — thin wrappers around /api/claude-search and /api/claude-chords

src/views/
  login.js        — dark editorial login
  editor.js       — port of the v7 editor; drag/drop, swipe tabs, sheets, inline edit
  editor-shared.js — SVG icons + type/key constants + helpers (escapeHtml, formatDate…)
  library-sheet.js — setlist library sheet body

api/
  claude-search.js  — POST {query, sourceUrl} → song preset JSON
  claude-chords.js  — POST {title, artist, keyOf, flow} → plain-text chord sheet
  pco-search.js     — stub (returns 401 until Planning Center OAuth is wired)
```

### Save model

Save is debounced (~400ms). Each flush does a full-setlist upsert:

1. Update the `setlists` row.
2. Diff and delete any songs no longer in state.
3. Upsert remaining songs (positions, fields).
4. Delete & reinsert all `flow_sections` for the setlist's songs.
5. `chord_sheets` are written separately when AI generates a sheet — never touched by structural saves.

Client UUIDs (`crypto.randomUUID()`) are used for all row IDs so client state and DB stay in sync without round-trips.

## Keyboard & gestures

- Tap a title, label, artist, setlist name → inline edit (Enter saves, Esc cancels).
- Drag `⋮⋮` handles → reorder sections / songs.
- Swipe left/right inside a song card → toggle **Flow** ↔ **Chords**.
- Tap the section tag → cycles through all types.
