# Song Flow Phase 2 Spec - Team Sharing

Created: 2026-05-12

## Purpose

Phase 2 expands Song Flow from a personal worship-planning editor into a team-ready rehearsal and service-prep view.

The product center stays the same:

- setlist
- flow
- key
- BPM
- chord sheets
- team sharing

Phase 2 should not become Spotify OAuth, Planning Center OAuth, a chat app, or a community arrangement library. Those remain later phases.

## Current Phase 1 Baseline

Phase 1 now supports:

- signed-in owner editor
- public share links at `/view/:shareToken`
- public/team view of setlist, flow, key, BPM, links, and chords
- chord-only public editing through `/api/public-chord-sheet`
- server-side validation that a shared chord edit belongs to the shared setlist
- owner-only structural editing through Supabase RLS

Remaining Phase 1 verification still requires configured environment/auth access:

- signed-in Supabase persistence smoke
- live AI calls
- public chord edit save against production credentials

## Product Rule

The team link should help musicians prepare without giving everyone the power to break the setlist.

Phase 2 should make this explicit:

- the owner controls the service plan
- the team can read the plan
- the team can help correct chord sheets
- broader team editing is future work, not assumed

## Share Modes

### Owner Edit Mode

Audience:

- worship leader / setlist owner

Can edit:

- setlist name/date
- songs
- song order
- title/artist
- key
- BPM
- links
- flow sections
- transitions
- chord sheets

Implementation:

- existing signed-in `src/views/editor.js`
- existing owner-scoped Supabase RLS

### Team View Mode

Audience:

- band members
- vocalists
- MD
- sound/team members who need the plan

Can view:

- service date/name
- songs
- artist
- key
- BPM
- links
- flow
- transitions
- chord sheets

Cannot edit:

- setlist structure
- song order
- keys
- BPM
- links
- flow
- transitions

Implementation:

- existing `src/views/public-view.js`
- public read policies from `0002_share_tokens.sql`

### Team Chord Edit Mode

Audience:

- trusted team members with the share link

Can edit:

- chord sheet content for an existing shared song/key

Cannot edit:

- any other setlist structure
- any song outside the shared setlist

Implementation:

- `/api/public-chord-sheet`
- validates `shareToken -> setlist -> song`
- uses `SUPABASE_SERVICE_ROLE_KEY` only after validation
- no broad anonymous write RLS policy

### Future Full Team Edit Mode

Not Phase 2 unless explicitly approved.

Would require:

- team/member identity model
- invite or membership list
- explicit roles
- edit history or conflict strategy
- stronger audit trail

## Phase 2 Acceptance Criteria

### Permission Clarity

- UI copy clearly says who can edit what.
- Share sheet and public view agree.
- No view says "read-only" if chord edits are enabled.
- No view implies full team editing unless implemented.

### Team View Ergonomics

- Public view is comfortable on phone and tablet.
- Key, BPM, flow, and chord tabs are easy to scan.
- Chord edit affordance is clear but not noisy.
- Spotify/YouTube links remain available.
- The page remains visually aligned with v7.

### Update Awareness

Phase 2 should start light:

- show chord save status
- consider "last loaded" or "refresh" affordance
- avoid realtime subscriptions until there is evidence they are needed

Possible later path:

- Supabase realtime for chord sheet changes
- simple "newer version available" banner
- live refresh for team rehearsal

## Non-Goals

- Spotify OAuth
- saving Spotify playlists
- Planning Center OAuth
- plan/service import from PCO
- chat/comments
- full realtime collaborative editor
- community arrangement library
- anonymous arrangement learning

## Recommended Work Order

1. Verify Phase 1 credentials and production share-chord save.
2. Polish team-share permission language.
3. Improve public view rehearsal ergonomics.
4. Add lightweight update awareness.
5. Re-evaluate whether full team edit mode is actually needed.

## Linear

Project: `Song Flow Phase 2 Team Sharing`

Initial issues:

- `CUS-48` Define team share modes and permission copy
- `CUS-49` Improve public team view rehearsal ergonomics
- `CUS-50` Create Phase 2 team sharing spec in repo
- `CUS-51` Plan lightweight update awareness for shared views
