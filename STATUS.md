# Ciabatta Cup Status

**Last updated:** 2026-07-10

This is the short operational handover. Durable intent belongs in
`ARCHITECTURE.md`, the data model in `docs/SCHEMA.md`, and decisions in ADRs.

## Current capability

- Authenticated players can sign up, sign in, and view the active-player Elo
  leaderboard.
- Admins can invite players, review both-confirmed ranked results, and manage
  the current roster.
- Invitees accept a server-verified email token, choose a durable password, and
  become active before entering the league.
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
| `20260709000000` through `20260710040000` | Applied to production (operator reported) |
| `20260710050000_fix_invited_profile_status_cast.sql` | Committed; operator must apply |

## Current blockers

- Vercel, the apex-domain redirect, Resend SMTP, Supabase Auth URLs/template,
  and server environment are operator-configured. Production invites currently
  fail until `20260710050000` fixes the Auth profile trigger's enum cast.
- The credentialed ranked submission, opponent confirmation, admin approval,
  cache rebuild, leaderboard, and profile production loop remains unverified.

## Next product slice

Run the credentialed invite and ranked-match production smoke test. Then start
the tournament spine: entities, participants, fixtures, and admin tournament
management.

## Documentation rule

Before closing a task, update this handover and every affected canonical doc.
Run `npm run docs:check` with the normal validation suite. See the documentation
impact matrix in `CLAUDE.md` and `ARCHITECTURE.md`.
