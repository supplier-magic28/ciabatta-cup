-- Phase 3d: rebuildable Elo materialisation (ADR-0011).
-- Match facts remain authoritative. `rating_history` and `rating_points` are
-- replaced together from the output of lib/scoring/computeRankings.

create table public.rating_history (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players (id) on delete restrict,
  match_id      uuid not null references public.matches (id) on delete restrict,
  points_before int not null check (points_before >= 100),
  points_after  int not null check (points_after >= 100),
  rank_before   int not null check (rank_before > 0),
  rank_after    int not null check (rank_after > 0),
  created_at    timestamptz not null default now(),
  unique (match_id, player_id)
);

comment on table public.rating_history is
  'Rebuildable materialisation of computeRankings over approved ranked match facts (ADR-0003, ADR-0011).';

create index rating_history_player_id_created_at_idx
  on public.rating_history (player_id, created_at desc);

alter table public.rating_history enable row level security;

create policy "rating_history_select_all"
  on public.rating_history for select to authenticated using (true);

-- This RPC is intentionally data-only: Elo is computed in TypeScript by the
-- tested pure function, then this transaction replaces both derived stores.
create or replace function public.replace_rating_cache(
  p_history jsonb,
  p_ratings jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_history) <> 'array' or jsonb_typeof(p_ratings) <> 'array' then
    raise exception 'rating cache payloads must be JSON arrays';
  end if;

  delete from public.rating_history;

  insert into public.rating_history (
    player_id, match_id, points_before, points_after, rank_before, rank_after
  )
  select
    payload.player_id,
    payload.match_id,
    payload.points_before,
    payload.points_after,
    payload.rank_before,
    payload.rank_after
  from jsonb_to_recordset(p_history) as payload(
    player_id uuid,
    match_id uuid,
    points_before int,
    points_after int,
    rank_before int,
    rank_after int
  );

  update public.players set rating_points = 1000;

  update public.players as player
  set rating_points = payload.rating_points
  from jsonb_to_recordset(p_ratings) as payload(player_id uuid, rating_points int)
  where player.id = payload.player_id;
end;
$$;

revoke all on function public.replace_rating_cache(jsonb, jsonb) from public;
grant execute on function public.replace_rating_cache(jsonb, jsonb) to service_role;
