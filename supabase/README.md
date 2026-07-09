# Supabase

Database migrations for Ciabatta Cup. The authoritative data model is
`docs/SCHEMA.md`; migrations are built in phases (ADR-0003).

## Migrations

`migrations/` holds ordered SQL files applied in filename order.

- `20260709000000_players_spine.sql` — **Phase 2 spine**: the `players` table,
  the `is_admin()` helper, RLS policies, and a privilege-escalation guard.

Only the `players` table exists so far. Matches, tournaments, fixtures, rating
history, etc. arrive in later phases.

## Applying a migration

Either:

- **Supabase CLI:** `supabase db push` (requires `supabase link` to the project).
- **Dashboard:** paste the SQL into the SQL Editor and run it.

## First-admin bootstrap (ADR-0002)

RLS lets only admins insert/manage `players`, but no admin exists initially.
Seed the first admin out-of-band, bypassing RLS via the service role / SQL editor:

1. Create the auth user (Dashboard → Authentication → Add user, or an invite).
2. Insert their `players` row with `role = 'admin'`, using that user's `id`:

   ```sql
   insert into public.players (id, email, first_name, last_name, role, status, joined_at)
   values ('<auth-user-uuid>', '<email>', '<first>', '<last>', 'admin', 'active', now());
   ```

Thereafter that admin can invite and manage everyone else.
