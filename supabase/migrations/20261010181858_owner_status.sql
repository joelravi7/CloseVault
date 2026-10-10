-- Intent: authenticated boolean owner check; never exposes registry identities.
-- Local draft only. Rollback: revoke RPC execution; preserve registry and data.
begin;
create function public.cv_owner_status() returns boolean
language sql stable security invoker set search_path = '' as $$
  select closevault_private.is_owner();
$$;
revoke all on function public.cv_owner_status() from public, anon, authenticated;
grant execute on function public.cv_owner_status() to authenticated;
commit;
