-- Owners may remove test/mistaken Non-Ciabatta facts. Ranked, exhibition, and
-- tournament facts remain immutable. The app rebuilds derived ratings after.

create or replace function public.enforce_match_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      if old.type = 'unranked_external' and old.submitted_by = auth.uid() then
        return old;
      end if;
      raise exception
        'matches: approved matches are immutable facts (ADR-0001) and cannot be deleted; record a correction as a new match';
    end if;
    return old;
  end if;

  if old.status = 'approved' then
    raise exception
      'matches: approved matches are immutable facts (ADR-0001) and cannot be edited; record a correction as a new match';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_parent_match_immutable()
returns trigger
language plpgsql
as $$
declare
  target_match_id uuid := case when tg_op = 'DELETE' then old.match_id else new.match_id end;
begin
  if tg_op = 'DELETE' and exists (
    select 1 from public.matches
    where id = target_match_id
      and status = 'approved'
      and type = 'unranked_external'
      and submitted_by = auth.uid()
  ) then
    return old;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and public.match_is_approved(new.match_id) then
    raise exception '%: cannot modify rows of an approved (immutable) match (ADR-0001)', tg_table_name;
  end if;
  if tg_op in ('DELETE', 'UPDATE') and public.match_is_approved(old.match_id) then
    raise exception '%: cannot modify rows of an approved (immutable) match (ADR-0001)', tg_table_name;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.delete_own_external_match(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.matches
    where id = p_match_id and type = 'unranked_external' and submitted_by = v_owner
  ) then return false; end if;
  delete from public.rating_history where match_id = p_match_id;
  delete from public.matches
  where id = p_match_id
    and type = 'unranked_external'
    and submitted_by = v_owner;
  return true;
end;
$$;

revoke all on function public.delete_own_external_match(uuid) from public;
grant execute on function public.delete_own_external_match(uuid) to authenticated;
