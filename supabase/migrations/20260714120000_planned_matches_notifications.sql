-- Planned match shells, player-to-player result review, and Zeus notifications.
create type public.planned_match_status as enum ('proposed', 'locked_in', 'awaiting_result_approval', 'awaiting_admin_approval', 'confirmed', 'declined', 'cancelled');
create type public.planned_result_status as enum ('pending', 'approved', 'superseded');
create type public.notification_kind as enum ('match_proposed', 'match_declined', 'match_cancelled', 'match_locked_in', 'result_to_approve', 'result_confirmed');

create table public.planned_matches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.players(id) on delete cascade,
  opponent_player_id uuid references public.players(id) on delete restrict,
  opponent_external_id uuid references public.external_opponents(id) on delete restrict,
  scheduled_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 160),
  status public.planned_match_status not null default 'proposed',
  accepted_at timestamptz,
  cancelled_by uuid references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((opponent_player_id is null) <> (opponent_external_id is null)),
  check (opponent_external_id is null or status <> 'proposed')
);
create trigger touch_planned_matches_updated_at before update on public.planned_matches for each row execute function public.touch_matches_updated_at();

create table public.planned_match_results (
  id uuid primary key default gen_random_uuid(),
  planned_match_id uuid not null references public.planned_matches(id) on delete cascade,
  submitted_by uuid not null references public.players(id) on delete restrict,
  match_type public.match_type not null,
  format public.match_format not null,
  format_note text,
  winner_player_id uuid not null references public.players(id) on delete restrict,
  score jsonb not null,
  played_at timestamptz not null,
  location text,
  status public.planned_result_status not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.matches add column planned_match_id uuid references public.planned_matches(id) on delete set null;
create unique index matches_planned_match_id_unique on public.matches(planned_match_id) where planned_match_id is not null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  kind public.notification_kind not null,
  planned_match_id uuid references public.planned_matches(id) on delete cascade,
  body text not null check (char_length(body) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_player_unread_idx on public.notifications(player_id, read_at, created_at desc);

alter table public.planned_matches enable row level security;
alter table public.planned_match_results enable row level security;
alter table public.notifications enable row level security;
create policy "planned_matches_visible" on public.planned_matches for select to authenticated using (true);
create policy "planned_matches_owner_insert" on public.planned_matches for insert to authenticated with check (created_by = auth.uid());
create policy "planned_matches_participant_update" on public.planned_matches for update to authenticated using (auth.uid() in (created_by, opponent_player_id) or public.is_admin()) with check (auth.uid() in (created_by, opponent_player_id) or public.is_admin());
create policy "planned_results_visible" on public.planned_match_results for select to authenticated using (exists (select 1 from public.planned_matches p where p.id = planned_match_id and (auth.uid() in (p.created_by, p.opponent_player_id) or public.is_admin())));
create policy "notifications_owner_select" on public.notifications for select to authenticated using (player_id = auth.uid());
create policy "notifications_owner_update" on public.notifications for update to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());

comment on table public.planned_matches is 'Upcoming match shells with no result stakes until after play.';
