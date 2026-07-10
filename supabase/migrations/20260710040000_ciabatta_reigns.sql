-- Phase 3e: rebuildable Ciabatta-holder history (ADR-0012).
-- Reigns are derived from the same chronological Elo replay as ratings. The
-- existing two-payload cache RPC is intentionally retained for rollback safety.

create table public.ciabatta_reigns (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players (id) on delete restrict,
  started_at timestamptz not null,
  ended_at   timestamptz,
  constraint ciabatta_reigns_valid_period
    check (ended_at is null or ended_at >= started_at)
);

comment on table public.ciabatta_reigns is
  'Rebuildable materialisation of #1 holder periods from computeRankings (ADR-0012).';

create unique index ciabatta_reigns_one_open_reign
  on public.ciabatta_reigns ((true)) where ended_at is null;

create index ciabatta_reigns_player_started_at_idx
  on public.ciabatta_reigns (player_id, started_at desc);

alter table public.ciabatta_reigns enable row level security;

create policy "ciabatta_reigns_select_all"
  on public.ciabatta_reigns for select to authenticated using (true);

-- Keep replace_rating_cache(jsonb, jsonb) from Phase 3d intact. This new RPC
-- gives the release one atomic replacement for ratings, history, and reigns.
create or replace function public.replace_rating_cache_with_reigns(
  p_history jsonb,
  p_ratings jsonb,
  p_reigns jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_reigns) <> 'array' then
    raise exception 'ciabatta reign payload must be a JSON array';
  end if;

  perform public.replace_rating_cache(p_history, p_ratings);

  delete from public.ciabatta_reigns;

  insert into public.ciabatta_reigns (player_id, started_at, ended_at)
  select payload.player_id, payload.started_at, payload.ended_at
  from jsonb_to_recordset(p_reigns) as payload(
    player_id uuid,
    started_at timestamptz,
    ended_at timestamptz
  );
end;
$$;

revoke all on function public.replace_rating_cache_with_reigns(jsonb, jsonb, jsonb) from public;
grant execute on function public.replace_rating_cache_with_reigns(jsonb, jsonb, jsonb) to service_role;
