# Production Release Runbook

Use this runbook when the league loop is ready to go live. It covers account
configuration that cannot be committed to the repository.

## 1. Apply Supabase migrations

Link the Supabase CLI to the intended project, then apply every committed
migration in order:

```bash
supabase link
supabase db push
```

Confirm that `20260710020000_advance_on_confirmation.sql`,
`20260710030000_rating_cache.sql`, and
`20260710040000_ciabatta_reigns.sql` are present in the project migration
history. Do not run the cache rebuild until the final migration is applied.

## 2. Connect Vercel

Import `supplier-magic28/ciabatta-cup` into a new Vercel project. Configure the
following environment variables for Production and Preview:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

Deploy the `main` branch. Keep the secret key server-only; do not add it to a
browser variable or repository file.

## 3. Configure Supabase Auth

In Supabase Auth URL Configuration, set the production Vercel URL as the Site
URL and allow:

```text
https://<production-domain>/auth/confirm?next=/
```

Verify the Invite User email template preserves the invite OTP parameters used
by `/auth/confirm`.

## 4. Backfill and smoke-test

1. Sign in as an admin and use **Rebuild ratings** on `/admin/approvals`.
2. Invite a new player and complete the invite link on the production domain.
3. Submit a ranked match, confirm as the opponent, and approve as the admin.
4. Verify the leaderboard, holder banner, reign count, and both player profiles
   update from the approved result.
5. Run `npm run test:e2e` locally; CI runs the same anonymous-route browser
   smoke test for every push and pull request.

If cache rebuilding fails, keep the match facts intact, fix the server secret or
migration state, then run the admin rebuild again.
