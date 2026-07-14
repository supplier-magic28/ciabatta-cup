# Design Implementation Guide

This is the maintained bridge between the application and the approved Claude
design handoff. It records what the product implements today; it does not
replace the raw handoff artifacts.

## Sources of truth

- Raw reference screens and art direction:
  `design-reference/design_handoff_ciabatta_cup/`.
- Personal tennis calendar handoff: `design-reference/calendar design.zip`
  (the supplied reference bundle; production implementation is `/calendar`).
- Configurable cup-builder handoff: `design-reference/tournament build update.zip`.
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
| 01 Leaderboard | `/` | Partial | Holder history, canonical activity points, repeated trophies, expandable ranked/set/tournament/non-ranked/external records, global expansion, and immediate profile-navigation feedback are live; filters, last-five form, and side rail are pending. |
| 02 Player profile | `/players/[playerId]` | Partial | Hero, the same career aggregates as leaderboard history, canonical award/decay points history, head-to-head, match log, nickname/avatar rendering, and profile-shaped loading are live; richer trend interaction is pending. |
| 03 Log match | `/matches`, `/matches/new` | Partial | Matches owns all visible result-entry links; participant submission and audited any-two-player organiser finalization share the validated score wizard with stable pending feedback. The flow is not yet a full visual recreation of every handoff state. |
| 04 Tournaments | `/tournaments`, `/tournaments/[tournamentId]` | Implemented | Event cards, optional cropped cover photos, live standings, qualification state, round/court schedule, results, final rules, champion, and responsive loading boards are live. Self-entry and multi-structure filtering remain deferred. |
| 05 Sign in | `/sign-in`, `/sign-up`, `/accept-invite` | Implemented | Sign-in, signup, and invite password setup use the token-driven auth shell with stable pending controls and a matching form skeleton; safe internal return paths preserve email and notification deep links through authentication. |
| 06 Admin dashboard | `/admin/approvals`, `/admin/players`, `/admin/health` | Partial | Approval queue, roster, per-action pending feedback, loading queues, and green/amber/red backend health with guarded recovery controls exist as focused routes; general activity feed is pending. |
| 07 Manage tournament | `/admin/tournaments/new`, `/admin/tournaments/[tournamentId]` | Implemented | Photo-first partial creation, 2–8 ordered seats, reversible schedule lock, independent formats, three championship paths, permanent atomic draw lock, multi-set scoring, deciders, finals, and recovery-aware email controls are live. Withdrawals and post-lock substitutions remain deferred. |
| Claymore trophy + invites | `/admin/tournaments/[tournamentId]`, `/tournaments/[tournamentId]`, `/notifications`, `/` | Implemented | An ordinary cup can own the Claymore collectible; organisers over-invite the bench by email plus Zeus, players RSVP without taking a roster seat, the director retains final-field authority, saved photo crop metadata reaches email, and official winners wear the badge in ladder history. Native push remains deferred. |
| 08 Manage players | `/admin/players` | Partial | Invite, roster status, safe deletion of unused players, and stable pending/loading states are live; edit, deactivate, resend, and revoke flows are pending. |
| My tennis calendar | `/calendar` | Implemented | Responsive grid/list, image-rich day and event drill-down, range-independent recent history, explicit outcomes, URL-preserved instant client controls, cup aggregation including public dated drafts for open-field discovery, private Non-Ciabatta facts, upcoming plans, and a canonical-ledger scorecard are live. |
| Password recovery | `/forgot-password`, `/update-password` | Implemented | Recovery email request, PKCE callback, replacement password form, invited-profile activation, and stable pending feedback are live. |
| Profile settings | `/profile` | Implemented | Self-owned nickname preference, circular avatar crop/upload/remove, stable pending feedback, and responsive loading are live. |
| Profile streak | `/profile/streak` | Implemented | Melbourne-day 7/30 tracker, current/best streak, manual today mark, and route-shaped loading are live. |
| Profile history | `/profile/history` | Implemented | URL-preserved H2H/tournament views, five-match gate, full result ledger, private external opponents, and entered-event cards are live. |
| Non-Ciabatta opponents | `/matches/new`, `/matches`, `/`, `/players/[playerId]` | Implemented | Owner-private saved names, immediate unranked approval, flat +10 scoring, owner deletion with cache rebuild, a standard leaderboard history line for every player, generic shared identity, and win/loss result email are live. |
| Courts and surfaces | `/matches/new`, `/matches/untagged`, `/courts/[courtId]`, `/players/[playerId]` | Implemented | Shared court typeahead, optional surface chips, metadata-only retro tagging, court detail/tallies, surface records, tournament defaults, and organiser merging are live. |
| Zeus inbox | `/notifications` | Implemented | Permanent Zeus portrait/inbox across empty, read, and unread states; a dedicated top-right Zeus-avatar action updates live for the receiver through owner-filtered Realtime, with focus recovery, failure-aware mark-all-read, navigation-only actions, planned-match destinations, and weekly-deduped untagged nudges. |
| Match workflow recovery | `/matches`, `/matches/[plannedMatchId]`, `/admin/approvals` | Implemented | Unfinished plans remain discoverable, score entry opens after the scheduled instant, either participant can submit with the correct perspective, queried scores receive append-only organiser corrections, and ordinary queried results can be corrected and resent. |

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
- After server confirmation, action controls distinguish a transition failure
  from committed success with an organiser-recovery warning for a stale points
  cache or failed secondary delivery.
- Notification actions acknowledge immediately with an Opening state and show
  an absolute Melbourne timestamp before navigating to their precise target.
- Leaderboard profile actions prefetch their dynamic destination, display an
  immediate `Opening…` state, and hand off to the profile-shaped loading route.
# Calendar projection

Calendar controls preserve validated URL state while grid/list, month, range,
filter, day, and event transitions update immediately over the fixed
server-loaded event set and remain compatible with browser back/forward.
Current rank and total never vary with range or visibility filters; window
awards, decay, and net movement are canonical ledger slices rather than copied
point rules. Cup covers and paired player identities are shared across recent
history, list, day, and event-detail surfaces; the month grid stays compact.

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
