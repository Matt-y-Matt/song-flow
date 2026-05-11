# Song Flow Phase 1 Report

Prepared: 2026-05-12 Asia/Singapore

## Linear

Project: [Song Flow Phase 1 Stabilization](https://linear.app/custore/project/song-flow-phase-1-stabilization-e031ebc6cfb7)

Issues:

- `CUS-42` Done - Fix share-link permission truth for public chord editing.
- `CUS-43` Done - Update README and setup docs to match current app.
- `CUS-44` In Review - Smoke and fix core editor v7 workflow regressions.
- `CUS-45` Done - Audit AI search, URL search, and chord generation reliability.
- `CUS-46` In Progress - Integration verification, status report, and deploy readiness.

## Git

Branch: `codex/song-flow-phase-1`

Commits:

- `be75c1f fix: validate public chord sheet edits`
- `20e9e9a docs: refresh setup and share behavior`
- `3082aaf fix: harden URL song search`

Each slice is a separate commit so it can be reverted independently.

## Completed

- Created Linear project, milestones, and Phase 1 issues.
- Created calendar reminder for the 2026-05-13 10:00 SGT report checkpoint.
- Created a reversible Git branch for Phase 1.
- Implemented chord-only public share editing without broad anonymous RLS writes.
- Updated share copy so the editor and public view agree.
- Rewrote README to match the actual app and current API routes.
- Added PCO credential variables to `.env.example`.
- Hardened Spotify/YouTube URL parsing for Add Song search and API prompt context.
- Debounced paste URL search to avoid repeated duplicate searches.

## Verified

- `npm run build` passes.
- Local Vite app boots.
- Login screen renders.
- Browser console only reports the expected missing Supabase env warning.
- UTF-8 music symbols are correct in source when read as UTF-8.

## Blockers / Risks

- No local `.env` exists in this workspace, so full signed-in Supabase persistence smoke could not be completed locally.
- Live AI route calls were not run locally without `ANTHROPIC_API_KEY`.
- Public chord edit endpoint requires `SUPABASE_SERVICE_ROLE_KEY` in Vercel production.

## Next

1. Verify production/Vercel environment variables include:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - optional `PCO_CLIENT_ID`
   - optional `PCO_SECRET`
2. Push `codex/song-flow-phase-1`.
3. Deploy production.
4. Smoke-test:
   - signed-in editor load
   - setlist save/reload
   - chord generation
   - signed-in chord edit
   - share link load
   - public chord edit
   - pasted Spotify/YouTube Add Song search
5. If Phase 1 passes, start Phase 2 team-sharing scope.
