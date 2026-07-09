-- Advance a match's status when both participants have confirmed (ADR-0010).
--
-- This wires the lifecycle transition ADR-0006 deferred: once both participants
-- have a match_confirmations row, a `pending_confirmation` match moves to
-- `pending_approval` (ranked — awaits an admin) or straight to `approved`
-- (exhibition — record only, no admin step).
--
-- It must be a SECURITY DEFINER trigger, not a server action: the opponent who
-- confirms has no RLS path to UPDATE matches (only the submitter and admins do),
-- and this keeps the "both confirmed => advance" invariant in the database. It
-- composes with the immutability guards: the update runs while OLD.status is
-- still `pending_confirmation`, so enforce_match_immutable() permits it, and any
-- later confirmation insert on the now-approved exhibition match is blocked.
create or replace function public.advance_on_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
  confirmed int;
begin
  select * into m from public.matches where id = new.match_id;
  if not found or m.status <> 'pending_confirmation' then
    return new;  -- already advanced, or terminal
  end if;

  select count(distinct player_id) into confirmed
  from public.match_confirmations
  where match_id = new.match_id
    and player_id in (m.player1_id, m.player2_id);

  if confirmed >= 2 then
    update public.matches
       set status = case
                      when m.type = 'ranked' then 'pending_approval'::public.match_status
                      else 'approved'::public.match_status
                    end
     where id = m.id;
  end if;

  return new;
end;
$$;

create trigger advance_on_confirmation
  after insert on public.match_confirmations
  for each row
  execute function public.advance_on_confirmation();
