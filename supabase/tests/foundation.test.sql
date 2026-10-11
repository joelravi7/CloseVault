-- Isolated Supabase test database ONLY. Fictional users, rollback on completion.
-- No remote project reference/connection is present in this file.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();
select ok(c.relrowsecurity, 'RLS enabled: ' || c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('leads','follow_ups','activities','command_receipts','reminder_intents');
select ok(not has_table_privilege('authenticated','public.' || t, operation),
 'No authenticated direct ' || operation || ': ' || t)
from unnest(array['leads','follow_ups','activities','command_receipts','reminder_intents']) t
cross join unnest(array['INSERT','UPDATE','DELETE']) operation;
select ok(not has_table_privilege('anon','public.' || t,'SELECT'), 'No anonymous SELECT: ' || t)
from unnest(array['leads','follow_ups','activities','command_receipts','reminder_intents']) t;

insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000001','Fictional')$$,
 '42501','CV_UNAUTHORIZED','Unprovisioned registry denies commands');
reset role;
insert into closevault_private.approved_owner(user_id) values('00000000-0000-4000-8000-000000000001');
select throws_ok($$update closevault_private.approved_owner set user_id='00000000-0000-4000-8000-000000000002'$$,
 '42501','CV_IMMUTABLE_HISTORY','Owner cannot be silently replaced');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000001','Fictional')$$,
 '42501','CV_UNAUTHORIZED','Other authenticated identity denied');
select is((select count(*) from public.leads),0::bigint,'Other identity sees no leads');
select throws_ok($$insert into public.leads(owner_id,full_name) values('00000000-0000-4000-8000-000000000001','Fictional')$$,
 '42501',null,'Forged-owner direct insert denied');
reset role;
set local role anon;
select throws_ok($$select * from public.leads$$,'42501',null,'Anonymous read denied');
select throws_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000001','Fictional')$$,
 '42501',null,'Anonymous command execution denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000001',' ')$$,
 '22023','CV_INVALID_COMMAND','Blank name rejected');
select throws_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000001','Fictional',p_initial_action=>'Action')$$,
 '22023','CV_INVALID_COMMAND','Partial initial planning rejected');
select is((select count(*) from public.leads),0::bigint,'Validation leaves no lead');
select lives_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000001','Fictional',
 p_initial_summary=>'Fictional inquiry',p_initial_action=>'Original',p_initial_due_at=>'2026-10-10T10:00:00+05:30')$$,
 'Atomic lead with requested initial records');
select is((select count(*) from public.leads),1::bigint,'Owner reads persisted lead');
select lives_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000001','Fictional',
 p_initial_summary=>'Fictional inquiry',p_initial_action=>'Original',p_initial_due_at=>'2026-10-10T10:00:00+05:30')$$,
 'Identical retry returns receipt');
select is((select count(*) from public.follow_ups),1::bigint,'Retry has no duplicate initial task');
select is((select due_at from public.follow_ups),'2026-10-10T04:30:00Z'::timestamptz,
 'Colombo input stored as the correct instant');
set local timezone='America/New_York';
select lives_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000001','Fictional',
 p_initial_summary=>'Fictional inquiry',p_initial_action=>'Original',p_initial_due_at=>'2026-10-10T04:30:00Z')$$,
 'Equivalent UTC retry is independent of session timezone');
set local timezone='UTC';
select is((select count(*) from public.leads),1::bigint,'Timezone retry causes no duplicate');
select throws_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000001','Different')$$,
 '22023','CV_COMMAND_CONFLICT','Reused key with different payload rejected');
select throws_ok($$update public.leads set full_name='Changed'$$,'42501',null,'Direct update denied');
select throws_ok($$delete from public.activities$$,'42501',null,'Direct audit deletion denied');
select throws_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000002',
 (select id from public.follow_ups),99,'Reason','Replacement','2026-10-11T10:00:00+05:30')$$,
 '40001','CV_VERSION_CONFLICT','Stale task version rejected');
select throws_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000002',
 (select id from public.follow_ups),1,' ','Replacement','2026-10-11T10:00:00+05:30')$$,
 '22023','CV_INVALID_COMMAND','Missing cancellation reason rejected');

-- Inject an isolated failure AFTER CRM writes, before intent/receipt completion.
reset role;
create function public.cv_test_fail_intent() returns trigger language plpgsql as $$
begin raise exception using errcode='P0001',message='CV_TEST_FAILURE'; end;
$$;
create trigger cv_test_fail before insert on public.reminder_intents for each row
execute function public.cv_test_fail_intent();
set local role authenticated;
select throws_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000002',
 (select id from public.follow_ups),1,'Reason','Replacement','2026-10-11T10:00:00+05:30')$$,
 'P0001','CV_TEST_FAILURE','Injected persistence failure propagates');
select is((select count(*) from public.follow_ups),1::bigint,'Failed transition rolls back replacement');
select is((select status from public.follow_ups),'upcoming','Failed transition restores original');
select is((select count(*) from public.command_receipts),1::bigint,'Failed transition has no receipt');
select throws_ok($$select public.cv_create_lead('10000000-0000-4000-8000-000000000003','Fictional failed lead',
 p_initial_action=>'Action',p_initial_due_at=>'2026-10-11T10:00:00+05:30')$$,
 'P0001','CV_TEST_FAILURE','Initial creation persistence failure propagates');
select is((select count(*) from public.leads),1::bigint,'Failed initial creation leaves no partial lead');
select is((select count(*) from public.follow_ups),1::bigint,'Failed initial creation leaves no partial task');
reset role;
drop trigger cv_test_fail on public.reminder_intents;
set local role authenticated;
select lives_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000002',
 (select id from public.follow_ups),1,'Reason','Replacement','2026-10-11T10:00:00+05:30')$$,
 'Cancellation commits replacement');
select is((select count(*) from public.follow_ups),2::bigint,'Exactly one replacement retained');
select is((select count(*) from public.reminder_intents),3::bigint,'Durable cancel and schedule intent');
select throws_ok($$select public.cv_edit_lead('10000000-0000-4000-8000-000000000004',
 (select id from public.leads),99,'{"full_name":"Fictional edited"}')$$,
 '40001','CV_VERSION_CONFLICT','Stale lead edit rejected');
select throws_ok($$select public.cv_edit_lead('10000000-0000-4000-8000-000000000004',
 (select id from public.leads),(select version from public.leads),'{"owner_id":"forged"}')$$,
 '22023','CV_INVALID_COMMAND','Forged owner command field rejected');
select throws_ok($$select public.cv_edit_lead('10000000-0000-4000-8000-000000000004',
 (select id from public.leads),(select version from public.leads),'{"stage":"lost"}')$$,
 '22023','CV_INVALID_COMMAND','Metadata edit cannot bypass Lost closure');
select lives_ok($$select public.cv_edit_lead('10000000-0000-4000-8000-000000000004',
 (select id from public.leads),(select version from public.leads),'{"full_name":"Fictional edited"}')$$,
 'Versioned metadata edit commits');
select is((select full_name from public.leads),'Fictional edited','Owner sees metadata change');
reset role;
select throws_ok($$update public.activities set summary='Erased'$$,
 '42501','CV_IMMUTABLE_HISTORY','Audit immutable even through ordinary privileged DML');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.leads),0::bigint,'Non-owner cannot read populated data');
select is((select count(*) from public.activities),0::bigint,'Non-owner cannot read audit data');
reset role;
insert into public.follow_ups(id,owner_id,lead_id,title,due_at)
select '20000000-0000-4000-8000-000000000001',owner_id,id,'Other fictional task','2026-10-12T04:30:00Z'
from public.leads;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000005',
 (select id from public.follow_ups where replaces_follow_up_id is not null),1,
 'Second reason','New mandatory replacement','2026-10-13T10:00:00+05:30')$$,
 'Other active task never bypasses replacement');
select is((select count(*) from public.follow_ups),4::bigint,'Original history plus other task and new replacement');
select throws_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000006',
 (select (result->>'follow_up_id')::uuid from public.command_receipts where command_type='create_lead'),2,
 'Reason','Action','2026-10-13T10:00:00+05:30')$$,
 '22023','CV_TERMINAL_FOLLOW_UP','Terminal cancellation rejected');

-- Replay cancellation itself, comparing the exact result and all row counts.
select is(
 public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000005',
   (select (result->>'replacement_id')::uuid from public.command_receipts
    where command_id='10000000-0000-4000-8000-000000000002'),1,
   'Second reason','New mandatory replacement','2026-10-13T10:00:00+05:30'),
 (select result from public.command_receipts where command_id='10000000-0000-4000-8000-000000000005'),
 'Cancellation retry returns exact committed result');
select is((select count(*) from public.follow_ups),4::bigint,'Cancellation retry creates no extra tasks');
select is((select count(*) from public.activities where command_id='10000000-0000-4000-8000-000000000005'),1::bigint,
 'Cancellation retry creates no extra audit');
select throws_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000005',
 (select (result->>'replacement_id')::uuid from public.command_receipts where command_id='10000000-0000-4000-8000-000000000002'),
 1,'Changed payload','New mandatory replacement','2026-10-13T10:00:00+05:30')$$,
 '22023','CV_COMMAND_CONFLICT','Cancellation same key different payload rejected');
select throws_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000009',
 '20000000-0000-4000-8000-000000000001',1,'Reason',' ','2026-10-13T10:00:00+05:30')$$,
 '22023','CV_INVALID_COMMAND','Blank replacement rejected');
select throws_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000009',
 '20000000-0000-4000-8000-000000000001',1,'Reason','Action',null)$$,
 '22023','CV_INVALID_COMMAND','Missing date rejected');
select throws_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000009',
 '20000000-0000-4000-8000-000000000001',1,'Reason','Action','infinity')$$,
 '22023','CV_INVALID_COMMAND','Infinite date rejected');
select throws_ok($$select public.cv_cancel_follow_up('10000000-0000-4000-8000-000000000009',
 '20000000-0000-4000-8000-000000000001',1,'Reason','Action','2026-02-30T10:00:00Z')$$,
 '22008',null,'Invalid calendar date rejected before command');
select is((select count(*) from public.follow_ups),4::bigint,'Invalid commands leave tasks unchanged');
select is((select count(*) from public.reminder_intents),5::bigint,'Invalid commands leave reminder intents unchanged');

select ok(not has_table_privilege('authenticated','closevault_private.approved_owner','INSERT'),
 'Client cannot provision owner');
select ok(not has_function_privilege('authenticated','closevault_private.authorize_command(uuid)','EXECUTE'),
 'Client cannot invoke internal command helper');
select ok(not has_function_privilege('anon','public.cv_edit_lead(uuid,uuid,bigint,jsonb)','EXECUTE'),
 'Anonymous cannot invoke edit');
select ok(not has_function_privilege('anon','public.cv_cancel_follow_up(uuid,uuid,bigint,text,text,timestamptz)','EXECUTE'),
 'Anonymous cannot invoke cancellation');
select ok(p.prosecdef and p.proconfig @> array['search_path=""'], 'Hardened command: ' || p.proname)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('cv_create_lead','cv_edit_lead','cv_cancel_follow_up');
select throws_ok($$update public.command_receipts set request='{}'$$,'42501',null,'Client cannot forge receipt');
select throws_ok($$insert into public.reminder_intents(owner_id,lead_id,follow_up_id,command_id,action,task_version)
 select owner_id,lead_id,id,'10000000-0000-4000-8000-000000000005','cancel',99 from public.follow_ups limit 1$$,
 '42501',null,'Client cannot forge reminder intent');

reset role;
-- Privileged fixture setup tests FK integrity separately from client permissions.
insert into public.leads(id,owner_id,full_name) values
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Other fictional lead');
select throws_ok($$insert into public.follow_ups(owner_id,lead_id,title,due_at) values
 ('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Forged','2026-10-10T04:30:00Z')$$,
 '23503',null,'Cross-owner lead relation denied by FK');
select throws_ok($$insert into public.follow_ups(owner_id,lead_id,title,due_at,replaces_follow_up_id)
 select owner_id,lead_id,'Duplicate linkage',due_at,replaces_follow_up_id from public.follow_ups
 where replaces_follow_up_id is not null limit 1$$,'23505',null,'Replacement linkage unique');
select throws_ok($$update public.command_receipts set result='{}'$$,
 '42501','CV_IMMUTABLE_HISTORY','Receipt history immutable');
select throws_ok($$delete from public.reminder_intents$$,
 '42501','CV_IMMUTABLE_HISTORY','Reminder intent history immutable');
set local role authenticated;
select throws_ok($$select public.cv_edit_lead('10000000-0000-4000-8000-000000000009',
 '40000000-0000-4000-8000-000000000001',1,'{"full_name":"Forged"}')$$,
 'P0002','CV_NOT_FOUND','Owner command cannot edit another identity record');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.leads),0::bigint,'Other identity cannot read even its own fixture row');
select is((select count(*) from public.follow_ups),0::bigint,'Other identity cannot read follow-ups');
select is((select count(*) from public.command_receipts),0::bigint,'Other identity cannot read receipts');
select is((select count(*) from public.reminder_intents),0::bigint,'Other identity cannot read intent');
select throws_ok($$select public.cv_edit_lead('10000000-0000-4000-8000-000000000009',
 '40000000-0000-4000-8000-000000000001',1,'{"full_name":"Forged"}')$$,
 '42501','CV_UNAUTHORIZED','Other identity edit command denied');
reset role;

-- Force a deferred failure after receipt insertion, at constraint-validation time.
create function public.cv_test_deferred_failure() returns trigger language plpgsql as $$
begin raise exception using errcode='P0001',message='CV_TEST_DEFERRED_FAILURE'; end;
$$;
create constraint trigger cv_test_commit_failure after insert on public.command_receipts
deferrable initially deferred for each row execute function public.cv_test_deferred_failure();
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($sql$do $body$ begin
 perform public.cv_create_lead('10000000-0000-4000-8000-000000000009','Fictional deferred failure',
 p_initial_action=>'Action',p_initial_due_at=>'2026-10-10T04:30:00Z');
 set constraints cv_test_commit_failure immediate;
end $body$$sql$,'P0001','CV_TEST_DEFERRED_FAILURE','Deferred failure rolls back the completed command');
select is((select count(*) from public.leads),1::bigint,'Deferred failure has no partial owner lead');
select is((select count(*) from public.follow_ups),4::bigint,'Deferred failure has no partial follow-up');
select is((select count(*) from public.command_receipts),4::bigint,'Deferred failure has no partial receipt');
-- Phase 4C: exact ECMAScript trim parity, not locale-dependent POSIX classes.
-- Each command executes as the approved authenticated owner. A deliberately
-- raised sentinel rolls successful probes back, keeping cases independent even
-- against the defective SQL. Assertions run outside that rollback block.
reset role;
drop trigger cv_test_commit_failure on public.command_receipts;
create temporary table cv_text_cases(label text, input text, valid boolean, trimmed text);
insert into cv_text_cases values
 ('null',null,false,null), ('empty','',false,''), ('spaces','   ',false,''),
 ('tabs',E'\t\t',false,''), ('newlines',E'\n\n',false,''),
 ('carriage_returns',E'\r\r',false,''), ('mixed',E' \t\r\n ',false,''),
 ('meaningful','Fictional meaningful text',true,'Fictional meaningful text'),
 ('wrapped',chr(160) || E'\t Fictional meaningful text \r\n' || chr(65279),true,'Fictional meaningful text'),
 ('internal',E'Fictional\t meaningful text',true,E'Fictional\t meaningful text');
insert into cv_text_cases
 select 'trim_codepoint_' || cp,chr(cp),false,''
 from unnest(array[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,
 8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279]) cp;
-- Deliberately accepted for parity: JS trim does NOT remove these characters.
insert into cv_text_cases
 select 'nontrim_codepoint_' || cp,chr(cp),true,chr(cp)
 from unnest(array[133,6158,8203,8204,8205,8288]) cp;
grant select on cv_text_cases to authenticated;

create function pg_temp.cv_crm_snapshot() returns jsonb language sql stable as $$
 select jsonb_build_object(
 'leads',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.leads t),
 'follow_ups',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.follow_ups t),
 'activities',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.activities t),
 'command_receipts',(select coalesce(jsonb_agg(to_jsonb(t) order by command_id),'[]') from public.command_receipts t),
 'reminder_intents',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.reminder_intents t));
$$;
create function pg_temp.cv_text_command_probe(op text, label text, input text,
 valid boolean, trimmed text) returns setof text language plpgsql as $$
declare
 before_state jsonb := pg_temp.cv_crm_snapshot(); result jsonb;
 error_code text; error_message text; actual text;
 command_id uuid := '50000000-0000-4000-8000-000000000001';
 owner_lead uuid := (select lead_id from public.follow_ups
  where id='20000000-0000-4000-8000-000000000001');
begin
 begin
  case op
   when 'cancel_reason' then
    result := public.cv_cancel_follow_up(command_id,'20000000-0000-4000-8000-000000000001',1,input,'Replacement','2026-10-14T04:30:00Z');
    select outcome into actual from public.follow_ups where id=(result->>'original_id')::uuid;
   when 'cancel_action' then
    result := public.cv_cancel_follow_up(command_id,'20000000-0000-4000-8000-000000000001',1,'Reason',input,'2026-10-14T04:30:00Z');
    select title into actual from public.follow_ups where id=(result->>'replacement_id')::uuid;
   when 'create_name' then
    result := public.cv_create_lead(command_id,input);
    select full_name into actual from public.leads where id=(result->>'lead_id')::uuid;
   when 'create_summary' then
    result := public.cv_create_lead(command_id,'Fictional',p_initial_summary=>input);
    select summary into actual from public.activities
     where lead_id=(result->>'lead_id')::uuid and kind='initial_inquiry';
   when 'create_action' then
    result := public.cv_create_lead(command_id,'Fictional',p_initial_action=>input,p_initial_due_at=>'2026-10-14T04:30:00Z');
    select title into actual from public.follow_ups where id=(result->>'follow_up_id')::uuid;
   when 'edit_name' then
    result := public.cv_edit_lead(command_id,owner_lead,(select version from public.leads where id=owner_lead),jsonb_build_object('full_name',input));
    select full_name into actual from public.leads where id=owner_lead;
  end case;
  raise exception using errcode='P9999',message='CV_TEST_PROBE_SUCCEEDED';
 exception when others then
  get stacked diagnostics error_code=returned_sqlstate,error_message=message_text;
 end;
 -- A NULL initial inquiry is optional, unlike a mandatory name/reason/action.
 if op='create_summary' and input is null then valid := true; end if;
 return next is(error_code,case when valid then 'P9999' else '22023' end,op || ': ' || label || ' validation');
 return next is(error_message,case when valid then 'CV_TEST_PROBE_SUCCEEDED' else 'CV_INVALID_COMMAND' end,op || ': ' || label || ' clear result');
 if valid then return next is(actual,trimmed,op || ': ' || label || ' trim parity'); end if;
 return next is(pg_temp.cv_crm_snapshot(),before_state,op || ': ' || label || ' all five tables unchanged after rejection/probe rollback');
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.cv_text_command_probe(op,label,input,valid,trimmed)
from cv_text_cases cross join unnest(array['cancel_reason','cancel_action','create_name',
 'create_summary','create_action','edit_name']) op;

-- Constraint probes are privileged intentionally; RPC/RLS probes above are not.
reset role;
create function pg_temp.cv_text_constraint_probe(field text, label text, input text,
 valid boolean) returns setof text language plpgsql as $$
declare error_code text; before_state jsonb := pg_temp.cv_crm_snapshot();
 owner_lead uuid := (select lead_id from public.follow_ups where id='20000000-0000-4000-8000-000000000001');
begin
 begin
  case field
   when 'lead_name' then update public.leads set full_name=input where id=owner_lead;
   when 'closure_reason' then update public.leads set stage='lost',primary_follow_up_id=null,closed_at=now(),closure_reason=input where id=owner_lead;
   when 'task_title' then update public.follow_ups set title=input where id='20000000-0000-4000-8000-000000000001';
   when 'cancel_outcome' then update public.follow_ups set status='cancelled',terminal_at=now(),outcome=input where id='20000000-0000-4000-8000-000000000001';
   when 'activity_kind' then insert into public.activities(owner_id,lead_id,command_id,kind,summary)
    values('00000000-0000-4000-8000-000000000001',owner_lead,'10000000-0000-4000-8000-000000000001',input,'Fictional');
   when 'activity_summary' then insert into public.activities(owner_id,lead_id,command_id,kind,summary)
    values('00000000-0000-4000-8000-000000000001',owner_lead,'10000000-0000-4000-8000-000000000001','Fictional',input);
  end case;
  raise exception using errcode='P9999',message='CV_TEST_PROBE_SUCCEEDED';
 exception when others then get stacked diagnostics error_code=returned_sqlstate; end;
 return next ok(case when valid then error_code='P9999' else error_code in ('23514','23502') end,
  field || ': ' || label || ' constraint');
 return next is(pg_temp.cv_crm_snapshot(),before_state,field || ': ' || label || ' constraint probe rollback');
end;
$$;
select pg_temp.cv_text_constraint_probe(field,label,input,valid)
from cv_text_cases cross join unnest(array['lead_name','closure_reason','task_title',
 'cancel_outcome','activity_kind','activity_summary']) field;
select ok(p.provolatile='i' and p.proisstrict and p.proparallel='s' and not p.prosecdef
 and p.proconfig @> array['search_path=""'],'Trim helper deterministic, NULL-strict, invoker and hardened')
from pg_proc p where p.oid='closevault_private.ecmascript_trim(text)'::regprocedure;
select ok(not has_function_privilege('authenticated','closevault_private.ecmascript_trim(text)','EXECUTE'),
 'Authenticated client cannot invoke private trim helper');
select ok(not has_function_privilege('anon','closevault_private.ecmascript_trim(text)','EXECUTE'),
 'Anonymous client cannot invoke private trim helper');
select is(closevault_private.ecmascript_trim(null),null::text,'Trim helper preserves NULL');
select is(closevault_private.ecmascript_trim(input),trimmed,'Canonical trim helper: ' || label) from cv_text_cases;
select * from finish();
rollback;
