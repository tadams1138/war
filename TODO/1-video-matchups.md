# 1 — Video matchups

## Summary
Add the `video` media mode: a War whose contestants carry videos instead of images, and the
matchup experience for it. Today only image Wars exist.

## Technical notes
- `wars.media_mode` already exists (`war-api/src/db/types.ts`, `media_mode: Generated<string>`),
  but the media table is image-only: `contestant_media` (`ContestantMediaTable`) has no video
  schema. `war-api/db/migrations/20260120000000_drop_unused_video_and_ui_registry_schema.sql`
  dropped the earlier unused video schema; a new migration is needed.
- API surface touched: `war-api/src/contestants/` (`mediaService.ts`, `contestantMediaRepository.ts`,
  `mediaPresenter.ts`, `uploadRequest.ts`, `routes.ts`) and the matchup code in `war-api/src/matchups/`.
- UI surface: `war-ui-default/src/vote/`, `components/MatchupView.tsx`, `components/ContestantCard.tsx`,
  `pages/VoteMode.tsx` and the Edit War contestant editor (`src/editWar/EditWarContestant.tsx`).
- Pending (unbound) scenarios: `war-api/specs/features/pending/media-mode.feature` (mode
  mismatch gives 409, publishing requires media matching the mode, unembeddable video rejected)
  and `war-ui-default/features/pending/video-mode.feature` (videos play in sequence, voting
  locked until both have played). When built, move them up to `features/` and bind each step.
- Spec: war-spec.md describes the design; update it as the behavior ships.

## Open questions
- Video sourcing is not recorded: embedded third-party URLs (the pending scenario "An
  unembeddable video is rejected when added" suggests URL attachment) versus uploaded files.
  Decide before designing the schema. If user-supplied URLs get fetched server-side, see #7.
