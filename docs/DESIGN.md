# Design Implementation Guide

This is the maintained bridge between the application and committed design
inputs. It records what the product implements today and is the canonical
design-coverage tracker.

## Sources of truth

Canonical sources must be committed and maintained:

- Implementation coverage and current interaction rules: this file.
- Authoritative tokens/theme: `components/tokens.ts` and `app/globals.css`.
- Shared production vocabulary: `components/README.md`.
- Preserved, Git-tracked visual inputs:
  `design-reference/design_handoff_ciabatta_cup/`,
  `design-reference/design_handoff_non_ciabatta/`, and
  `design-reference/design_handoff_profile_updates/`, and
  `design-reference/design_handoff_my_trophies/`.

Do not edit preserved handoff files. ZIP archives, missing externally supplied
bundles, and untracked files are **not** part of the authority chain. They may
inform one task, but any durable rule must be promoted into this guide, shared
tokens/components, a test, or an intentionally committed extracted reference.
When a route or reusable visual pattern changes, update this guide and the
component inventory in the same task.

## Screen coverage

| Handoff screen | Production route | State | Current gap |
| --- | --- | --- | --- |
| 01 Leaderboard | `/` | Partial | Holder history, canonical activity points, repeated trophies, expandable ranked/set/tournament/non-ranked/external records, global expansion, and immediate profile-navigation feedback are live; filters, last-five form, and side rail are pending. |
| 02 Player profile | `/players/[playerId]` | Partial | Hero, the same career aggregates as leaderboard history, canonical award/decay points history, head-to-head, match log, nickname/avatar rendering, and profile-shaped loading are live; richer trend interaction is pending. |
| 03 Log match | `/matches`, `/matches/new` | Partial | Matches owns all visible result-entry links; participant submission and audited any-two-player organiser finalization share the validated score wizard with stable pending feedback. The flow is not yet a full visual recreation of every handoff state. |
| 04 Tournaments | `/tournaments`, `/tournaments/[tournamentId]` | Implemented | Event cards, optional cropped cover photos, live standings, qualification state, round/court schedule, results, final rules, champion, and responsive loading boards are live. Self-entry and multi-structure filtering remain deferred. |
| 05 Sign in | `/sign-in`, `/sign-up`, `/accept-invite`, `/auth/confirm` | Implemented | Sign-in, signup, invite password setup, and the server callback use the token-driven auth contract with stable pending controls; safe internal return paths preserve email and notification deep links through authentication. |
| 06 Admin dashboard | `/admin/approvals`, `/admin/players`, `/admin/health` | Partial | Approval queue, roster, per-action pending feedback, loading queues, and green/amber/red backend health with guarded recovery controls exist as focused routes; general activity feed is pending. |
| 07 Manage tournament | `/admin/tournaments/new`, `/admin/tournaments/[tournamentId]` | Implemented | Photo-first partial creation, 2–8 ordered seats with persisted players shown in their saved seeds, reversible schedule lock, independent formats, three championship paths, atomic draw lock, and admin pre-play unlock for last-minute field edits are live. The unlock control is usable only while the locked scheduled cup has no match row; the database independently enforces the same boundary and also refuses placement facts. After a completed four-player standings or top-two group stage and before championship scoring, the director may explicitly select two finalists, record a reason, preserve the unplayed decider as visibly skipped, and install one final using the locked group format; the control states that remaining players keep table order as third/fourth. Multi-set scoring, ordinary deciders/finals, and recovery-aware email controls are live. |
| Claymore trophy + invites | `/admin/tournaments/[tournamentId]`, `/admin/tournaments/[tournamentId]/trophy-preview`, `/tournaments/[tournamentId]`, `/notifications`, `/` | Implemented | An ordinary cup can own the Claymore collectible; organisers over-invite the bench by email plus Zeus, players RSVP without taking a roster seat, and the director retains final-field authority. A registered cup also exposes an admin-only pre-event 3D/Android AR preview that reuses the production placement stage without creating an award or engraving. Saved photo crop metadata reaches email, and official winners wear the badge in ladder history. Native push remains deferred. |
| My trophies | `/tournaments`, `/tournaments/[tournamentId]/trophy` | Implemented | The signed-in player always sees a derived wooden trophy case between upcoming cups and the archive. Named awards retain their physical identity; unnamed ranked wins use the event name plus `Cup`, so the Ciabatta Qualifier win is the Ciabatta Qualifier Cup. Repeat wins stay distinct, and owned `?trophy={tournamentId}` deep links open an accessible campaign detail sheet with event-local metadata, preserved cover crop, opponent avatars, and player-oriented scores. Trophy selection brightens on hover, focus, and press, then completes its visible shake before opening; optional synthesized cabinet sounds are on by default and persistently mutable. Registered Claymore and ranked-cup assets open the full-screen 3D viewer with Android WebXR/Scene Viewer placement. Claymore engravings span its lineage; ranked-cup engravings remain event-specific. iPhone Quick Look remains disabled pending physical-device testing. |
| 08 Manage players | `/admin/players` | Partial | Invite, roster status, safe deletion of unused players, and stable pending/loading states are live; edit, deactivate, resend, and revoke flows are pending. |
| My tennis calendar | `/calendar` | Implemented | Responsive grid/list, image-rich day and event drill-down, range-independent recent history, explicit outcomes, URL-preserved instant client controls, cup aggregation including public dated drafts for open-field discovery, private Non-Ciabatta facts, upcoming plans, and a canonical-ledger scorecard are live. |
| Password recovery | `/forgot-password`, `/update-password` | Implemented | Recovery email request, PKCE callback, replacement password form, invited-profile activation, and stable pending feedback are live. |
| Profile settings | `/profile` | Implemented | Self-owned nickname preference, circular avatar crop/upload/remove, stable pending feedback, and responsive loading are live. |
| Profile streak | `/profile/streak` | Implemented | Melbourne-day 7/30 tracker, current/best streak, manual today mark, and route-shaped loading are live. Single-day cup matches use the tournament start date, including legacy scores entered later, so streak and decay agree with the public ladder. |
| Profile history | `/profile/history` | Implemented | URL-preserved H2H/tournament views, five-match gate, full result ledger, private external opponents, and entered-event cards are live. |
| Non-Ciabatta opponents | `/matches/new`, `/matches`, `/`, `/players/[playerId]` | Implemented | Owner-private saved names, immediate unranked approval, flat +10 scoring, owner deletion with cache rebuild, a standard leaderboard history line for every player, generic shared identity, and win/loss result email are live. |
| Courts and surfaces | `/matches/new`, `/matches/untagged`, `/courts/[courtId]`, `/players/[playerId]` | Implemented | Shared court typeahead, optional surface chips, metadata-only retro tagging, court detail/tallies, surface records, tournament defaults, and organiser merging are live. |
| Zeus inbox | `/notifications` | Implemented | Permanent Zeus portrait/inbox across empty, read, and unread states; a dedicated top-right Zeus-avatar action updates live for the receiver through owner-filtered Realtime, with focus recovery, failure-aware mark-all-read, navigation-only actions, planned-match destinations, and weekly-deduped untagged nudges. |
| Match workflow recovery | `/matches`, `/matches/plan`, `/matches/[plannedMatchId]`, `/admin/approvals` | Implemented | Unfinished plans remain discoverable, score entry opens after the scheduled instant, either participant can submit with the correct perspective, queried scores receive append-only organiser corrections, and ordinary queried results can be corrected and resent. |
| Points and practice | `/points`, `/practice/new`, `/admin/approvals` | Implemented | One documented points economy, retry-stable owner practice claims, organiser review, drought explanation, and committed-with-recovery feedback are live. |

## Implementation rules

Password recovery is implemented at `/forgot-password` and `/update-password`
inside the existing auth shell; the callback route is `/auth/confirm`.

- Reuse tokens and shared components before adding page-specific styling.
- Keep the handoff's mobile-first information hierarchy, hard borders, solid
  offset shadows, and typography roles intact.
- Trophy awards are read-only projections of ranked first-place placement
  facts. The case orders named awards first and generic ranked cups second,
  newest-first within each group; its detail sheet shows the winner's complete
  approved campaign, including losses, and never treats a skipped fixture as a
  walkover result.
- Trophy controls use a bright chartreuse/brass hover, focus, and pressed state.
  Ordinary activation locks duplicates, plays the complete base-pivot shake in
  the visible cabinet, and only then opens the sheet and updates the URL.
  Reduced-motion users and direct deep links open immediately. The persistent
  44px sound toggle independently controls the optional synthesized hover chime
  and activation clank; audio failure never blocks navigation.
- Trophy sheets are bounded by the visual viewport, own their scrolling, keep
  the close/header region sticky, and collapse metadata, scores, and the future
  AR call-to-action before browser zoom can introduce horizontal overflow.
  Cover frames retain the stored wide, square, or three-two ratio and exact crop
  transform while also respecting the available viewport height.
- A registered, versioned asset may represent either a reusable physical
  lineage selected by `trophy_key` or an event-specific award family. Reusable
  cups join completed first-place facts into an oldest-first ledger;
  event-specific ranked cups show only the selected event's engraving. Only
  owned awards with registered assets may open the viewer.
- A registered tournament trophy exposes a director-only pre-event preview from
  its admin console. The preview reuses the production model and Android AR
  stage but never creates a winner, placement, award, or engraving; the owned
  player route remains dependent on official completed first-place facts.
- The 3D viewer lazy-loads `<model-viewer>`, preserves a poster/error fallback,
  disables auto-rotation for reduced motion, and exposes platform-owned Android
  AR after model load. It rechecks asynchronous capability selection and keeps
  a direct Chrome Scene Viewer intent available on Android while that check
  settles, using floor placement and `ar_preferred` fallback semantics. It
  never requests a camera stream directly. Follow
  [the asset and Android AR runbook](TROPHY_ASSETS.md).
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

The Playwright performance contracts verify pending-control geometry,
route-shaped loading, reduced motion, mobile overflow, and query-shape source
contracts against the production build. They do not currently measure latency,
Core Web Vitals, throughput, or bundle size; quantitative budgets require a
repeatable measurement and an ADR.
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
