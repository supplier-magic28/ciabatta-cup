-- Separate transaction: PostgreSQL enum additions must commit before the new
-- notification kind can be used in rows.
insert into public.notifications(player_id, kind, body, target_path, dedupe_key)
select distinct participant.player_id,
  'untagged_matches_nudge'::public.notification_kind,
  'Some of your match records are missing a court or surface. Complete the record when you have a minute.',
  '/matches/untagged',
  'untagged:backfill'
from (
  select player1_id as player_id from public.matches where status = 'approved' and (court_id is null or surface is null)
  union
  select player2_id from public.matches where status = 'approved' and player2_id is not null and (court_id is null or surface is null)
) participant
on conflict (player_id, dedupe_key) where dedupe_key is not null do nothing;
