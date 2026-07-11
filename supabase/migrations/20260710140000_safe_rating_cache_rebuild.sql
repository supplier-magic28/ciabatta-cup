-- Phase 5f: keep full rating-cache replacement compatible with safe-update
-- enforcement in hosted production. These are intentional whole-table deletes;
-- `where true` preserves that behavior while making the scope explicit.

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

  delete from public.rating_history where true;

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

  update public.players set rating_points = 0 where true;

  update public.players as player
  set rating_points = payload.rating_points
  from jsonb_to_recordset(p_ratings) as payload(player_id uuid, rating_points int)
  where player.id = payload.player_id;
end;
$$;

revoke all on function public.replace_rating_cache(jsonb, jsonb) from public;
grant execute on function public.replace_rating_cache(jsonb, jsonb) to service_role;

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

  delete from public.ciabatta_reigns where true;

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
