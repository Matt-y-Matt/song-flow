# Song Flow - Project Brief

_Created 2026-05-11 from Matt's Codex briefing. Read this before changing product direction or major UX._

## 1. What this is

Song Flow is an AI-powered worship planning PWA for worship leaders and teams.

It is rooted in Matt's own church community and weekly worship context. Matt plays acoustic guitar and is actively involved in worship, so this is not an abstract market-research project. It is a real tool for a real pain: planning worship services across WhatsApp messages, spreadsheets, notes, YouTube links, and scattered chord sheets.

Build it first for Matt and worship leaders like him.

## 2. Product identity

Working name: Song Flow.

Purpose:

- Discover songs.
- Build service flow.
- Manage chord sheets.
- Generate AI chord sheets per key.
- Arrange sections for Sunday service.
- Share the setlist with the team.

Do not drift into:

- Generic music streaming.
- Generic Notion-like planning.
- Large-church enterprise production software.
- Planning Center clone on Day 1.

Song Flow is a worship musician's planning tool: dark, fast, intentional, mobile-friendly, and purpose-built for small-to-medium worship teams.

## 3. Current implementation context

This is not greenfield.

Existing repo:

- `D:\AI\projects\song-flow`

Current stack in repo:

- Vanilla HTML/CSS/JS + Vite.
- Supabase auth + DB.
- Vercel API routes.
- Anthropic API for AI search/chords.
- Sortable.js.
- PCO search stub.

Existing important files:

- `README.md`
- `song_flow_impact_v7.html`
- `src/main.js`
- `src/views/editor.js`
- `src/views/login.js`
- `src/views/library-sheet.js`
- `src/lib/library.js`
- `src/lib/ai.js`
- `src/lib/supabase.js`
- `api/claude-search.js`
- `api/claude-chords.js`
- `api/pco-search.js`
- `supabase/migrations/0001_init.sql`

Older exported versions may also exist outside this repo in Downloads. If doing historical archaeology, inspect `song_flow_impact_v1.html` through `song_flow_impact_v7.html` where available.

## 4. Known current features

From the v7 prototype and current repo:

- Multi-setlist library.
- Create/name/manage setlists.
- Per-song dual-tab view: Flow and Chords.
- Drag-and-drop song/section ordering.
- Persistent library model migrated from earlier prototype.
- AI-generated chord sheets.
- Chord sheets cached per key.
- Adaptive key transposition.
- BPM field.
- Original key stored separately.
- Spotify/YouTube link support in prototype history.
- Transition labels between songs.
- Role/context tags per song.
- Section repeat counts.
- Supabase-backed sync in current repo.

The irreplaceable feature:

- AI chord sheet per key, cached and instant. Changing key should not break the worship leader's live-service workflow.

## 5. Design system lock

Future features must conform to this aesthetic.

Fonts:

- Fraunces: display/headings.
- Manrope: body/UI.
- JetBrains Mono: chord sheets and technical content.

Color tokens:

- Gold: `#d4a574`
- Sage: `#8fb89b`
- Rose: `#d98a7a`
- Sky: `#8ba7c4`
- Lilac: `#b49bc4`
- Amber: `#e0b84a`

Aesthetic:

- Dark background.
- Warm accent palette.
- Premium and intentional.
- Musician's personal tool + production-quality app.
- Not generic church software.
- Not a streaming app.

## 6. Target user

Primary:

- Matt and worship leaders at his church.
- People planning Sunday services.
- People who understand key, capo, BPM, chord sheets, flow, and transitions.

Secondary:

- Worship leaders and coordinators at 50-300 person churches.
- Volunteer or part-time teams.
- Churches that are too small or too informal for heavy enterprise worship planning tools.

User priorities:

- Speed.
- Accuracy.
- Simplicity.
- Mobile/tablet usability.
- Chord/key confidence during live worship.

## 7. Product phases

### Phase 1 - Stabilize/deploy what exists

- Ensure current Vite/Supabase/Vercel app runs cleanly.
- Verify Supabase schema and auth.
- Verify AI chord generation.
- Verify setlist persistence.
- Verify v7 behavior survived the repo migration.
- Deploy to a stable domain.

### Phase 2 - Team sharing

- Share setlist with team.
- View-only and edit modes.
- Everyone sees same flow/chords.
- Basic update notifications.

### Phase 3 - Deeper integrations

- Full Spotify OAuth if truly needed.
- Save selected songs to Spotify playlist.
- Planning Center Online OAuth/library integration.
- Keep PCO as Phase 3/4, not Day 1.

### Phase 4 - Community arrangement library

Long-term moat:

- Every worship team edits AI-generated flow to match how they actually play a song.
- Over time, Song Flow accumulates real Sunday-service arrangements.
- This is not studio recordings, not sheet music, not Spotify.
- It is collective worship-service practice.

Architectural warning:

- Do not make early choices that prevent future anonymized/community arrangement learning.

## 8. Immediate next actions

For a new Codex/project chat:

1. Read `PROJECT_BRIEF.md`.
2. Read `README.md`.
3. Run `npm run build`.
4. Inspect current app against `song_flow_impact_v7.html`.
5. Identify drift/gaps from v7 to current repo.
6. Fix the highest-impact regression before adding features.
7. Update `NEXT_SESSION.md`.
8. Commit small changes.

## 9. Suggested main organiser flow

First chat should act as organiser/architect:

- Understand current repo.
- Compare current app to v7 brief.
- Decide if build should be sequential or split into worker chats.
- Define file ownership before parallel work.
- Prefer stabilization before new feature expansion.

Do not start with PCO, Spotify OAuth, or community library until the core setlist + chord workflow is excellent.

## 10. Bottom line

Song Flow matters because worship planning is recurring, practical, and personal.

The product should save a worship leader from the weekly scramble: "What songs are we doing, what key, what flow, where is the chord sheet, and how do I share it with the team?"

Make the key/chord/flow loop perfect first. Everything else earns its place after that.

