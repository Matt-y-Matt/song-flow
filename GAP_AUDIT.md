# Song Flow Gap Audit

Created: 2026-05-11

## Executive Read

The repo is a real working app, not a stub. It already carries most of the v7 worship-planning workflow into a Supabase-backed Vite app: multi-setlist library, editor, flow/chords tabs, Sortable reorder, AI song search, AI chord generation, chord caching per key, share links, and a public view.

The biggest current risk is not missing UI. It is behavioral drift between the docs, database policies, and share-link editing claims. The public view now renders editable chord sheets, but the Supabase migrations only grant public reads by share token. Anonymous public writes to `chord_sheets` should fail under current RLS. The app also says "read-only link" in the editor share sheet while the public banner says "Chord edits are shared."

## What The Repo Already Has

### Product Core

- Signed-in editor routed from `src/main.js`.
- Public share route at `/view/:token`.
- Supabase auth via Google and magic link.
- Multi-setlist library with create, rename, duplicate, delete, and load.
- Setlist date and name editing.
- Song add, delete, reorder, and inline title/artist editing.
- Per-song key and BPM editing.
- Flow sections with add, delete, type cycling, label editing, notes, and drag ordering.
- Transition labels/styles between songs.
- Spotify and YouTube link storage and link buttons.
- Flow/chords dual tab per song, including swipe-style horizontal view behavior.
- AI song search through Vercel route.
- AI chord generation through Vercel route.
- Chord sheets stored per song and key.
- Manual chord editing in editor and public view UI.
- Share token generation and public read view.
- PCO search route and Add Song PCO tab when credentials exist.

### Design System

- v7 dark editorial look is largely preserved in `src/styles.css`.
- Fonts match brief: Fraunces, Manrope, JetBrains Mono.
- Core palette matches brief: gold, sage, rose, sky, lilac, amber.
- Song cards, sheets, tabs, pills, transitions, and chord typography resemble v7.

### Build Health

- `npm run build` passes as of 2026-05-11.
- Vite transforms 54 modules and emits production assets successfully.

## What The Brief Says Matters

The brief prioritizes:

- Worship-service planning over generic music features.
- Key/chord/flow confidence during live worship.
- AI chord sheet per key, cached and instant.
- Fast mobile/tablet usability.
- Shareable setlist for the team.
- Stabilization before integrations.
- Avoiding Day 1 drift into Spotify OAuth, Planning Center clone behavior, or community library.

## Drift And Regressions From v7 Or The Brief

### Critical

1. Public chord editing appears unsupported by current RLS.
   - `src/views/public-view.js` calls `updateChordSheet`.
   - `src/lib/library.js` writes directly to `chord_sheets` through the browser Supabase client.
   - `supabase/migrations/0002_share_tokens.sql` explicitly says public writes remain gated by owner-only policies.
   - Result: share-link visitors can see edit UI, but anonymous saves should fail unless they are also the owner in the current session.

2. Share copy contradicts share behavior.
   - `src/views/editor.js` share sheet says "Read-only link".
   - `src/views/public-view.js` banner says "Chord edits are shared".
   - Phase 1 must choose and implement one truthful behavior.

### High

3. README is stale in several places.
   - It describes `api/pco-search.js` as a stub returning 401, but the route now attempts PCO API calls using server-side credentials.
   - It says AI uses `claude-sonnet-4-20250514`; current API routes use `claude-haiku-4-5`.
   - Some punctuation is mojibake, which makes the setup docs feel rough.

4. "Adaptive key transposition" is not clearly implemented.
   - Current behavior is cached chord sheets per key plus AI generation per key.
   - There is no obvious deterministic transpose utility in `src` or `api`.
   - If the product promise is instant transposition, this is a gap. If the promise is AI chart per selected key, the wording should be tightened.

5. Product focus risk: PCO is already more than a stub.
   - Brief says PCO should remain Phase 3/4, not Day 1.
   - Current Add Song sheet includes Web, PCO, and Blank tabs.
   - This may be acceptable as a hidden/credential-gated option, but Phase 1 should not spend stabilization time expanding it.

### Medium

6. Role/context tags and section repeat counts are listed in the brief's known feature history but are not visible in the current data model.
   - Current flow sections have `type`, `label`, and `note`.
   - Songs have no role/context tag field.
   - Sections have no explicit repeat count field.
   - If these matter for v7 history, they should be re-scoped after Phase 1 stabilization.

7. Public share view is intentionally less capable than editor, except chord edit UI.
   - Public view has static key/BPM, no flow editing, no song reordering.
   - This matches a view-first team link, but conflicts with "collaborative editing by the whole team" if that is meant broadly.

8. Chord edit state is ephemeral and local.
   - There is no conflict handling for simultaneous edits.
   - Last writer wins if public writes are enabled later.
   - Phase 1 can accept this if copy says "shared chord edits" rather than full collaboration.

9. Generated chord sheets depend heavily on model recall.
   - The chord prompt asks for real progressions and lyrics if known, but the app has no source citation or confidence display beyond optional model note.
   - The disclaimer is correct: verify before service.

### Low

10. `dist/` is present in the repo.
    - This is workable but should be intentional. If Vercel builds from source, committed dist can create noise.

11. Documentation artifacts were missing.
    - `PHASE_1_SPEC.md`, `GAP_AUDIT.md`, and `NEXT_SESSION.md` did not exist before this audit.

## Comparison To v7 Prototype

Preserved from v7:

- Dark visual system and musician-first UI.
- Multi-setlist library concept.
- Song cards with key, BPM, links, flow/chords tabs.
- Drag/drop songs and sections.
- Section type system.
- Transition labels between songs.
- Add Song search with URL awareness.
- AI chord generation per key.
- Chord chart formatting with bracketed sections and chord-line highlighting.

Improved beyond v7:

- Supabase persistence instead of localStorage.
- Authenticated multi-device sync.
- Serverless AI key isolation.
- Public share-token route.
- Editable chord sheets.
- PCO API route, if credentials are configured.

Drift from v7:

- v7 was internally consistent because everything was local client state. Current Supabase/RLS rules introduce real permission boundaries that the UI must respect.
- v7 Add Song was one search surface; current Add Song has Web/PCO/Blank tabs, which is more complex.
- v7 direct Anthropic calls lived in the prototype; current serverless routes are safer but docs must reflect them.

## Recommended Decisions

1. Treat public chord editing as the first stabilization decision.
   - Option A: keep share links view-only in Phase 1 and remove/disable public chord edit UI.
   - Option B: support chord-only public edits through a narrow serverless route that validates share token and song membership before updating `chord_sheets`.
   - Do not add broad anonymous RLS write policies to all shared setlist data.

2. Make README truthful before more features.
   - Update model names, PCO route description, share-link behavior, and setup notes.

3. Keep PCO frozen unless it blocks existing Add Song behavior.
   - No OAuth.
   - No plan syncing.
   - No expanded PCO workflow in Phase 1.

4. Define "adaptive key transposition."
   - If using AI-per-key, call it "AI chord sheet per key."
   - If instant transpose is required, schedule a focused implementation after public/share behavior is stable.
