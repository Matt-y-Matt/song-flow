# Song Flow Phase 1 Spec

Created: 2026-05-11

## Purpose

Phase 1 is not expansion. It is the stabilization pass that makes the current Vite/Supabase/Vercel app reliable for the weekly worship-planning loop:

1. Create or open a setlist.
2. Add songs from search, URL, PCO if configured, or blank entry.
3. Edit title, artist, key, BPM, flow, transitions, links, and order.
4. Generate or edit chord sheets per key.
5. Share the service plan with the team.
6. Trust that saves, reloads, and share links preserve the worship leader's work.

The product should remain Song Flow: a fast, dark, worship-service planning PWA. Do not turn Phase 1 into a generic streaming app, a Planning Center clone, or a community library.

## Current Stack

- Frontend: vanilla HTML/CSS/JS with Vite.
- Auth and data: Supabase client, auth, RLS, SQL migrations.
- API routes: Vercel Node serverless functions.
- AI: Anthropic server-side calls for song search and chord generation.
- Interaction library: Sortable.js.

## Current App Shape

Entrypoint:

- `src/main.js` routes between signed-out login, signed-in editor, and `/view/:token` public share view.

Core client modules:

- `src/views/editor.js`: primary setlist editor.
- `src/views/public-view.js`: share-link view.
- `src/views/login.js`: authentication screen.
- `src/views/library-sheet.js`: setlist picker sheet markup.
- `src/views/editor-shared.js`: icons, section/key constants, escaping/date helpers.
- `src/lib/library.js`: Supabase CRUD, share tokens, save queue, chord sheet writes.
- `src/lib/ai.js`: browser wrappers around serverless API routes.

Serverless routes:

- `api/claude-search.js`: song metadata and flow search.
- `api/claude-chords.js`: chord chart generation.
- `api/pco-search.js`: Planning Center Services song search when credentials exist.

Database migrations:

- `supabase/migrations/0001_init.sql`: profiles, setlists, songs, flow sections, chord sheets, owner-scoped RLS.
- `supabase/migrations/0002_share_tokens.sql`: public read policies for share-token setlists.

Prototype reference:

- `song_flow_impact_v7.html`: single-file prototype with localStorage library, v7 visual design, flow/chords dual view, link handling, URL search, key/BPM sheets, transitions, and AI prompt shape.

## Phase 1 Acceptance Criteria

### Build and Runtime

- `npm run build` passes with no code errors.
- README setup instructions match actual implementation.
- Environment variable docs match actual serverless routes.
- Production deploy uses the same behavior verified locally.

### Auth and Persistence

- Signed-in user can create, rename, duplicate, delete, and switch setlists.
- Structural edits debounce-save and survive reload:
  - setlist name/date
  - song add/delete/reorder
  - song title/artist/key/BPM
  - Spotify/YouTube links
  - transitions
  - flow sections and order
- Chord sheets are not lost during structural saves.
- Failed saves are visible enough that a worship leader does not assume the plan is safe when it is not.

### Chord and Key Loop

- Chord sheets are cached by `(song_id, key_of)`.
- Changing key immediately shows the chart for that key if cached.
- If no chart exists for the selected key, the UI clearly prompts generation.
- Regeneration intentionally overwrites the current key's generated chart.
- Manual chord edits save reliably and do not require a full setlist save.
- Phase 1 must decide whether "adaptive key transposition" means AI regeneration per key or a deterministic transpose feature. Do not market deterministic transposition unless implemented.

### Flow Loop

- Worship-service flow ordering remains fast on mobile and desktop.
- Section labels, types, notes, and drag order persist.
- Transitions between songs persist.
- The UI preserves the v7 feel: compact, musician-first, dark, gold/sage/rose accents, Fraunces/Manrope/JetBrains Mono.

### Add Song Loop

- Search by text works through `/api/claude-search`.
- Pasted Spotify/YouTube URLs pass both query and source URL context to the API route.
- Search results expose clickable source links when available.
- Adding a search result creates a useful starting song: title, artist, key, BPM, links, and flow.
- Adding a blank song remains available as the fallback.

### Share Loop

- Share links load without auth at `/view/:token`.
- Public share behavior must be internally consistent:
  - Either Phase 1 ships view-only share links, or
  - Phase 1 ships collaborative chord editing with explicit RLS/API support.
- The editor share sheet copy, public banner copy, Supabase policies, and actual browser behavior must agree.

## Out of Scope for Phase 1

- Spotify OAuth.
- Saving or syncing Spotify playlists.
- Full Planning Center OAuth.
- Community arrangement library.
- User/team roles beyond whatever is strictly necessary to make share behavior honest.
- Large refactors or framework migration.

## Recommended Phase 1 Work Order

1. Documentation and architecture audit.
2. Runtime smoke test and README correction.
3. Data/RLS verification, especially share-link chord edits.
4. Core editor regression pass against v7.
5. Share-view behavior decision and implementation.
6. AI/search/chord reliability pass.
7. Production deployment verification.

## Quality Bar

- Prefer small commits with one behavioral purpose.
- Keep file ownership narrow during parallel work.
- Run `npm run build` after every implementation slice.
- For UI changes, use the v7 prototype as the visual reference.
- Do not introduce integrations until the core setlist/chord/key/flow loop is stable.
