# ADR-0013: Invited players choose a password before activation

- **Status:** Accepted (supersedes ADR-0009's deferred password-step consequence)
- **Date:** 2026-07-10
- **Supersedes:** ADR-0009 (deferred password-step consequence only)

## Context

ADR-0009 reused the existing OTP confirmation route and deferred a dedicated
password step. Production setup exposed the missing lifecycle edge: a Supabase
admin invite creates an Auth user without a password. Verifying the invite OTP
establishes a session, but after that session expires the player cannot use the
app's password-only sign-in screen.

The invite must produce durable credentials without trusting the rendered page
as an authorization boundary or activating the profile before credential setup
succeeds.

## Decision

An accepted `type=invite` token redirects from `/auth/confirm` to the protected
`/accept-invite` route. The player chooses and confirms a password there.

The completion Server Action revalidates the authenticated Supabase user and
requires that user's `players` profile to still have `status = 'invited'`. It
updates the Auth password first, then performs the existing permitted self
transition from `invited` to `active` and records `joined_at`. Only then does it
redirect to the leaderboard.

Other email token types retain their requested internal destination. External
and protocol-relative destinations are rejected to avoid an open redirect.

## Consequences

- Invitees can sign out and return through the normal password sign-in flow.
- A consumed, expired, or already-completed invite cannot be used to reset an
  active player's password through this route.
- Password and profile activation span Supabase Auth and Postgres rather than a
  single transaction. If activation fails after the password update, the form
  reports that partial state and permits a retry while the profile is invited.
- The production smoke test now includes choosing a password and signing back
  in after acceptance.
