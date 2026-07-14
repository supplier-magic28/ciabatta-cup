alter type public.notification_kind add value if not exists 'tournament_invite';

do $$ begin
  create type public.tournament_invite_status as enum ('sent','opened','accepted','expired');
exception when duplicate_object then null; end $$;
