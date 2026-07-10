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
history. Apply `20260710060000_unranked_players_zero_points.sql` before
`20260710070000_tournament_day_release.sql`. Do not deploy tournament routes or
run the cache rebuild until the final migration is applied.

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
Recovery redirect: https://ciabatta-cup.app/auth/confirm?next=%2Fupdate-password
Local redirect: http://localhost:3000/auth/confirm?next=%2F
Local recovery redirect: http://localhost:3000/auth/confirm?next=%2Fupdate-password
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

In **Authentication -> Email Templates -> Reset password**, use the server-side
callback link:

```html
<a href="https://ciabatta-cup.app/auth/confirm?next=%2Fupdate-password&token_hash={{ .TokenHash }}&type=recovery">
  Set a new Ciabatta Cup password
</a>
```

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

## 5. Prepare the Ciabatta Qualifier

1. Open `/admin/tournaments/new` and keep the defaults: **Ciabatta Qualifier**,
   11 July 2026 at 10:30 AM, Northcote Tennis Club, and two courts.
2. Set seed order to Ben, String, Michaels, then Ringo. Create the tournament and
   select **Generate fixtures**.
3. Verify Round 1 is Ben/String and Michaels/Ringo; Round 2 is Ben/Michaels and
   Ringo/String; Round 3 is Ben/Ringo and String/Michaels.
4. Open the player view and verify the event time, venue, empty standings, and
   six pending fixtures. Do not enter a production score as a rehearsal because
   approved match facts are immutable.
5. On the day, enter each score from the director console. Select **Advance
   tournament** after all six group matches, after any generated decider, and
   after both placement matches to mark the event complete.

If a result succeeds but the Elo rebuild fails, keep the approved match intact,
repair the service-key or migration configuration, and use **Rebuild ratings**
on `/admin/approvals`.

If cache rebuilding fails, keep the match facts intact, fix the server secret or
migration state, then run the admin rebuild again.

## Password recovery verification

Request a reset from `/forgot-password` and confirm the email redirects through
`/auth/confirm?next=%2Fupdate-password`, then shows the two-field password form.
Set and confirm the new password at `/update-password`, then sign in again.
