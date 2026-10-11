-- Intent: narrowly scoped atomic commands. No live provisioning or notifications.
-- Rollback: revoke command EXECUTE to disable writes; preserve records/history.
-- Restore only in an isolated environment or via a separately approved runbook.
begin;

create function closevault_private.authorize_command(p_command_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not closevault_private.is_owner() then
    raise exception using errcode = '42501', message = 'CV_UNAUTHORIZED';
  end if;
  if p_command_id is null then
    raise exception using errcode = '22023', message = 'CV_COMMAND_ID_REQUIRED';
  end if;
  -- Serialize this owner's command IDs before acquiring lead/task locks.
  -- Small single-owner CRM: serialization favors correctness over throughput.
  perform 1 from closevault_private.approved_owner where user_id = actor for update;
  return actor;
end;
$$;
create function closevault_private.replay(p_owner uuid, p_id uuid, p_type text, p_request jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare receipt public.command_receipts;
begin
  select * into receipt from public.command_receipts where owner_id = p_owner and command_id = p_id;
  if found then
    if receipt.command_type <> p_type or receipt.request <> p_request then
      raise exception using errcode = '22023', message = 'CV_COMMAND_CONFLICT';
    end if;
    return receipt.result;
  end if;
  return null;
end;
$$;

-- Initial activity/follow-up are OPTIONAL pending owner decisions. No duplicate
-- contact policy, normalization, scoring, contact time or stage inference here.
create function public.cv_create_lead(p_command_id uuid, p_full_name text,
  p_phone text default null, p_email text default null, p_source text default null,
  p_initial_summary text default null, p_initial_action text default null,
  p_initial_due_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := closevault_private.authorize_command(p_command_id);
  request jsonb := jsonb_build_object('name',p_full_name,'phone',p_phone,'email',p_email,
    'source',p_source,'summary',p_initial_summary,'action',p_initial_action,
    'due',to_char(p_initial_due_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  result jsonb;
  lead_id uuid := gen_random_uuid(); task_id uuid;
begin
  result := closevault_private.replay(actor,p_command_id,'create_lead',request);
  if result is not null then return result; end if;
  if coalesce(length(closevault_private.ecmascript_trim(p_full_name)),0) = 0 or
    (p_initial_summary is not null and closevault_private.ecmascript_trim(p_initial_summary) = '') or
    ((p_initial_action is null) <> (p_initial_due_at is null)) or
    (p_initial_action is not null and closevault_private.ecmascript_trim(p_initial_action) = '') or
    (p_initial_due_at is not null and not isfinite(p_initial_due_at)) then
    raise exception using errcode = '22023', message = 'CV_INVALID_COMMAND';
  end if;
  insert into public.leads(id,owner_id,full_name,phone,email,source)
  values(lead_id,actor,closevault_private.ecmascript_trim(p_full_name),p_phone,p_email,p_source);
  if p_initial_action is not null then
    task_id := gen_random_uuid();
    insert into public.follow_ups(id,owner_id,lead_id,title,due_at)
      values(task_id,actor,lead_id,closevault_private.ecmascript_trim(p_initial_action),p_initial_due_at);
    update public.leads set primary_follow_up_id = task_id where id = lead_id;
    insert into public.reminder_intents(owner_id,lead_id,follow_up_id,command_id,action,task_version)
      values(actor,lead_id,task_id,p_command_id,'schedule',1);
  end if;
  insert into public.activities(owner_id,lead_id,command_id,kind,summary)
    values(actor,lead_id,p_command_id,'lead_created','Lead created');
  if p_initial_summary is not null then
    insert into public.activities(owner_id,lead_id,command_id,kind,summary)
      values(actor,lead_id,p_command_id,'initial_inquiry',closevault_private.ecmascript_trim(p_initial_summary));
  end if;
  select jsonb_build_object('lead_id',id,'lead_version',version,'follow_up_id',task_id)
    into result from public.leads where id = lead_id;
  insert into public.command_receipts(owner_id,command_id,command_type,request,result)
    values(actor,p_command_id,'create_lead',request,result);
  return result;
end;
$$;

create function public.cv_cancel_follow_up(p_command_id uuid, p_follow_up_id uuid,
  p_expected_version bigint, p_reason text, p_next_action text,
  p_due_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := closevault_private.authorize_command(p_command_id);
  request jsonb := jsonb_build_object('task',p_follow_up_id,'version',p_expected_version,
    'reason',p_reason,'action',p_next_action,
    'due',to_char(p_due_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  result jsonb; original public.follow_ups; parent public.leads;
  replacement_id uuid := gen_random_uuid(); changed_version bigint;
begin
  result := closevault_private.replay(actor,p_command_id,'cancel_follow_up',request);
  if result is not null then return result; end if;
  if coalesce(length(closevault_private.ecmascript_trim(p_reason)),0) = 0 or
    coalesce(length(closevault_private.ecmascript_trim(p_next_action)),0) = 0 or p_due_at is null or not isfinite(p_due_at) or
    p_expected_version is null then
    raise exception using errcode = '22023', message = 'CV_INVALID_COMMAND';
  end if;
  select * into original from public.follow_ups where id = p_follow_up_id and owner_id = actor;
  if not found then raise exception using errcode = 'P0002', message = 'CV_NOT_FOUND'; end if;
  select * into parent from public.leads where id = original.lead_id and owner_id = actor for update;
  -- Sale-completion eligibility remains undecided; do not infer it here.
  if parent.stage = 'lost' or parent.archived_at is not null then
    raise exception using errcode = '22023', message = 'CV_INACTIVE_LEAD';
  end if;
  select * into original from public.follow_ups where id = p_follow_up_id and owner_id = actor for update;
  if original.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'CV_VERSION_CONFLICT';
  end if;
  if original.status not in ('upcoming','due','overdue','waiting_for_client') then
    raise exception using errcode = '22023', message = 'CV_TERMINAL_FOLLOW_UP';
  end if;
  update public.follow_ups set status='cancelled', outcome=closevault_private.ecmascript_trim(p_reason),
    terminal_at=now(), cancellation_cause='individual_cancellation'
    where id=original.id returning version into changed_version;
  insert into public.follow_ups(id,owner_id,lead_id,title,due_at,replaces_follow_up_id)
    values(replacement_id,actor,parent.id,closevault_private.ecmascript_trim(p_next_action),p_due_at,original.id);
  update public.leads set primary_follow_up_id=replacement_id where id=parent.id;
  insert into public.activities(owner_id,lead_id,command_id,kind,summary,details)
    values(actor,parent.id,p_command_id,'follow_up_cancelled',closevault_private.ecmascript_trim(p_reason),
      jsonb_build_object('original_id',original.id,'replacement_id',replacement_id));
  insert into public.reminder_intents(owner_id,lead_id,follow_up_id,command_id,action,task_version)
    values(actor,parent.id,original.id,p_command_id,'cancel',changed_version),
      (actor,parent.id,replacement_id,p_command_id,'schedule',1);
  select jsonb_build_object('original_id',original.id,'replacement_id',replacement_id,
    'lead_version',version) into result from public.leads where id=parent.id;
  insert into public.command_receipts(owner_id,command_id,command_type,request,result)
    values(actor,p_command_id,'cancel_follow_up',request,result);
  return result;
end;
$$;

-- Contact metadata only: no stage, closure, scoring or planning edits permitted.
create function public.cv_edit_lead(p_command_id uuid, p_lead_id uuid,
  p_expected_version bigint, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := closevault_private.authorize_command(p_command_id);
  request jsonb := jsonb_build_object('lead',p_lead_id,'version',p_expected_version,'changes',p_changes);
  result jsonb; parent public.leads;
begin
  result := closevault_private.replay(actor,p_command_id,'edit_lead',request);
  if result is not null then return result; end if;
  if p_expected_version is null or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or p_changes = '{}'::jsonb then
    raise exception using errcode='22023', message='CV_INVALID_COMMAND';
  end if;
  if exists (select 1 from jsonb_each(p_changes) as item(key,value)
    where key not in ('full_name','phone','email','source') or
    jsonb_typeof(value) not in ('string','null')) or
    (p_changes ? 'full_name' and coalesce(length(closevault_private.ecmascript_trim(p_changes->>'full_name')),0) = 0) then
    raise exception using errcode='22023', message='CV_INVALID_COMMAND';
  end if;
  select * into parent from public.leads where id=p_lead_id and owner_id=actor for update;
  if not found then raise exception using errcode='P0002', message='CV_NOT_FOUND'; end if;
  if parent.version <> p_expected_version then
    raise exception using errcode='40001', message='CV_VERSION_CONFLICT';
  end if;
  update public.leads set
    full_name=case when p_changes ? 'full_name' then closevault_private.ecmascript_trim(p_changes->>'full_name') else full_name end,
    phone=case when p_changes ? 'phone' then p_changes->>'phone' else phone end,
    email=case when p_changes ? 'email' then p_changes->>'email' else email end,
    source=case when p_changes ? 'source' then p_changes->>'source' else source end
    where id=parent.id returning jsonb_build_object('lead_id',id,'lead_version',version) into result;
  insert into public.activities(owner_id,lead_id,command_id,kind,summary,details)
    values(actor,parent.id,p_command_id,'lead_edited','Lead metadata edited',
      jsonb_build_object('before',jsonb_build_object('full_name',parent.full_name,
        'phone',parent.phone,'email',parent.email,'source',parent.source),'changes',p_changes));
  insert into public.command_receipts(owner_id,command_id,command_type,request,result)
    values(actor,p_command_id,'edit_lead',request,result);
  return result;
end;
$$;

revoke all on function closevault_private.authorize_command(uuid) from public, anon, authenticated;
revoke all on function closevault_private.replay(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.cv_create_lead(uuid,text,text,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.cv_cancel_follow_up(uuid,uuid,bigint,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.cv_create_lead(uuid,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.cv_cancel_follow_up(uuid,uuid,bigint,text,text,timestamptz) to authenticated;
revoke all on function public.cv_edit_lead(uuid,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.cv_edit_lead(uuid,uuid,bigint,jsonb) to authenticated;
commit;
