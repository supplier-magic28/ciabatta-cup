-- Phase 5e: derived placement awards and result-email delivery kinds.

alter type public.tournament_email_kind add value if not exists 'result_1st';
alter type public.tournament_email_kind add value if not exists 'result_2nd';
alter type public.tournament_email_kind add value if not exists 'result_3rd';
alter type public.tournament_email_kind add value if not exists 'result_4th';

create table public.tournament_placements (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  placement int not null check (placement between 1 and 4),
  points int not null check (
    (placement = 1 and points = 100) or
    (placement = 2 and points = 50) or
    (placement = 3 and points = 20) or
    (placement = 4 and points = 10)
  ),
  awarded_at timestamptz not null default now(),
  primary key (tournament_id, player_id),
  unique (tournament_id, placement)
);

alter table public.tournament_placements enable row level security;

create policy "tournament_placements_select_all" on public.tournament_placements
  for select to authenticated using (true);
create policy "tournament_placements_admin_all" on public.tournament_placements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
