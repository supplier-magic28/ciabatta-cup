# Ciabatta Cup Status

**Last updated:** 2026-07-10

This is the short operational handover. Durable intent belongs in
`ARCHITECTURE.md`, the data model in `docs/SCHEMA.md`, and decisions in ADRs.

## Current capability

- Authenticated players can sign up, sign in, and view the active-player Elo
  leaderboard.
- Admins can invite players, review both-confirmed ranked results, and manage
  the current roster.
- Players can submit a singles match with validated set scores; the opponent
  confirms it. Ranked matches then await admin approval, while exhibitions are
  approved automatically.
- Approved ranked facts are fed into the pure Elo engine. The derived
  `rating_history`, `players.rating_points`, and `ciabatta_reigns` caches are
  rebuilt from the full chronological match history after approval.
- Player profiles provide rank, current holder state, separate ranked and
  exhibition records, points history, head-to-head summaries, and match logs.

## Database state

| Migration | State |
| --- | --- |
| `20260709000000` through `20260710010000` | Applied to the known Supabase project |
| `20260710020000_advance_on_confirmation.sql` | Committed; operator must apply |
| `20260710030000_rating_cache.sql` | Committed; operator must apply |
| `20260710040000_ciabatta_reigns.sql` | Committed; operator must apply |

Until the pending migrations are applied, confirmations do not advance and
ranked approval cannot materialise ratings or reigns.

## Current blockers

- `SUPABASE_SECRET_KEY` must be configured in the server environment for
  invites and rating-cache rebuilds.
- Supabase redirect URLs and the invite email template still need an
  end-to-end verification.
- No production deployment is connected yet.

## Next product slice

Apply and verify the production release runbook, then start the tournament
spine: entities, participants, fixtures, and admin tournament management.

## Documentation rule

Before closing a task, update this handover and every affected canonical doc.
Run `npm run docs:check` with the normal validation suite. See the documentation
impact matrix in `CLAUDE.md` and `ARCHITECTURE.md`.
