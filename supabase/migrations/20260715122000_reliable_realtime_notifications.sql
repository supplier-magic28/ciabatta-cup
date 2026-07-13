-- Reliable receiver fan-out and live Zeus inbox updates (ADR-0032).
create or replace function public.notify_planned_match_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_submitter uuid;
begin
  if tg_op = 'INSERT' then
    if new.status = 'proposed' and new.opponent_player_id is not null then
      insert into public.notifications(player_id, kind, planned_match_id, body, target_path, dedupe_key)
      values (new.opponent_player_id, 'match_proposed', new.id,
        'A match proposal is waiting for your answer.', '/matches/' || new.id,
        'planned:' || new.id || ':match_proposed')
      on conflict (player_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;

  if old.status = 'proposed' and new.status = 'locked_in' then
    insert into public.notifications(player_id, kind, planned_match_id, body, target_path, dedupe_key)
    values (new.created_by, 'match_locked_in', new.id,
      'Your proposed match is locked in.', '/matches/' || new.id,
      'planned:' || new.id || ':match_locked_in')
    on conflict (player_id, dedupe_key) where dedupe_key is not null do nothing;
  elsif old.status = 'proposed' and new.status = 'declined' then
    insert into public.notifications(player_id, kind, planned_match_id, body, target_path, dedupe_key)
    values (new.created_by, 'match_declined', new.id,
      'Your proposed match was declined.', '/matches/' || new.id,
      'planned:' || new.id || ':match_declined')
    on conflict (player_id, dedupe_key) where dedupe_key is not null do nothing;
  elsif new.status = 'cancelled' then
    v_recipient := case when new.cancelled_by = new.created_by then new.opponent_player_id else new.created_by end;
    if v_recipient is not null then
      insert into public.notifications(player_id, kind, planned_match_id, body, target_path, dedupe_key)
      values (v_recipient, 'match_cancelled', new.id,
        'Your planned match was cancelled.', '/matches/' || new.id,
        'planned:' || new.id || ':match_cancelled')
      on conflict (player_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  elsif old.status = 'locked_in' and new.status = 'awaiting_result_approval' then
    select submitted_by into v_submitter
      from public.planned_match_results
      where planned_match_id = new.id and status = 'pending'
      order by created_at desc limit 1;
    v_recipient := case when v_submitter = new.created_by then new.opponent_player_id else new.created_by end;
    if v_recipient is not null then
      insert into public.notifications(player_id, kind, planned_match_id, body, target_path, dedupe_key)
      values (v_recipient, 'result_to_approve', new.id,
        'A match result is waiting for your approval.', '/matches/' || new.id,
        'planned:' || new.id || ':result_to_approve')
      on conflict (player_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  elsif new.status = 'confirmed' then
    insert into public.notifications(player_id, kind, planned_match_id, body, target_path, dedupe_key)
    select recipient, 'result_confirmed'::public.notification_kind, new.id,
      'Your match result is confirmed.', '/matches/' || new.id,
      'planned:' || new.id || ':result_confirmed'
    from unnest(array[new.created_by, new.opponent_player_id]) recipient
    where recipient is not null
    on conflict (player_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists planned_matches_notification_fanout on public.planned_matches;
create trigger planned_matches_notification_fanout
after insert or update of status on public.planned_matches
for each row execute function public.notify_planned_match_lifecycle();

-- Postgres Changes respects the existing owner-select RLS policy. Publication
-- membership is idempotent so this migration is safe if enabled manually first.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end;
$$;

comment on function public.notify_planned_match_lifecycle() is
  'Atomically fans planned-match lifecycle notifications to the affected receiver.';
