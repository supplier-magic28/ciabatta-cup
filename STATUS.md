# Ciabatta Cup Status

**Last updated:** 2026-07-11

This is the short operational handover. Durable intent belongs in
`ARCHITECTURE.md`, the data model in `docs/SCHEMA.md`, and decisions in ADRs.

## Current capability

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
- Admins can create a four-player round-robin tournament, seed its participants,
  replace a pre-play participant while preserving their seed, regenerate the
  deterministic court schedule, record immutable results directly, and either
  complete from standings or continue through a decider and full final stage.
- Authenticated players can follow tournament details, live standings, fixtures,
  results, progress, cover photos, and the derived champion from `/tournaments`.
- Admins can add, crop, resize, replace, or remove a tournament cover photo from
  the event hero; the same image appears on the tournament calendar card.
- Admins can permanently lock a reviewed draw, automatically send retry-safe
  locked-in emails, and explicitly send game-day email without duplicating
  successful deliveries.
- Completed tournaments award 100/50/20/10 placement points without applying
  per-match Elo. Admins can send each player an idempotent placement email with
  their complete personal match recap.
- Every current navigation surface has a route-shaped loading boundary and a
  shared retryable error state. Mutations acknowledge clicks immediately with
  stable, accessible pending controls while confirmed data waits for the server.
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
| `20260710140000_safe_rating_cache_rebuild.sql` | Ready to apply in production |

## Current blockers

- The production invite, email delivery, acceptance, activation, and new-player
  display have been exercised successfully.
- The credentialed ranked submission, opponent confirmation, admin approval,
  cache rebuild, leaderboard, and profile production loop remains unverified.
- The completed qualifier has four saved placement awards, but production's
  safe-update guard rejected the rating RPC's intentional whole-table delete.
  Migration `20260710140000` adds explicit predicates; no result-email claims
  were made by the failed attempts.

## Next product slice

Apply migration `20260710140000`, retry the completed qualifier's result-email
action, then verify the 1100/1050/1020/1010 ladder and four personal recaps.
Append-only corrections, generalised setup, and mid-event withdrawals remain
deferred.

## Documentation rule

Before closing a task, update this handover and every affected canonical doc.
Run `npm run docs:check` with the normal validation suite. See the documentation
impact matrix in `CLAUDE.md` and `ARCHITECTURE.md`.
