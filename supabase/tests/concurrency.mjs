// Local-only two-session tests. Never accepts a URL, project ref or credentials.
// Leaves fictional fixtures in the positively identified disposable database.
import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const container = 'closevault-phase4c-whitespace-local';
const project = execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "com.supabase.cli.project"}}', container], { encoding: 'utf8' }).trim();
assert.equal(project, 'closevault-phase4c-whitespace', 'Refuse any other Docker project');
const network = execFileSync('docker', ['inspect', '--format', '{{.HostConfig.NetworkMode}}', container], { encoding: 'utf8' }).trim();
const ports = execFileSync('docker', ['inspect', '--format', '{{json .HostConfig.PortBindings}}', container], { encoding: 'utf8' }).trim();
assert.equal(network, 'none', 'Refuse a network-accessible test database');
assert.ok(ports === '{}' || ports === 'null', 'Refuse published database ports');
const args = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const query = (sql) => execFileSync('docker', args, { input: sql, encoding: 'utf8' }).trim();
assert.equal(query('select count(*) from closevault_private.approved_owner;'), '0',
  'Use a fresh disposable database; never overwrite an existing owner');
assert.equal(query('select count(*) from public.leads;'), '0', 'Never test against an existing CRM');
query(`begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
insert into closevault_private.approved_owner(user_id) values ('00000000-0000-4000-8000-000000000001');
commit;`);
const auth = `set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);`;
query(`${auth} select public.cv_create_lead('30000000-0000-4000-8000-000000000001','Fictional race lead',
p_initial_action=>'Original',p_initial_due_at=>'2026-10-10T04:30:00Z');`);
const lead = query('select id from public.leads;');
const task = query('select id from public.follow_ups;');

function session(sql) {
  const process = spawn('docker', args);
  let stdout = '', stderr = '';
  let notify;
  const locked = new Promise((resolve) => { notify = resolve; });
  process.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('CV_LOCK_HELD')) notify();
  });
  process.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    process.on('error', reject);
    process.on('close', (code) => { notify(); resolve({ code, stdout, stderr }); });
  });
  process.stdin.end(sql);
  return { locked, done };
}
async function race(first, second, expectedError) {
  const a = session(`set application_name='cv_race_a'; ${auth}
begin; ${first}; select 'CV_LOCK_HELD'; select pg_sleep(3); commit;`);
  await a.locked;
  const b = session(`set application_name='cv_race_b'; ${auth} ${second};`);
  let observed = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    if (query(`select count(*) from pg_stat_activity where application_name='cv_race_b' and wait_event_type='Lock';`) === '1') {
      observed = true; break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const [left, right] = await Promise.all([a.done, b.done]);
  assert.equal(left.code, 0, left.stderr);
  assert.ok(observed, 'Second live session must actually wait on a lock');
  if (expectedError) {
    assert.notEqual(right.code, 0);
    assert.ok(right.stderr.includes(expectedError), right.stderr);
  } else assert.equal(right.code, 0, right.stderr);
}

await race(
  `select public.cv_cancel_follow_up('30000000-0000-4000-8000-000000000002','${task}',1,'Reason','Replacement','2026-10-11T04:30:00Z')`,
  `select public.cv_cancel_follow_up('30000000-0000-4000-8000-000000000003','${task}',1,'Other reason','Other replacement','2026-10-11T04:30:00Z')`,
  'CV_VERSION_CONFLICT');
assert.equal(query('select count(*) from public.follow_ups;'), '2');
assert.equal(query('select count(*) from public.follow_ups where replaces_follow_up_id is not null;'), '1');
console.log('PASS: two cancellation sessions, exactly one replacement');

const version = query(`select version from public.leads where id='${lead}';`);
await race(
  `select public.cv_edit_lead('30000000-0000-4000-8000-000000000004','${lead}',${version},'{"source":"Fictional A"}')`,
  `select public.cv_edit_lead('30000000-0000-4000-8000-000000000005','${lead}',${version},'{"source":"Fictional B"}')`,
  'CV_VERSION_CONFLICT');
console.log('PASS: two edit sessions, stale version rejected');

await race(
  `select public.cv_create_lead('30000000-0000-4000-8000-000000000006','Fictional concurrent A')`,
  `select public.cv_create_lead('30000000-0000-4000-8000-000000000007','Fictional concurrent B')`);
assert.equal(query('select count(*) from public.leads;'), '3');
console.log('PASS: concurrent distinct lead commands commit independently');

await race(
  `select public.cv_create_lead('30000000-0000-4000-8000-000000000008','Fictional same key')`,
  `select public.cv_create_lead('30000000-0000-4000-8000-000000000008','Fictional same key')`);
assert.equal(query('select count(*) from public.leads;'), '4');
console.log('PASS: concurrent same command key produces one lead');

// Unlike pgTAP's subtransaction injection, this exercises a real COMMIT failure.
const countsBefore = query(`select json_build_array(
 (select count(*) from public.leads),(select count(*) from public.follow_ups),
 (select count(*) from public.activities),(select count(*) from public.command_receipts),
 (select count(*) from public.reminder_intents));`);
query(`create function public.cv_race_fail_commit() returns trigger language plpgsql as $body$
begin raise exception using errcode='P0001',message='CV_REAL_COMMIT_FAILURE'; end; $body$;
create constraint trigger cv_race_commit_failure after insert on public.command_receipts
deferrable initially deferred for each row execute function public.cv_race_fail_commit();`);
try {
  const failed = await session(`${auth} begin;
  select public.cv_create_lead('30000000-0000-4000-8000-000000000009','Fictional commit failure',
   p_initial_action=>'Action',p_initial_due_at=>'2026-10-10T04:30:00Z'); commit;`).done;
  assert.notEqual(failed.code, 0);
  assert.ok(failed.stderr.includes('CV_REAL_COMMIT_FAILURE'), failed.stderr);
  assert.equal(query(`select json_build_array(
   (select count(*) from public.leads),(select count(*) from public.follow_ups),
   (select count(*) from public.activities),(select count(*) from public.command_receipts),
   (select count(*) from public.reminder_intents));`), countsBefore);
  console.log('PASS: actual COMMIT failure rolls back all five CRM tables');
} finally {
  query('drop trigger cv_race_commit_failure on public.command_receipts; drop function public.cv_race_fail_commit();');
}
