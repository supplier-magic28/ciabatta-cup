-- Phase 3a spine: match facts (matches + match_sets + match_confirmations) + RLS.
-- Authoritative model: docs/SCHEMA.md. Decisions: ADR-0001 (immutable match
-- facts; scoring is computed, never stored), ADR-0003 (phased schema), ADR-0006
-- (this migration: trigger-enforced immutability; nullable tournament/fixture
-- columns until those tables land; lifecycle transitions deferred).
--
-- Scope: schema + RLS only. NO Elo/scoring, NO UI, and NO lifecycle-transition
-- automation (auto-confirming the submitter, both-confirmed -> pending_approval,
-- exhibition auto-approve). The schema *supports* the lifecycle; driving it
-- belongs with the confirm/approve surfaces in a later phase.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.match_type   as enum ('ranked', 'exhibition');
create type public.match_format as enum ('one_set', 'best_of_3', 'pro_set_8', 'custom');
create type public.match_status as enum (
  'pending_confirmation',  -- opponent hasn't confirmed yet
  'pending_approval',      -- both confirmed; ranked awaits an admin
  'approved',              -- finalised, immutable fact; stats count
  'queried',               -- admin flagged it back to the submitter
  'rejected'               -- admin rejected it
);

-- ---------------------------------------------------------------------------
-- matches
-- The immutable match fact (ADR-0001). Singles only for now (player1/player2);
-- a match_players join table is the seam if doubles ever matters.
--
-- tournament_id / fixture_id are plain nullable uuid columns, NOT foreign keys:
-- the `tournaments` and `fixtures` tables don't exist yet (casual matches
-- first). The FK constraints are added in the tournaments phase (ADR-0006).
-- ---------------------------------------------------------------------------
create table public.matches (
  id               uuid primary key default gen_random_uuid(),
  type             public.match_type   not null,
  format           public.match_format not null,
  format_note      text,
  player1_id       uuid not null references public.players (id) on delete restrict,
  player2_id       uuid not null references public.players (id) on delete restrict,
  winner_id        uuid          references public.players (id) on delete restrict,
  status           public.match_status not null default 'pending_confirmation',
  submitted_by     uuid not null references public.players (id) on delete restrict,
  played_at        timestamptz not null,
  duration_minutes int,
  tournament_id    uuid,   -- FK added with the tournaments phase (ADR-0006)
  fixture_id       uuid,   -- FK added with the fixtures phase (ADR-0006)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint matches_distinct_players
    check (player1_id <> player2_id),
  constraint matches_winner_is_participant
    check (winner_id is null or winner_id in (player1_id, player2_id)),
  constraint matches_submitter_is_participant
    check (submitted_by in (player1_id, player2_id)),
  constraint matches_duration_positive
    check (duration_minutes is null or duration_minutes > 0),
  constraint matches_format_note_only_for_custom
    check (format_note is null or format = 'custom'),
  constraint matches_approved_has_winner
    check (status <> 'approved' or winner_id is not null)
);

comment on table public.matches is
  'Immutable match facts (ADR-0001). Once status = approved a row is frozen by '
  'the enforce_match_immutable() trigger; corrections are new facts, never edits.';
comment on column public.matches.tournament_id is
  'Null = casual match. Plain uuid until the tournaments table exists; the FK '
  'constraint is added in the tournaments phase (ADR-0006).';
comment on column public.matches.fixture_id is
  'Links a tournament result to its fixture slot. Plain uuid until the fixtures '
  'table exists; the FK constraint is added in the fixtures phase (ADR-0006).';

-- ---------------------------------------------------------------------------
-- match_sets
-- Per-set scores. These ARE the match fact, so they are frozen alongside their
-- parent once the match is approved (see enforce_parent_match_immutable()).
-- ---------------------------------------------------------------------------
create table public.match_sets (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches (id) on delete cascade,
  set_number   int  not null,
  p1_games     int  not null,
  p2_games     int  not null,
  tiebreak_p1  int,
  tiebreak_p2  int,

  constraint match_sets_set_number_positive check (set_number > 0),
  constraint match_sets_games_non_negative  check (p1_games >= 0 and p2_games >= 0),
  constraint match_sets_tiebreak_paired     check ((tiebreak_p1 is null) = (tiebreak_p2 is null)),
  constraint match_sets_unique_number       unique (match_id, set_number)
);

-- ---------------------------------------------------------------------------
-- match_confirmations
-- One row per participant. SCHEMA rule: both rows present => the match moves to
-- pending_approval. That transition is NOT automated here (deferred to the
-- confirm/approve phase) — this table only records who has confirmed.
-- ---------------------------------------------------------------------------
create table public.match_confirmations (
  match_id     uuid not null references public.matches (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_matches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_matches_updated_at
  before update on public.matches
  for each row
  execute function public.touch_matches_updated_at();

-- ---------------------------------------------------------------------------
-- Immutable-facts guard (ADR-0001)
-- Once a match is `approved` it is a frozen fact: no UPDATE, no DELETE, ever.
-- The row moves freely through its pre-approval lifecycle (the UPDATE that sets
-- status -> approved is allowed because OLD.status is still pending_approval);
-- from `approved` onward it is sealed.
--
-- This mirrors how the `players` table is protected (a trigger, so it also
-- catches paths that bypass RLS), with one DELIBERATE difference: there is NO
-- backend/`auth.uid() is null` exemption (contrast the players guard, ADR-0005).
-- ADR-0001 says facts are never mutated by anyone — service role included. If a
-- genuine repair is ever unavoidable, a migration disables this trigger
-- explicitly; silent edits are never allowed.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_match_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception
        'matches: approved matches are immutable facts (ADR-0001) and cannot be deleted; record a correction as a new match';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'approved' then
    raise exception
      'matches: approved matches are immutable facts (ADR-0001) and cannot be edited; record a correction as a new match';
  end if;
  return new;
end;
$$;

create trigger enforce_match_immutable
  before update or delete on public.matches
  for each row
  execute function public.enforce_match_immutable();

-- Helper: is the given match approved (i.e. frozen)? SECURITY DEFINER so the
-- child-table guards can read matches.status regardless of the caller's RLS.
create or replace function public.match_is_approved(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.matches
    where id = p_match_id and status = 'approved'
  );
$$;

-- Child-row guard: sets and confirmations belong to the match fact, so writing
-- them once the parent is approved would silently mutate a frozen fact. Block
-- INSERT/UPDATE/DELETE whenever the parent match is approved.
create or replace function public.enforce_parent_match_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and public.match_is_approved(new.match_id) then
    raise exception
      '%: cannot modify rows of an approved (immutable) match (ADR-0001)', tg_table_name;
  end if;
  if tg_op in ('DELETE', 'UPDATE') and public.match_is_approved(old.match_id) then
    raise exception
      '%: cannot modify rows of an approved (immutable) match (ADR-0001)', tg_table_name;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger enforce_match_sets_immutable
  before insert or update or delete on public.match_sets
  for each row
  execute function public.enforce_parent_match_immutable();

create trigger enforce_match_confirmations_immutable
  before insert or update or delete on public.match_confirmations
  for each row
  execute function public.enforce_parent_match_immutable();

-- ---------------------------------------------------------------------------
-- Row Level Security — matches
--   SELECT : any authenticated player may read APPROVED matches; participants
--            may read their own (any status); admins may read all.
--   INSERT : a participant submits their own match (as submitter, forced to
--            start at pending_confirmation); admins may insert anything.
--   UPDATE : the submitter may edit their own NON-approved match (e.g. after an
--            admin queries it back); admins may update any row — the
--            enforce_match_immutable() trigger still seals approved rows.
--   DELETE : the submitter may delete their own non-approved match; admins may
--            delete any non-approved row (approved deletes blocked by trigger).
-- Postgres OR-combines permissive policies for the same command.
-- ---------------------------------------------------------------------------
alter table public.matches enable row level security;

create policy "matches_select_approved"
  on public.matches for select to authenticated
  using (status = 'approved');

create policy "matches_select_participant"
  on public.matches for select to authenticated
  using (auth.uid() in (player1_id, player2_id));

create policy "matches_select_admin"
  on public.matches for select to authenticated
  using (public.is_admin());

create policy "matches_insert_participant"
  on public.matches for insert to authenticated
  with check (
    auth.uid() = submitted_by
    and auth.uid() in (player1_id, player2_id)
    and status = 'pending_confirmation'
  );

create policy "matches_insert_admin"
  on public.matches for insert to authenticated
  with check (public.is_admin());

create policy "matches_update_submitter"
  on public.matches for update to authenticated
  using (auth.uid() = submitted_by and status <> 'approved')
  with check (auth.uid() = submitted_by and status <> 'approved');

create policy "matches_update_admin"
  on public.matches for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "matches_delete_submitter"
  on public.matches for delete to authenticated
  using (auth.uid() = submitted_by and status <> 'approved');

create policy "matches_delete_admin"
  on public.matches for delete to authenticated
  using (public.is_admin() and status <> 'approved');

-- ---------------------------------------------------------------------------
-- Row Level Security — match_sets
--   Visible when the parent match is visible; writable when you are the
--   submitter of a non-approved parent, or an admin. The immutability trigger
--   is the backstop that seals an approved match's sets.
-- ---------------------------------------------------------------------------
alter table public.match_sets enable row level security;

create policy "match_sets_select_visible"
  on public.match_sets for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_sets.match_id
        and (
          m.status = 'approved'
          or auth.uid() in (m.player1_id, m.player2_id)
          or public.is_admin()
        )
    )
  );

create policy "match_sets_modify"
  on public.match_sets for all to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_sets.match_id
        and (
          (m.submitted_by = auth.uid() and m.status <> 'approved')
          or public.is_admin()
        )
    )
  )
  with check (
    exists (
      select 1 from public.matches m
      where m.id = match_sets.match_id
        and (
          (m.submitted_by = auth.uid() and m.status <> 'approved')
          or public.is_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Row Level Security — match_confirmations
--   Visible when the parent match is visible. A participant may INSERT only
--   their own confirmation (player_id = auth.uid()) on a match they play that
--   is still pending_confirmation. Admins may manage confirmations. There is no
--   UPDATE path — a confirmation is a fact; the immutability trigger seals
--   confirmations of approved matches.
-- ---------------------------------------------------------------------------
alter table public.match_confirmations enable row level security;

create policy "match_confirmations_select_visible"
  on public.match_confirmations for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_confirmations.match_id
        and (
          m.status = 'approved'
          or auth.uid() in (m.player1_id, m.player2_id)
          or public.is_admin()
        )
    )
  );

create policy "match_confirmations_insert_own"
  on public.match_confirmations for insert to authenticated
  with check (
    player_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_confirmations.match_id
        and auth.uid() in (m.player1_id, m.player2_id)
        and m.status = 'pending_confirmation'
    )
  );

create policy "match_confirmations_admin"
  on public.match_confirmations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
