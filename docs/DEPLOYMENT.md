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

## 2. Configure Vercel

The Vercel project is connected to `supplier-magic28/ciabatta-cup`. Add
`ciabatta-cup.app` to the project under **Settings -> Domains** and make it the
canonical production domain. Configure these environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
NEXT_PUBLIC_SITE_URL=https://ciabatta-cup.app
```

The three Supabase values belong in Production and Preview. Set
`NEXT_PUBLIC_SITE_URL` to the canonical value in Production; previews may omit
it so request-origin fallback remains available. Redeploy `main` after an
environment-variable change. Keep the secret key server-only; do not add it to
a browser variable or repository file.

## 3. Configure Supabase Auth

In **Authentication -> URL Configuration**, set:

```text
Site URL: https://ciabatta-cup.app
Redirect URL: https://ciabatta-cup.app/auth/confirm?next=%2F
Local redirect: http://localhost:3000/auth/confirm?next=%2F
```

Configure custom SMTP with the verified `ciabatta-cup.app` sender domain. In
**Authentication -> Email Templates -> Invite user**, ensure the acceptance
link passes the OTP directly to the server-side confirmation route:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">
  Accept your Ciabatta Cup invitation
</a>
```

Disable click tracking for authentication email links so the provider does not
rewrite them. Send a real invite only after the SMTP sender, template, Site URL,
and redirect allow-list are saved.

## 4. Backfill and smoke-test

1. Open `https://ciabatta-cup.app`, sign in as an admin, and use **Rebuild
   ratings** on `/admin/approvals`.
2. Invite a new player and confirm the email link begins with
   `https://ciabatta-cup.app/auth/confirm` before completing it. Confirm it lands
   on `/accept-invite`, choose a password, sign out, and sign back in with it.
3. Confirm the accepted player's roster status changed from invited to active.
4. Submit a ranked match, confirm as the opponent, and approve as the admin.
5. Verify the leaderboard, holder banner, reign count, and both player profiles
   update from the approved result.
6. Run `npm run test:e2e` locally; CI runs the same anonymous-route browser
   smoke test for every push and pull request.

If cache rebuilding fails, keep the match facts intact, fix the server secret or
migration state, then run the admin rebuild again.
