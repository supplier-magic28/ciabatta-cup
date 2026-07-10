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
| `20260709000000` through `20260710040000` | Applied to production (operator reported) |

## Current blockers

- The Vercel deployment and custom domains are live, but the current redirect
  runs from `ciabatta-cup.app` to `www.ciabatta-cup.app`; reverse it so the apex
  domain is the canonical production origin.
- Resend has verified `ciabatta-cup.app`; Supabase custom SMTP, the Auth Site
  URL/redirect allow-list, and the invite template still need final setup.
- `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_SITE_URL=https://ciabatta-cup.app` must
  be confirmed in Vercel before the credentialed production smoke test.

## Next product slice

Finish the custom-domain Auth/email setup and run the credentialed production
release smoke test. Then start the tournament spine: entities, participants,
fixtures, and admin tournament management.

## Documentation rule

Before closing a task, update this handover and every affected canonical doc.
Run `npm run docs:check` with the normal validation suite. See the documentation
impact matrix in `CLAUDE.md` and `ARCHITECTURE.md`.
