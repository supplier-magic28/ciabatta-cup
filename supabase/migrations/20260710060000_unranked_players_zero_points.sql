-- Unranked players display zero points until their first approved ranked match
-- (ADR-0014). Elo still begins from the internal 1000-point baseline.

alter table public.players
  alter column rating_points set default 0;

update public.players as player
set rating_points = 0
where not exists (
  select 1
  from public.matches as match
  where match.type = 'ranked'
    and match.status = 'approved'
    and (match.player1_id = player.id or match.player2_id = player.id)
);

-- Preserve the existing two-payload signature used by the three-payload reign
-- RPC. Only the reset value changes; Elo remains in the TypeScript engine.
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

  update public.players set rating_points = 0;

  update public.players as player
  set rating_points = payload.rating_points
  from jsonb_to_recordset(p_ratings) as payload(player_id uuid, rating_points int)
  where player.id = payload.player_id;
end;
$$;

revoke all on function public.replace_rating_cache(jsonb, jsonb) from public;
grant execute on function public.replace_rating_cache(jsonb, jsonb) to service_role;
