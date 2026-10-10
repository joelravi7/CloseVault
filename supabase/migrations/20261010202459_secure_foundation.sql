-- Intent: deny-by-default CRM foundation; no owner or Auth account is provisioned.
-- Apply only after review in an isolated Supabase instance. Never run against live
-- data without deployment approval. Rollback: revert an empty isolated instance;
-- with data, use a reviewed forward repair or verified restore, not DROP CASCADE.
begin;

create schema closevault_private;
revoke all on schema closevault_private from public, anon, authenticated;

create table closevault_private.approved_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id),
  created_at timestamptz not null default now()
);
alter table closevault_private.approved_owner enable row level security;
revoke all on closevault_private.approved_owner from public, anon, authenticated;

create function closevault_private.reject_history_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'CV_IMMUTABLE_HISTORY';
end;
$$;
create trigger immutable_owner before update or delete
on closevault_private.approved_owner for each row
execute function closevault_private.reject_history_mutation();

create function closevault_private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from closevault_private.approved_owner where user_id = auth.uid()
  );
$$;
revoke all on function closevault_private.is_owner() from public, anon, authenticated;
grant usage on schema closevault_private to authenticated;
grant execute on function closevault_private.is_owner() to authenticated;

-- Canonical ECMAScript String.trim WhiteSpace + LineTerminator set (25 code
-- points). Explicit characters avoid locale/Unicode differences in POSIX classes.
-- Includes FEFF; excludes 0085, 180E, 200B/C/D and 2060, matching the app's trim.
-- Only boundary whitespace is removed; internal text is preserved. NULL stays
-- NULL; required checks below explicitly coalesce it to a failing predicate.
create function closevault_private.ecmascript_trim(value text) returns text
language sql immutable strict parallel safe security invoker set search_path = '' as $$
  select pg_catalog.btrim(value,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
revoke all on function closevault_private.ecmascript_trim(text) from public, anon, authenticated;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  full_name text not null check (coalesce(length(closevault_private.ecmascript_trim(full_name)),0) > 0),
  phone text,
  email text,
  source text,
  stage text not null default 'new' check (stage in (
    'new','connected','requirement_identified','documents_sent','serious_interest',
    'site_visit_planned','site_visit_completed','unit_shortlisted','negotiation',
    'reservation_expected','reserved','spa_in_progress','sale_completed',
    'long_term_follow_up','lost')),
  primary_follow_up_id uuid,
  closure_reason text,
  closed_at timestamptz,
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (stage <> 'lost' or (primary_follow_up_id is null and
    closed_at is not null and coalesce(length(closevault_private.ecmascript_trim(closure_reason)),0) > 0))
);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  lead_id uuid not null,
  title text not null check (coalesce(length(closevault_private.ecmascript_trim(title)),0) > 0),
  due_at timestamptz not null check (isfinite(due_at)),
  status text not null default 'upcoming' check (status in (
    'upcoming','due','overdue','waiting_for_client','completed','cancelled','rescheduled')),
  outcome text,
  terminal_at timestamptz,
  cancellation_cause text,
  replaces_follow_up_id uuid unique,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id, lead_id),
  foreign key (lead_id, owner_id) references public.leads(id, owner_id),
  foreign key (replaces_follow_up_id, owner_id, lead_id)
    references public.follow_ups(id, owner_id, lead_id),
  check ((status in ('completed','cancelled','rescheduled')) = (terminal_at is not null)),
  check (status <> 'cancelled' or coalesce(length(closevault_private.ecmascript_trim(outcome)),0) > 0)
);
alter table public.leads add constraint primary_follow_up_same_lead
foreign key (primary_follow_up_id, owner_id, id)
references public.follow_ups(id, owner_id, lead_id);

create table public.command_receipts (
  command_id uuid not null,
  owner_id uuid not null references auth.users(id),
  command_type text not null,
  -- Exact canonical JSON comparison; private request data must never be logged.
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (owner_id, command_id)
);
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  lead_id uuid not null,
  command_id uuid not null,
  kind text not null check (coalesce(length(closevault_private.ecmascript_trim(kind)),0) > 0),
  summary text not null check (coalesce(length(closevault_private.ecmascript_trim(summary)),0) > 0),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (lead_id, owner_id) references public.leads(id, owner_id),
  foreign key (owner_id, command_id) references public.command_receipts(owner_id, command_id)
    deferrable initially deferred
);
create table public.reminder_intents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  lead_id uuid not null,
  follow_up_id uuid not null,
  command_id uuid not null,
  action text not null check (action in ('schedule','cancel')),
  task_version bigint not null check (task_version > 0),
  created_at timestamptz not null default now(),
  foreign key (follow_up_id, owner_id, lead_id) references public.follow_ups(id, owner_id, lead_id),
  foreign key (owner_id, command_id) references public.command_receipts(owner_id, command_id)
    deferrable initially deferred,
  unique (follow_up_id, task_version, action)
);

create function closevault_private.bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id or new.id is distinct from old.id then
    raise exception using errcode = '42501', message = 'CV_IMMUTABLE_IDENTITY';
  end if;
  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger leads_version before update on public.leads for each row
execute function closevault_private.bump_version();
create trigger follow_ups_version before update on public.follow_ups for each row
execute function closevault_private.bump_version();

-- Explicit revocations override Supabase default table grants. This entire file
-- is transactional: tables, policies and privileges become visible together.
do $$
declare t text;
begin
  foreach t in array array['leads','follow_ups','activities','command_receipts','reminder_intents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy owner_read on public.%I for select to authenticated using (owner_id = (select auth.uid()) and (select closevault_private.is_owner()))', t);
  end loop;
  foreach t in array array['activities','command_receipts','reminder_intents'] loop
    execute format('create trigger immutable_history before update or delete on public.%I for each row execute function closevault_private.reject_history_mutation()', t);
  end loop;
end;
$$;
revoke all on function closevault_private.reject_history_mutation() from public, anon, authenticated;
revoke all on function closevault_private.bump_version() from public, anon, authenticated;

create index leads_owner_stage on public.leads(owner_id, stage);
create index follow_ups_owner_due on public.follow_ups(owner_id, due_at)
where status in ('upcoming','due','overdue','waiting_for_client');
create index follow_ups_lead on public.follow_ups(owner_id, lead_id);
create index activities_lead_time on public.activities(owner_id, lead_id, occurred_at);
create index reminder_intents_owner_time on public.reminder_intents(owner_id, created_at);
commit;
