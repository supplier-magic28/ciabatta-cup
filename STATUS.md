# Ciabatta Cup Status

**Last updated:** 2026-07-18

This is the short operational handover. Durable intent belongs in
`ARCHITECTURE.md`, the data model in `docs/SCHEMA.md`, and decisions in ADRs.

## Current capability

- Ordinary cups can carry their own collectible trophy identity. The Claymore
  invite flow sends frame-faithful email plus a Zeus inbox notification,
  records player RSVPs without consuming roster seats, leaves final field
  authority with the organiser, and awards the winner a permanent leaderboard
  badge derived from the official placement fact.

- Organisers can create a cup before its field or cover is ready, configure two
  to eight ordered seats, lock/unlock the schedule, select independent group and
  downstream formats plus one of three championship paths, and permanently lock
  an atomic N-player round robin after the cover/full-field checklist. Result
  entry supports first-to-three, standard set, pro-set, and true best-of-three
  scores; completion persists every participant's place with unchanged awards.
  Cover originals are normalized in the browser before submission so large
  phone photos remain editable without exceeding production action limits.

- Players have a responsive `/calendar` with month grid and chronological list,
  image-rich day/event drill-down, explicit outcomes, a range-independent latest
  five history, validated 1-30 day ranges, cup aggregation, approved
  matches/practice, public dated cup drafts for open-field discovery, owner-private
  Non-Ciabatta names, and proposed/locked plans.
  Calendar-only controls update immediately over the loaded event set while
  keeping shareable query state and browser back/forward behaviour.
  Its scorecard slices the same source-aware activity ledger used by the ladder,
  profiles, points history, and versioned cache rebuild; no calendar scoring
  constants or stored total were introduced.

- Organisers have an in-app `/admin/health` control panel for scoring drift,
  lifecycle integrity, required database infrastructure, and durable email
  delivery diagnostics. Failed or fifteen-minute-stale reconstructable emails
  can be retried for exactly one recipient with the original provider
  idempotency key; legacy kinds remain visible for manual recovery.
- Core member, organiser, external, planned, confirmation, practice-review,
  and notification mutations now have authenticated RPC boundaries. Creation
  retries carry stable operation keys, all score paths share database validation,
  and lifecycle graphs are database guarded after enforcement.
- Points-affecting facts increment a cache version; stale rebuild snapshots are
  rejected and retried once. A committed lifecycle remains successful when
  cache/email work fails and returns an actionable recovery warning. Lifecycle
  email attempts have a durable pending/sent/failed ledger.
- Local Supabase configuration and 42 focused pgTAP workflow/security assertions
  are committed alongside CI database testing and a read-only production health audit.

- Android/Chrome can fetch the public web-app manifest and all home-screen icon
  variants without an authenticated manifest request; application pages remain protected.
- Organisers can log and immediately approve a result between any two active
  members from the Matches workflow. The immutable fact records the organiser,
  skips participant confirmation and approval work, and notifies both players.
- Ladder and public player profiles now share one service-backed activity-points
  projection and Melbourne as-of date, including a complete award/decay timeline.
  Expanded history and profiles share ranked, set, tournament, exhibition, and
  aggregate Non-Ciabatta records.
- The Ciabatta now follows that same public activity-points ladder: the incumbent
  keeps it on ties and a new reign starts only when another player moves strictly
  ahead. Tournament points use the event date and held duration uses Melbourne
  calendar days.
- Match logging is no longer a global navigation tab; Matches owns every visible
  entry point, and leaderboard profile navigation acknowledges clicks immediately.

- Locations resolve to shared, case-insensitive courts across ordinary,
  planned, external, and tournament results. Match surfaces are optional,
  tournament defaults stamp result facts, and approved facts can be retagged
  without changing scores, approval, points, or Elo.
- Players can clear missing court/surface metadata at `/matches/untagged`, view
  derived surface records and court detail/tallies, while organisers can merge
  duplicate courts from the roster admin route.
- Zeus has a permanent, portrait-led `/notifications` inbox with explicit
  empty/read/unread states and a failure-aware mark-all-read control. A dedicated
  top-right Zeus-avatar action stays visible with a live unread badge, lifecycle
  notifications fan out transactionally and refresh the receiver through
  owner-filtered Realtime, lifecycle cards navigate to their match, and weekly-deduped
  missing-tag nudges navigate to the tagging queue; Profile stays profile-only.

- Players can create and respond to planned upcoming-match shells; proposed and
  locked-in plans appear on the public ladder calendar. Full-fidelity Zeus
  locked-in and result-confirmed emails use Melbourne dates, direct match/ladder
  actions, accurate ranked/exhibition/external point cards, and the established
  non-blocking, idempotent lifecycle delivery stages.
- Unfinished planned matches now stay in the private match hub. Score entry is
  time-gated, works from either participant perspective, and materialises
  atomically; queried scores receive append-only organiser corrections and
  ordinary queried results can be corrected and resent.
- Zeus cards show Melbourne timestamps and immediate Opening feedback. Database
  fan-out now covers ordinary confirmation, ranked organiser review, correction,
  approval, query, rejection, and final planned-result states.

- Public ladder totals now use activity points while ordinary Elo remains derived for history/seeding: ranked +30/+15, exhibition/external +10, approved practice +5, and tournament placements unchanged.
- Permanent Melbourne-day decay applies from first tennis activity (−1 daily plus stacked −10/7-day and −30/30-day drought penalties), with manual play marks protecting the day and resetting drought risk without awarding points.
- Players can review the points economy, log organiser-reviewed solo practice, receive lifecycle emails, and see current drought risk on their profile; organisers review match and practice claims in one filtered queue.

- Authenticated players can sign up, sign in, and view the active-player Elo
  leaderboard.
- Admins can invite players, review both-confirmed ranked results, and manage
  the current roster.
- Admins can permanently delete accidental or test players with no match
  history; self-deletion and deletion of historical participants are blocked.
- Invitees accept a server-verified email token, choose a durable password, and
  become active before entering the league.
- Players can submit a singles match with validated set scores; the opponent
  confirms it. Ranked matches then await admin approval, while exhibitions are
  approved automatically.
- Every player-logged result requires its played date and may include an
  optional court or venue location; both are retained on the match fact.
- Active players can log owner-private non-Ciabatta opponents. Those matches
  approve immediately, award a rebuildable flat +10 points win or lose, remain
  outside Elo/form/ranked records, and send a non-blocking result email.
- Players can delete their own Non-Ciabatta test or mistaken results; deletion
  removes the derived +10/history and rebuilds the complete rating cache.
- Approved ranked facts are fed into the pure Elo engine. The derived
  `rating_history`, `players.rating_points`, and `ciabatta_reigns` caches are
  rebuilt from the full chronological match history after approval.
- New and exhibition-only players display zero points and no numeric rank. Elo
  is published only after their first approved ranked result.
- Player profiles provide rank, current holder state, separate ranked and
  exhibition records, points history, head-to-head summaries, and match logs.
- Players can update their own avatar, nickname, and nickname display preference
  from `/profile`; circular avatar crops and effective nicknames flow through
  the leaderboard, matches, tournaments, and public profiles.
- The private profile now has routed Settings, Streak, and History tabs. Streaks
  combine all non-rejected match days with owner-only manual Melbourne-day
  marks; History provides gated H2H detail, a complete result ledger, and
  entered-tournament cards.
- Admins can run deterministic 2–8 player round robins, settle qualification
  boundaries on court, and finish from standings, a top-two final, or top-four
  semifinals/final while every recorded result remains immutable.
- Authenticated players can follow tournament details, live standings, fixtures,
  results, progress, cover photos, and the derived champion from `/tournaments`.
- Admins can add, crop, resize, replace, or remove a tournament cover photo from
  the event hero; the same image appears on the tournament calendar card.
- Admins can permanently lock a reviewed draw, automatically send retry-safe
  locked-in emails, and explicitly send game-day email without duplicating
  successful deliveries.
- The ladder starts at zero: ordinary ranked matches use zero-floor Elo and
  completed tournaments award 100/50/20/10 without applying per-match Elo.
  Compact rows show trophies, holder status, and points; expandable history
  separates ordinary matches, full sets, and ranked tournament matches.
- Admins can send each tournament player an idempotent placement email with
  their complete personal match recap.
- Every current navigation surface has a route-shaped loading boundary and a
  shared retryable error state. Mutations acknowledge clicks immediately with
  stable, accessible pending controls while confirmed data waits for the server.
- Nested match, player, cup, and admin routes expose consistent deterministic
  parent links so users can return to Ladder, Matches, or Cups without relying
  on browser history.
- Match history, approvals, profiles, and tournament boards embed score sets in
  one Supabase read wave; browser performance budgets protect loading geometry,
  mobile overflow, reduced motion, and duplicate-submission prevention.

## Database state

Players can request a recovery email from `/forgot-password` and set a
replacement password at `/update-password`; invited profiles activate only
after that password update succeeds.

| Migration | State |
| --- | --- |
| `20260709000000` through `20260710120000` | Applied to production (operator reported) |
| `20260710130000_tournament_placement_awards.sql` | Applied to production (operator verified four qualifier placements) |
| `20260710140000_safe_rating_cache_rebuild.sql` | Applied to production (operator reported) |
| `20260712090000_external_match_type.sql` through `20260712110000_delete_own_external_matches.sql` | Applied to production (operator verified logging, email, history, and deletion) |
| `20260712120000` through `20260717120000` | Applied to production (operator exercised points, plans, inbox, correction, and admin logging surfaces) |
| `20260718120000_core_backend_hardening.sql` | Applied to production (operator reported) |
| `20260718121000_core_backend_enforcement.sql` | Applied; guard triggers independently verified present |
| `20260718122000_admin_health_recovery.sql` | Ready after enforcement and before the admin health route deploy |
| `20260718122500` through `20260718124000` configurable cup rollout | Applied to production (operator reported); local reset, pgTAP, and database lint verified |
| `20260718125000` / `20260718126000` trophy + RSVP rollout | Applied to production (operator reported); local reset, 76 pgTAP assertions, database lint, application checks, and production build verified |

## Current blockers

- The production invite, email delivery, acceptance, activation, and new-player
  display have been exercised successfully.
- The credentialed ranked submission, opponent confirmation, admin approval,
  notification/email, leaderboard, and profile production loop remains
  unverified. The initial version-guarded organiser rebuild completed with
  `fact_version = built_version`, zero drift, and a populated rebuild time.
- Migration `20260710140000` resolved production's safe-update rejection for
  intentional rating-cache replacement.

## Next product slice

Deploy and smoke-test the personal calendar at mobile and desktop widths, then
exercise the next genuine ranked
submission, opponent confirmation, organiser approval, notification/email,
automatic versioned rebuild, and exact leaderboard/profile agreement. Also
verify court creation/merge, retro tagging, tournament defaults, Melbourne
decay, and qualifier placement totals in production.
Append-only corrections, generalised setup, and mid-event withdrawals remain
deferred.

## Documentation rule

Before closing a task, update this handover and every affected canonical doc.
Run `npm run docs:check` with the normal validation suite. See the documentation
impact matrix in `CLAUDE.md` and `ARCHITECTURE.md`.
