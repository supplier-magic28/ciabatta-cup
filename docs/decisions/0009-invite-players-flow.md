# ADR-0009: Invite-players flow — invited profiles, secret-key admin client

- **Status:** Accepted (implements ADR-0002's invite path)
- **Date:** 2026-07-10

## Context

ADR-0002 said invited players are created via Supabase Auth's `inviteUserByEmail`
and their `players` row starts at `status = 'invited'`. Building the admin invite
flow surfaced a conflict with the Phase 2 auth trigger: `handle_new_user`
(migration `20260709010000`) inserts **every** new auth user's profile as
`active`. Since an invite creates an `auth.users` row, that trigger would mark an
invitee `active` before they ever accept — breaking the `invited → active`
lifecycle. Two more choices needed pinning: how the invite call is authorized
(it needs privileges the browser key doesn't have), and how admin-only is
enforced.

## Decision

**1. Invited auth users map to `invited` profiles, in the trigger.**
`handle_new_user` is redefined (migration `20260710010000`, superseding the
profile-status logic of `20260709010000`) to key off `auth.users.invited_at`,
which Supabase sets on invite:

- `invited_at IS NOT NULL` → `status = 'invited'`, set `invited_at`, no `joined_at`.
- otherwise (self-signup) → `status = 'active'`, `joined_at = now()` — unchanged.

The `invited → active` flip is **not** re-implemented: the existing
`ensureActivated` (session.ts) already performs it on the invitee's first
authenticated entry, and the existing `/auth/confirm` route already handles the
`type=invite` OTP. We reuse both.

**2. The invite uses a secret-key, server-only admin client.**
`inviteUserByEmail` is an auth-admin call the browser-safe publishable key cannot
make, so `lib/supabase/admin.ts` builds a service-role client from
`SUPABASE_SECRET_KEY`. It is marked `server-only` (build-time guard against
importing it into client code) and the key lives only in the server environment
(CLAUDE.md) — never in the repo.

**3. Admin-only is enforced by `is_admin()` RLS plus an action/route guard.**
The `inviteUser` server action re-checks the session player's admin role (Server
Actions are POST-reachable), and the manage-players page redirects non-admins.
The durable backstop is the Phase 2 `players` RLS: `players_admin_all`
(`is_admin()`) governs all profile management, and non-admins are frozen out of
privileged columns — so no new RLS policy is needed. The admin client (which
bypasses RLS) is only ever reached *after* the admin check.

## Consequences

- **Invited players show as `Invited` and only become `Active` once they accept**
  — the lifecycle ADR-0002 intended, now enforced at the schema level rather than
  depending on the app to correct the status.
- **Acceptance is reuse-only.** No new set-password page this phase; the exact
  invite-link redirect and any password step are Supabase project configuration
  (redirect allow-list + email template), documented in `supabase/README.md`.
  A dedicated accept-invite screen can come later if wanted.
- **New operational requirement:** `SUPABASE_SECRET_KEY` must be set in the server
  environment for invites to send; absent it, `inviteUser` fails loudly.
- **Deferred:** edit / deactivate / resend / revoke (shown in design screen 08)
  are a later admin phase; this ships the roster + invite only.
- **Prerequisite:** migration `20260710010000` must be applied to Supabase for the
  invited-status behaviour to take effect (still file-only — see STATUS.md).
