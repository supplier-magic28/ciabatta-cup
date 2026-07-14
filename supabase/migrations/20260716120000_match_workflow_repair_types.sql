-- Enum additions must commit before the repaired workflow can use them.
alter type public.planned_match_status add value if not exists 'awaiting_result_correction';
alter type public.planned_result_status add value if not exists 'queried';

alter type public.notification_kind add value if not exists 'match_confirmation_required';
alter type public.notification_kind add value if not exists 'match_awaiting_admin_approval';
alter type public.notification_kind add value if not exists 'match_approved';
alter type public.notification_kind add value if not exists 'match_queried';
alter type public.notification_kind add value if not exists 'match_rejected';
alter type public.notification_kind add value if not exists 'result_correction_requested';

alter table public.planned_match_results
  add column supersedes_id uuid references public.planned_match_results(id) on delete set null,
  add column corrected_by uuid references public.players(id) on delete restrict;

alter table public.notifications
  add column match_id uuid references public.matches(id) on delete cascade;

create index notifications_match_id_idx on public.notifications(match_id)
  where match_id is not null;

comment on column public.planned_match_results.supersedes_id is
  'Prior proposal revision replaced by this append-only organiser correction.';
comment on column public.planned_match_results.corrected_by is
  'Organiser who authored a corrected proposal revision; null for player submissions.';
comment on column public.notifications.match_id is
  'Optional ordinary or materialised planned match targeted by this notification.';
