# Song Flow

Song Flow is a production worship setlist planner: dark editorial UI, AI-assisted song search and chord sheets, Supabase-backed sync, and share links for worship teams.

It is built first for the core worship-planning loop: setlist, song flow, key, BPM, chord sheets, and team sharing. It is not a streaming app or a Planning Center clone.

## Stack

- Frontend: vanilla HTML/CSS/JS with Vite
- Auth and database: Supabase
- Serverless: Vercel API Routes on Node 20
- AI: Anthropic `claude-haiku-4-5` via serverless routes only
- Drag/drop: Sortable.js
- Optional library search: Planning Center Services via server-side personal access credentials

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev
```

`npm run dev` starts Vite only. API routes under `/api/*` require Vercel's local runtime:

```bash
npx vercel dev
```

## Environment Variables

| Name | Used by | Required | Notes |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | client + serverless | yes | Public Supabase project URL. Also used by serverless routes that need Supabase. |
| `VITE_SUPABASE_ANON_KEY` | client | yes | Public Supabase anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | serverless | yes for public chord edits | Never expose in browser. Used by `/api/public-chord-sheet` after validating share token and song membership. |
| `ANTHROPIC_API_KEY` | serverless | yes for AI | Used by `/api/claude-search` and `/api/claude-chords`. |
| `PCO_CLIENT_ID` | serverless | optional | Planning Center Services personal access token app ID. |
| `PCO_SECRET` | serverless | optional | Planning Center Services personal access token secret. |

## Supabase Setup

Run the migrations in order in your Supabase SQL editor:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_share_tokens.sql`

The schema includes:

- `profiles`
- `setlists`
- `songs`
- `flow_sections`
- `chord_sheets`

Owner-scoped RLS protects signed-in editing. Share-token policies allow public read access to shared setlists. Public chord-sheet edits do not rely on broad anonymous RLS writes; they go through `/api/public-chord-sheet`, which validates the share token and confirms the song belongs to that shared setlist before upserting the chord sheet with the service role.

For Google OAuth, enable Google in Supabase Auth > Providers and add your site URL to the redirect allowlist.

## Deploy

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Set the environment variables above.
4. Deploy.

`vercel.json` declares the build command, output directory, and SPA rewrite. `api/*.js` files are detected as serverless functions.

## Architecture

```text
index.html -> src/main.js
                |-> views/login.js       signed out
                |-> views/editor.js      signed in
                |-> views/public-view.js /view/:shareToken

src/lib/
  supabase.js  singleton browser Supabase client
  auth.js      Google OAuth, magic link, session listener
  library.js   setlist CRUD, share tokens, save queue, chord writes
  ai.js        wrappers around /api/claude-search and /api/claude-chords

src/views/
  login.js          sign-in screen
  editor.js         primary v7-derived setlist editor
  public-view.js    team share view
  library-sheet.js  setlist library sheet
  editor-shared.js  icons, constants, escape/date helpers

api/
  claude-search.js       POST { query, sourceUrl } -> song preset JSON
  claude-chords.js       POST { title, artist, keyOf, flow } -> chord sheet text
  pco-search.js          POST { query } -> PCO song results when PCO credentials exist
  public-chord-sheet.js  POST { shareToken, songId, keyOf, content } -> validated public chord edit
```

## Save Model

Signed-in editor saves are debounced, about 400ms. Each structural save:

1. Updates the `setlists` row.
2. Deletes songs removed from the current setlist.
3. Upserts current songs with position and fields.
4. Replaces `flow_sections` for the current setlist songs.

Chord sheets are intentionally separate from structural saves:

- AI generation uses `saveChordSheet(songId, keyOf, content)` and updates `generated_at`.
- Signed-in manual edits use `updateChordSheet(songId, keyOf, content)` and preserve `generated_at`.
- Public share chord edits use `/api/public-chord-sheet` through `updatePublicChordSheet(...)`.

Client UUIDs (`crypto.randomUUID()`) are used for row IDs so local state and database rows can stay aligned without extra round trips.

## Core Workflows

- Tap setlist name, song title, artist, or flow label to edit inline.
- Drag song handles to reorder songs.
- Drag flow row handles to reorder sections.
- Tap key or BPM to open editing sheets.
- Tap Spotify/YouTube icons to open or set links.
- Swipe within a song card or tap tabs to switch Flow/Chords.
- Generate chord sheets per song key.
- Edit chord sheets manually with autosave.
- Share a team link: anyone with the link can view the setlist and edit chord sheets; setlist structure remains owner-only.

## Product Guardrails

Phase 1 is stabilization:

- Keep the setlist + chord + key + flow loop reliable.
- Keep PCO and Spotify integrations conservative.
- Do not expand into OAuth integrations or community arrangement features until the core workflow is excellent.
