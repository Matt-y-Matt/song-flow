# Song Flow Next Session

Created: 2026-05-11

## Current State

- Repo path: `D:\AI\projects\song-flow`
- Branch during audit: `master`
- Build: `npm run build` passes.
- App is not greenfield. It has a working Vite/Supabase/Vercel structure and most v7 editor behavior.
- This session produced architecture/spec docs only. No feature code should be mixed into the documentation commit.

## Recommended Build Plan

Phase 1 should be split into focused chats because the app now has real boundaries: frontend editor, public share/RLS, API/search, and docs/deploy verification. Parallel work is useful, but only if each chat owns a narrow file set.

Recommended split: 4 worker chats plus 1 integration chat.

## Work Order

1. Worker Chat A: Share and RLS behavior.
2. Worker Chat B: README and setup truth pass.
3. Worker Chat C: Core editor v7 regression smoke fixes.
4. Worker Chat D: AI/search/chord reliability audit.
5. Integration Chat: merge, build, browser smoke, deploy readiness.

Run Chat A first or at least review its decision before integrating other UI wording, because it determines whether share links are view-only or chord-editable.

## Worker Chat A - Share And RLS

Owns:

- `src/views/public-view.js`
- `src/views/editor.js` only for share-sheet copy and share-related UI
- `src/lib/library.js` only for share/chord update helpers
- `api/*` only if adding a narrow public chord update endpoint
- `supabase/migrations/*` only if adding a targeted migration

Must not touch:

- Add Song search behavior, except share-related copy if necessary
- PCO route behavior
- Global visual redesign
- `song_flow_impact_v7.html`

Goal:

- Make share behavior truthful and working.
- Decide view-only vs chord-editable public links.
- If chord-editable, implement narrow permission path that validates share token and song membership.
- Avoid broad anonymous write policies.

Paste this first message:

```text
We are working in D:\AI\projects\song-flow on Song Flow Phase 1 stabilization.

Read PROJECT_BRIEF.md, PHASE_1_SPEC.md, GAP_AUDIT.md, and NEXT_SESSION.md first.

Your focused task: fix share-link behavior so it is truthful and reliable. Current drift: src/views/public-view.js shows editable chord sheets and calls updateChordSheet, but supabase/migrations/0002_share_tokens.sql grants public read only, so anonymous chord saves should fail. src/views/editor.js also says the share link is read-only while the public banner says chord edits are shared.

You own:
- src/views/public-view.js
- src/views/editor.js only for share-sheet copy/share-related UI
- src/lib/library.js only for share/chord update helpers
- api/* only if a narrow public chord update endpoint is needed
- supabase/migrations/* only if a targeted migration is needed

Do not touch Add Song search, PCO behavior, global redesign, or song_flow_impact_v7.html.

Choose the smallest correct Phase 1 behavior: either restore honest view-only share links or implement chord-only public editing with token validation. Run npm run build. Commit only your focused changes.
```

## Worker Chat B - README And Setup Truth

Owns:

- `README.md`
- `.env.example` only if variables are wrong or missing
- `PROJECT_BRIEF.md` only if there is a factual correction, not product-direction edits

Must not touch:

- Runtime source files under `src/`
- API behavior under `api/`
- Supabase migrations
- Prototype file

Goal:

- Make setup docs match actual app behavior.
- Fix stale PCO description.
- Fix stale model description.
- Fix mojibake in README.
- Document share behavior after Chat A decision if available.

Paste this first message:

```text
We are working in D:\AI\projects\song-flow on Song Flow Phase 1 stabilization.

Read PROJECT_BRIEF.md, PHASE_1_SPEC.md, GAP_AUDIT.md, and NEXT_SESSION.md first.

Your focused task: update README.md so it accurately describes the current app. Current drift: README says pco-search is a stub returning 401, but api/pco-search.js calls Planning Center with PCO_CLIENT_ID/PCO_SECRET if configured. README says AI uses claude-sonnet-4-20250514, but current routes use claude-haiku-4-5. README also has mojibake punctuation.

You own:
- README.md
- .env.example only if environment variables are wrong or missing
- PROJECT_BRIEF.md only for factual correction, not direction changes

Do not touch src/, api/, supabase migrations, or song_flow_impact_v7.html.

Run npm run build only as a sanity check if you changed setup docs that affect commands. Commit only documentation/setup changes.
```

## Worker Chat C - Core Editor v7 Regression Smoke

Owns:

- `src/views/editor.js`
- `src/views/editor-shared.js` only for constants/helpers needed by editor behavior
- `src/styles.css` only for targeted regressions
- `src/lib/library.js` only for persistence defects discovered in core editor save flow

Must not touch:

- Public share behavior, unless only reading for context
- API prompt/model choices
- PCO route implementation
- README/docs
- `song_flow_impact_v7.html`

Goal:

- Compare current editor to v7 prototype for the core setlist, key, chord, and flow loop.
- Fix only high-impact regressions.
- Verify drag/reorder, inline edits, key/BPM, transitions, links, chord generation state, chord edit state, save indicators.

Paste this first message:

```text
We are working in D:\AI\projects\song-flow on Song Flow Phase 1 stabilization.

Read PROJECT_BRIEF.md, PHASE_1_SPEC.md, GAP_AUDIT.md, NEXT_SESSION.md, and inspect song_flow_impact_v7.html as the prototype reference.

Your focused task: regression-smoke the signed-in editor against v7 for the core worship workflow: setlist library, song ordering, flow sections, key/BPM, transitions, links, chords, and save behavior. Fix only high-impact regressions that block the weekly worship-planning loop.

You own:
- src/views/editor.js
- src/views/editor-shared.js only for constants/helpers needed by editor behavior
- src/styles.css only for targeted regression fixes
- src/lib/library.js only for persistence defects in core editor save flow

Do not touch public share behavior, API prompt/model choices, PCO route implementation, docs, or song_flow_impact_v7.html.

Run npm run build. If you make UI changes, start the app and smoke-test the affected workflow in browser if possible. Commit only your focused changes.
```

## Worker Chat D - AI Search And Chord Reliability

Owns:

- `api/claude-search.js`
- `api/claude-chords.js`
- `src/lib/ai.js`
- `src/views/editor.js` only for request/response handling around Add Song and chord generation

Must not touch:

- Share-link permission model
- Supabase schema except if a serious AI persistence bug requires coordination
- README unless only adding a short note after behavior change
- Prototype file

Goal:

- Verify pasted Spotify/YouTube URLs are passed as both `query` and `sourceUrl`.
- Verify source URL context and extracted IDs reach `/api/claude-search`.
- Verify failure states are clear.
- Verify chord generation output rules support worship-service use without placeholder lyrics.
- Keep model/API changes conservative.

Paste this first message:

```text
We are working in D:\AI\projects\song-flow on Song Flow Phase 1 stabilization.

Read PROJECT_BRIEF.md, PHASE_1_SPEC.md, GAP_AUDIT.md, and NEXT_SESSION.md first.

Your focused task: audit and stabilize AI search and chord generation. Confirm Add Song passes pasted Spotify/YouTube URLs as both query and sourceUrl, confirm api/claude-search.js includes source URL plus extracted track/video ID context, and confirm api/claude-chords.js avoids placeholder lyrics and supports per-key worship chord charts.

You own:
- api/claude-search.js
- api/claude-chords.js
- src/lib/ai.js
- src/views/editor.js only for Add Song/chord-generation request and response handling

Do not touch share-link permission behavior, broad Supabase schema, docs except for tiny factual notes, or song_flow_impact_v7.html.

Run npm run build. Commit only your focused changes.
```

## Integration Chat

Owns:

- All files only for integration fixes.
- Should prefer small conflict-resolution edits, not feature expansion.

Must verify:

- `git status` is clean before starting or known worker branches/commits are identified.
- Worker changes do not overlap destructively.
- `npm run build` passes.
- README and app behavior agree.
- Share-link behavior is truthful and functional.
- Public chord editing either works through a deliberate permission path or is not exposed.
- Signed-in editor still covers v7 core workflow.
- Search result links open correctly.
- Pasted Spotify/YouTube URL search still sends direct link context.
- AI chord generation stores chart per selected key.
- Chord edits survive reload in signed-in editor.
- Production deploy checklist is ready.

Paste this first message:

```text
We are working in D:\AI\projects\song-flow as the integration chat for Song Flow Phase 1 stabilization.

Read PROJECT_BRIEF.md, PHASE_1_SPEC.md, GAP_AUDIT.md, and NEXT_SESSION.md first. Then inspect the current git history/status and any worker commits that landed.

Your task: integrate the focused worker changes without adding new product scope. Verify build, docs/app consistency, share-link behavior, signed-in editor core workflow, Add Song URL handling, AI chord generation, and chord edit persistence. Fix only integration defects. Run npm run build and provide a deployment-readiness summary.
```

## Sequential Alternative

If we keep everything in this chat, do the same work in the same order:

1. Share/RLS truth.
2. README truth.
3. Editor v7 regression smoke.
4. AI/search/chord reliability.
5. Integration/deploy.

Sequential is safer for small changes. Split chats are better if speed matters and file ownership boundaries are respected.
