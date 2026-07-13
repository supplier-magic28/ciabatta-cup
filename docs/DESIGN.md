# Design Implementation Guide

This is the maintained bridge between the application and the approved Claude
design handoff. It records what the product implements today; it does not
replace the raw handoff artifacts.

## Sources of truth

- Raw reference screens and art direction:
  `design-reference/design_handoff_ciabatta_cup/`.
- Non-Ciabatta feature and email handoff:
  `design-reference/design_handoff_non_ciabatta/`.
- Profile tabs, streak, H2H, and tournament-history handoff:
  `design-reference/design_handoff_profile_updates/`.
- Courts and surfaces handoff: `court locations.zip` supplied externally;
  implemented through the maintained route and component patterns below.
- Planned-match email handoff: `match email updates.zip` supplied externally;
  implemented through the shared table-based email primitives and lifecycle
  mapping described below.
- Authoritative design tokens: `components/tokens.ts` and the matching CSS
  theme in `app/globals.css`.
- Shared production UI vocabulary: `components/README.md`.

Do not edit the files in `design-reference/`. When a screen or reusable visual
pattern changes, update this guide and the component inventory in the same task.

## Screen coverage

| Handoff screen | Production route | State | Current gap |
| --- | --- | --- | --- |
| 01 Leaderboard | `/` | Partial | Holder history, zero-based points, repeated trophy markers, profile links, expandable ordinary match/full-set/tournament records, global history expansion, and a layout-matched loading state are live; filters, last-five form, and side rail are pending. |
| 02 Player profile | `/players/[playerId]` | Partial | Hero, records, points history, head-to-head, match log, effective nickname display, avatar rendering, and profile-shaped loading are live; richer trend interaction is pending. |
| 03 Log match | `/matches`, `/matches/new` | Partial | Submission, required played date, optional location, confirmation, history, score validation, stable pending actions, and route-shaped loading are live; the flow is not yet a full visual recreation of every handoff state. |
| 04 Tournaments | `/tournaments`, `/tournaments/[tournamentId]` | Implemented | Event cards, optional cropped cover photos, live standings, qualification state, round/court schedule, results, final rules, champion, and responsive loading boards are live. Self-entry and multi-structure filtering remain deferred. |
| 05 Sign in | `/sign-in`, `/sign-up`, `/accept-invite` | Implemented | Sign-in, signup, and invite password setup use the token-driven auth shell with stable pending controls and a matching form skeleton. |
| 06 Admin dashboard | `/admin/approvals`, `/admin/players` | Partial | Approval queue, roster, per-action pending feedback, and loading queues exist as focused routes; dashboard stats and activity feed are pending. |
| 07 Manage tournament | `/admin/tournaments/new`, `/admin/tournaments/[tournamentId]` | Partial | Four-player setup, participant replacement, deterministic fixtures, draw locking, lifecycle and placement-recap emails, reviewed result entry, optional standings completion, deciders, finals, and stable pending states are live. Knockout preview and mid-event roster changes are deferred. |
| 08 Manage players | `/admin/players` | Partial | Invite, roster status, safe deletion of unused players, and stable pending/loading states are live; edit, deactivate, resend, and revoke flows are pending. |
| Password recovery | `/forgot-password`, `/update-password` | Implemented | Recovery email request, PKCE callback, replacement password form, invited-profile activation, and stable pending feedback are live. |
| Profile settings | `/profile` | Implemented | Self-owned nickname preference, circular avatar crop/upload/remove, stable pending feedback, and responsive loading are live. |
| Profile streak | `/profile/streak` | Implemented | Melbourne-day 7/30 tracker, current/best streak, manual today mark, and route-shaped loading are live. |
| Profile history | `/profile/history` | Implemented | URL-preserved H2H/tournament views, five-match gate, full result ledger, private external opponents, and entered-event cards are live. |
| Non-Ciabatta opponents | `/matches/new`, `/matches`, `/`, `/players/[playerId]` | Implemented | Owner-private saved names, immediate unranked approval, flat +10 scoring, owner deletion with cache rebuild, a standard leaderboard history line for every player, generic shared identity, and win/loss result email are live. |
| Courts and surfaces | `/matches/new`, `/matches/untagged`, `/courts/[courtId]`, `/players/[playerId]` | Implemented | Shared court typeahead, optional surface chips, metadata-only retro tagging, court detail/tallies, surface records, tournament defaults, and organiser merging are live. |
| Zeus inbox | `/notifications` | Implemented | Permanent Zeus portrait/inbox across empty, read, and unread states; a dedicated top-right Zeus-avatar action updates live for the receiver through owner-filtered Realtime, with focus recovery, failure-aware mark-all-read, navigation-only actions, planned-match destinations, and weekly-deduped untagged nudges. |

## Implementation rules

Password recovery is implemented at `/forgot-password` and `/update-password`
inside the existing auth shell; the callback route is `/auth/confirm`.

- Reuse tokens and shared components before adding page-specific styling.
- Keep the handoff's mobile-first information hierarchy, hard borders, solid
  offset shadows, and typography roles intact.
- Keep Zeus outside the text navigation as a permanent top-right 44px avatar
  action; its rust badge appears only when unread messages exist.
- Dashed borders identify people and actions outside the Ciabatta ladder.
- Nested workflows use the shared arrowed parent link: match history returns to
  Ladder, result entry returns to Matches, and cup/player/admin details return
  to their stable collection or Ladder route.
- A new shared component requires an entry in `components/README.md`.
- A changed route or screen state requires an update to the table above and to
  `STATUS.md` when it changes the current product capability.
- Loading states must reserve the major geometry of their final route at mobile
  and desktop widths. Mutation controls acknowledge immediately but never imply
  that an immutable result or rating changed before server confirmation.
# Ladder points and solo practice addition

## Planned matches and notifications

`/matches/plan` creates a stake-free upcoming-match shell; `/matches/[plannedMatchId]` is the participant review surface for proposal, locked-in, and result states. Zeus notifications live permanently at `/notifications` and are not embedded in Profile, while upcoming plans are public on the ladder.

Locked-in and result-confirmed planned-match emails use the same 600px,
table-based shell as tournament lifecycle mail, with inline tokens, hosted Zeus
imagery, matching plain text, and absolute match/ladder actions. Result cards
state the actual scoring variant: ranked +30/+15, internal exhibition +10 each,
or owner-only +10 for a Non-Ciabatta result. Dates follow Melbourne calendar
boundaries and empty planned locations display as `To be decided`.

The July 2026 points handoff is represented by `/points`, `/practice/new`, practice rows and filters in `/admin/approvals`, and the profile decay-watch card. Crust denotes approval-pending practice; rust denotes permanent point loss. The prototype HTML remains reference-only; production screens use the shared token and component vocabulary.
