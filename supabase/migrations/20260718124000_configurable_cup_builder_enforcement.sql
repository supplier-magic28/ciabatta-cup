-- Enforcement half of ADR-0039. Apply after the application deploys the v2
-- cup creation, draw-lock, and result RPCs.
revoke execute on function public.lock_tournament_draw(uuid) from authenticated;
revoke execute on function public.record_tournament_result(uuid,uuid,jsonb,timestamptz,int) from authenticated;
