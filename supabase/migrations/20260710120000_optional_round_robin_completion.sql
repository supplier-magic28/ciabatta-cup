-- Phase 5d: allow a director to complete from round-robin standings.

create type public.tournament_completion_path as enum ('round_robin', 'final_stage');

alter table public.tournaments
  add column completion_path public.tournament_completion_path;

alter table public.fixtures
  add column skipped_at timestamptz;

create or replace function public.enforce_tournament_fixture_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament_id uuid := case when tg_op = 'DELETE' then old.tournament_id else new.tournament_id end;
begin
  -- Early completion may preserve an unplayed final/playoff fixture as skipped.
  -- No other fixture field may change in the same update.
  if tg_op = 'UPDATE'
     and old.stage in ('final', 'playoff')
     and old.skipped_at is null
     and new.skipped_at is not null
     and (to_jsonb(new) - 'skipped_at') = (to_jsonb(old) - 'skipped_at') then
    return new;
  end if;

  if exists (
    select 1 from public.tournaments
    where id = target_tournament_id and draw_locked_at is not null
  ) and (tg_op <> 'INSERT' or new.stage = 'group') then
    raise exception 'round-robin fixtures are locked by the director';
  end if;
  if exists (select 1 from public.matches where tournament_id = target_tournament_id)
     and (tg_op <> 'INSERT' or new.stage = 'group') then
    raise exception 'round-robin fixtures are locked after the first result';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.complete_tournament_from_standings(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  group_fixture_count int;
  group_result_count int;
  second_wins int;
  third_wins int;
begin
  if not public.is_admin() then
    raise exception 'only admins may complete a tournament';
  end if;

  perform 1 from public.tournaments
   where id = p_tournament_id and status in ('scheduled', 'live')
   for update;
  if not found then raise exception 'tournament cannot be completed'; end if;

  select count(*) into group_fixture_count
    from public.fixtures
   where tournament_id = p_tournament_id and stage = 'group';

  select count(*) into group_result_count
    from public.fixtures f
    join public.matches m on m.fixture_id = f.id and m.status = 'approved'
   where f.tournament_id = p_tournament_id and f.stage = 'group';

  if group_fixture_count = 0 or group_result_count <> group_fixture_count then
    raise exception 'complete every round-robin fixture first';
  end if;

  with wins as (
    select tp.player_id,
           count(m.id) filter (where m.winner_id = tp.player_id)::int as won,
           tp.seed
      from public.tournament_participants tp
      left join public.fixtures f
        on f.tournament_id = tp.tournament_id
       and f.stage = 'group'
       and tp.player_id in (f.player1_id, f.player2_id)
      left join public.matches m on m.fixture_id = f.id and m.status = 'approved'
     where tp.tournament_id = p_tournament_id
     group by tp.player_id, tp.seed
  ), ordered as (
    select won, row_number() over (order by won desc, seed asc) as position
      from wins
  )
  select max(won) filter (where position = 2),
         max(won) filter (where position = 3)
    into second_wins, third_wins
    from ordered;

  if second_wins = third_wins and not exists (
    select 1
      from public.fixtures f
      join public.matches m on m.fixture_id = f.id and m.status = 'approved'
     where f.tournament_id = p_tournament_id and f.stage = 'tiebreak'
  ) then
    raise exception 'complete the qualification decider first';
  end if;

  if exists (
    select 1
      from public.fixtures f
      join public.matches m on m.fixture_id = f.id
     where f.tournament_id = p_tournament_id
       and f.stage in ('final', 'playoff')
  ) then
    raise exception 'the final stage has already started';
  end if;

  update public.fixtures
     set skipped_at = now()
   where tournament_id = p_tournament_id
     and stage in ('final', 'playoff')
     and skipped_at is null;

  update public.tournaments
     set status = 'completed', completion_path = 'round_robin'
   where id = p_tournament_id;
end;
$$;

revoke all on function public.complete_tournament_from_standings(uuid) from public;
grant execute on function public.complete_tournament_from_standings(uuid) to authenticated;
