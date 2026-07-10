# Ciabatta Cup Status

**Last updated:** 2026-07-10

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

## Database state

| Migration | State |
| --- | --- |
| `20260709000000` through `20260710050000` | Applied to production (operator reported) |
| `20260710060000_unranked_players_zero_points.sql` | Committed; operator must apply |

## Current blockers

- The production invite, email delivery, acceptance, activation, and new-player
  display have been exercised successfully.
- `20260710060000` must be applied so production cache defaults and existing
  unranked player rows match the zero-point policy.
- The credentialed ranked submission, opponent confirmation, admin approval,
  cache rebuild, leaderboard, and profile production loop remains unverified.

## Next product slice

Apply the zero-point migration and run the credentialed ranked-match production
smoke test. Then start the tournament spine: entities, participants, fixtures,
and admin tournament management.

## Documentation rule

Before closing a task, update this handover and every affected canonical doc.
Run `npm run docs:check` with the normal validation suite. See the documentation
impact matrix in `CLAUDE.md` and `ARCHITECTURE.md`.
