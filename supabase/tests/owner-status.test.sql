-- Isolated database only. Synthetic claims test SQL authorization, not HTTP JWTs.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();
select ok(not p.prosecdef, 'Public owner-status RPC uses invoker security')
from pg_proc p where p.oid='public.cv_owner_status()'::regprocedure;
select is(pg_get_function_result('public.cv_owner_status()'::regprocedure),'boolean','RPC returns only a boolean');
select is(pg_get_function_arguments('public.cv_owner_status()'::regprocedure),'','RPC cannot accept a forged owner ID');
select ok(p.proconfig @> array['search_path=""'], 'RPC search path is empty')
from pg_proc p where p.oid='public.cv_owner_status()'::regprocedure;
select ok(has_function_privilege('authenticated','public.cv_owner_status()','EXECUTE'),'Authenticated RPC grant');
select ok(not has_function_privilege('anon','public.cv_owner_status()','EXECUTE'),'No anonymous RPC grant');
select ok(not exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
 where p.oid='public.cv_owner_status()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'No PUBLIC execution grant');
select ok(not has_table_privilege('authenticated','closevault_private.approved_owner','SELECT'),'Owner registry remains unreadable');
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.cv_owner_status(),false,'Empty registry denies authenticated identity');
reset role;
insert into closevault_private.approved_owner(user_id) values('00000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(public.cv_owner_status(),true,'Approved owner is authorized');
select throws_ok($$select * from closevault_private.approved_owner$$,'42501',null,'Approved owner cannot enumerate private registry');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.cv_owner_status(),false,'Different authenticated identity denied');
select throws_ok($$select * from closevault_private.approved_owner$$,'42501',null,'Other identity cannot enumerate registry');
select throws_ok($$insert into closevault_private.approved_owner(user_id) values('00000000-0000-4000-8000-000000000002')$$,'42501',null,'Authenticated identity cannot provision itself');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select is(public.cv_owner_status(),false,'Missing identity fails closed');
reset role;
set local role anon;
select throws_ok($$select public.cv_owner_status()$$,'42501',null,'Anonymous execution denied at SQL privilege boundary');
reset role;
select is((select count(*) from closevault_private.approved_owner),1::bigint,'Read-only RPC leaves registry unchanged');
select is((select count(*) from public.leads),0::bigint,'RPC does not create CRM records');
select * from finish();
rollback;
