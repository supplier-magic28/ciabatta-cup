-- Activity-points economy and organiser-reviewed solo practice (ADR-0029).
create type public.practice_activity as enum ('serves', 'wall_hits', 'other');
create type public.practice_status as enum ('pending', 'approved', 'rejected');

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  activity public.practice_activity not null,
  minutes int not null check (minutes between 1 and 300),
  practiced_on date not null check (practiced_on <= (now() at time zone 'Australia/Melbourne')::date),
  note text check (note is null or char_length(note) <= 500),
  status public.practice_status not null default 'pending',
  reviewed_by uuid references public.players (id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null) or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);

alter table public.practice_sessions enable row level security;
create policy "practice_owner_select" on public.practice_sessions for select to authenticated using (player_id = auth.uid());
create policy "practice_owner_insert" on public.practice_sessions for insert to authenticated with check (player_id = auth.uid() and status = 'pending' and reviewed_by is null and reviewed_at is null);
create policy "practice_admin_select" on public.practice_sessions for select to authenticated using (public.is_admin());
create policy "practice_admin_update" on public.practice_sessions for update to authenticated using (public.is_admin() and status = 'pending') with check (public.is_admin() and status in ('approved', 'rejected'));

create or replace function public.guard_reviewed_practice_immutable()
returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' then raise exception 'Reviewed practice sessions are immutable'; end if;
  if new.player_id is distinct from old.player_id or new.activity is distinct from old.activity or new.minutes is distinct from old.minutes or new.practiced_on is distinct from old.practiced_on or new.note is distinct from old.note or new.created_at is distinct from old.created_at then
    raise exception 'Practice facts cannot be edited during review';
  end if;
  return new;
end;
$$;
create trigger practice_sessions_review_guard before update on public.practice_sessions for each row execute function public.guard_reviewed_practice_immutable();

comment on table public.practice_sessions is 'Owner-submitted solo-practice facts; +5 and drought protection apply only after organiser approval.';
