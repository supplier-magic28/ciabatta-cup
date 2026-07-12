-- Owner-only manual tennis-day marks. Match-derived days remain computed facts.
create table public.play_days (
  player_id uuid not null references public.players (id) on delete cascade,
  played_on date not null,
  created_at timestamptz not null default now(),
  primary key (player_id, played_on)
);

alter table public.play_days enable row level security;

create policy "play_days_owner_select" on public.play_days
  for select to authenticated using (player_id = auth.uid());

create policy "play_days_owner_insert_today" on public.play_days
  for insert to authenticated with check (
    player_id = auth.uid()
    and played_on = (now() at time zone 'Australia/Melbourne')::date
  );
create policy "play_days_owner_delete_today" on public.play_days
  for delete to authenticated using (
    player_id = auth.uid()
    and played_on = (now() at time zone 'Australia/Melbourne')::date
  );
