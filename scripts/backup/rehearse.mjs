// LOCAL ONLY. No hosted URLs, credentials, saved tokens or Supabase CLI calls.
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdtemp, chmod, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { docker, image, verifyContainer, sql, dumpSource, restoreFresh } from './local-database.mjs';
import { encryptBackup, decryptBackup, generateIdentity, ageVersion, sha256 } from './envelope.mjs';

assert.equal(process.argv.length, 2, 'This local rehearsal accepts no connection arguments.');
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const run = `closevault-backup-${randomBytes(6).toString('hex')}`;
const source = `${run}-source`, target = `${run}-restore`, created = [];
const directory = await mkdtemp(join(tmpdir(), `${run}-`)); await chmod(directory, 0o700);
const backup = join(directory, 'fictional.cvbackup.age'), identityFile = join(directory, 'disposable-identity.txt');
let networkCreated = false;
const report = { run, directory, coverage: 'local-fictional-CRM-only', verification: 'incomplete', checks: [], tools: {}, artifacts: {} };
function pass(label) { report.checks.push(label); console.log(`PASS ${label}`); }
function ownerCommand(name, queryText, owner = '70000000-0000-4000-8000-000000000001') {
  return sql(name, run, `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${owner}',true) is not null; ${queryText}; commit;`).split('\n').at(-1);
}
const tables = ['public.leads', 'public.follow_ups', 'public.activities', 'public.command_receipts', 'public.reminder_intents', 'closevault_private.approved_owner'];
function snapshot(name) {
  const data = Object.fromEntries(tables.map(table => {
    const rows = sql(name, run, `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${table} t`);
    return [table, { count: JSON.parse(rows).length, sha256: sha256(rows) }];
  }));
  const schema = sql(name, run, `select jsonb_build_object(
    'columns',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on (d.adrelid,d.adnum)=(a.attrelid,a.attnum) where a.attnum>0 and not a.attisdropped and c.relkind='r' and n.nspname in ('public','closevault_private')),
    'schemas',(select jsonb_agg(jsonb_build_array(n.nspname,n.nspowner::regrole::text,(select jsonb_agg(jsonb_build_array(a.grantee::regrole::text,a.grantor::regrole::text,a.privilege_type,a.is_grantable) order by a.grantee::regrole::text,a.privilege_type) from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a)) order by n.nspname) from pg_namespace n where n.nspname in ('public','closevault_private')),
    'tables',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,(select jsonb_agg(jsonb_build_array(a.grantee::regrole::text,a.grantor::regrole::text,a.privilege_type,a.is_grantable) order by a.grantee::regrole::text,a.privilege_type) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a)) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','closevault_private')),
    'constraints',(select jsonb_agg(jsonb_build_array(c.conname,pg_get_constraintdef(c.oid),c.convalidated) order by c.conname,pg_get_constraintdef(c.oid)) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','closevault_private')),
    'functions',(select jsonb_agg(jsonb_build_array(p.proname,pg_get_functiondef(p.oid),(select jsonb_agg(jsonb_build_array(a.grantee::regrole::text,a.grantor::regrole::text,a.privilege_type,a.is_grantable) order by a.grantee::regrole::text,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','closevault_private') and p.prokind='f'),
    'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','closevault_private')),
    'indexes',(select jsonb_agg(to_jsonb(i) order by schemaname,indexname) from pg_indexes i where schemaname in ('public','closevault_private')),
    'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','closevault_private'))
  )`);
  const details = JSON.parse(schema);
  return { data, schemaSha256: sha256(schema), schemaComponents: Object.fromEntries(Object.entries(details).map(([key,value]) => [key,sha256(JSON.stringify(value))])), security: { tables: details.tables, functions: details.functions.map(([name, _definition, acl]) => [name,acl]) } };
}
async function provision(name) {
    const password = randomBytes(32).toString('hex');
    docker(['create', '--name', name, '--network', run, '--label', `com.closevault.backup=${run}`, '--memory', '768m', '--tmpfs', '/var/lib/postgresql/data:rw,size=536870912', '--env-file', '/dev/stdin', image, 'postgres', '-D', '/var/lib/postgresql/data', '-c', 'listen_addresses=*'], `POSTGRES_USER=supabase_admin\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_HOST=/var/run/postgresql\nPGDATA=/var/lib/postgresql/data\n`);
    if (!created.includes(name)) created.push(name); verifyContainer(name, run); docker(['start', name]);
    let ready = false;
    for (let i = 0; i < 60; i++) { try { ready = docker(['exec', name, 'pg_isready', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres']).toString().includes('accepting connections'); } catch { /* no credential-bearing diagnostics */ } if (ready) break; await new Promise(resolve => setTimeout(resolve, 1000)); }
    assert.ok(ready, 'Disposable database readiness'); verifyContainer(name, run);
    // Auth dependency scaffold only, NOT a dump/recovery of the Supabase Auth service.
    sql(name, run, `create schema if not exists auth; create table if not exists auth.users(id uuid primary key);
      create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create role cv_backup nologin bypassrls;`);
}
try {
  report.tools.node = process.version; report.tools.age = ageVersion();
  report.tools.imageDigest = docker(['image', 'inspect', '--format', '{{.Id}}', image]).toString().trim();
  docker(['network', 'create', '--internal', '--label', `com.closevault.backup=${run}`, run]); networkCreated = true;
  for (const name of [source, target]) await provision(name);
  report.tools.server = sql(source, run, 'show server_version');
  report.tools.pgDump = docker(['exec', source, 'pg_dump', '--version']).toString().trim();
  report.tools.pgRestore = docker(['exec', target, 'pg_restore', '--version']).toString().trim();
  assert.match(report.tools.server, /^17\./); assert.match(report.tools.pgDump, /17\./); assert.match(report.tools.pgRestore, /17\./);
  const migrations = {};
  for (const file of ['20261010202459_secure_foundation.sql','20261010202601_foundation_commands.sql','20261010202607_owner_status.sql']) {
    const bytes = await readFile(`supabase/migrations/${file}`); migrations[file] = sha256(bytes); sql(source, run, bytes);
  }
  for (const file of ['foundation.test.sql','owner-status.test.sql']) {
    const tap = sql(source, run, await readFile(`supabase/tests/${file}`));
    assert.equal(tap.split('\n').filter(l => /^not ok\b/.test(l)).length, 0);
    const count = tap.split('\n').filter(l => /^ok\b/.test(l)).length;
    assert.equal(count, file === 'foundation.test.sql' ? 1431 : 18); pass(`${file}: ${count} assertions`);
  }
  sql(source, run, `insert into auth.users(id) values('70000000-0000-4000-8000-000000000001'),('70000000-0000-4000-8000-000000000002');
    insert into closevault_private.approved_owner(user_id) values('70000000-0000-4000-8000-000000000001');`);
  const createQuery = `select public.cv_create_lead('71000000-0000-4000-8000-000000000001','Fictional Restore Buyer',p_initial_summary=>'Fictional history',p_initial_action=>'Review fictional requirements',p_initial_due_at=>'2026-11-01T09:00:00+05:30')`;
  const first = JSON.parse(ownerCommand(source, createQuery));
  ownerCommand(source, `select public.cv_create_lead('71000000-0000-4000-8000-000000000002','Fictional Second Buyer',p_initial_summary=>'Fictional inquiry',p_initial_action=>'Discuss fictional units',p_initial_due_at=>'2026-11-02T09:00:00+05:30')`);
  const editQuery = `select public.cv_edit_lead('71000000-0000-4000-8000-000000000003','${first.lead_id}',${first.lead_version},'{"source":"Fictional referral"}')`;
  const edited = JSON.parse(ownerCommand(source, editQuery));
  ownerCommand(source, `select public.cv_cancel_follow_up('71000000-0000-4000-8000-000000000004','${first.follow_up_id}',1,'Fictional rescheduling reason','Review fictional replacement','2026-11-03T09:00:00+05:30')`);
  const backupPassword = randomBytes(32).toString('hex');
  sql(source, run, `alter role cv_backup login password '${backupPassword}'; alter role cv_backup set default_transaction_read_only=on;
    grant usage on schema public,closevault_private to cv_backup; grant select on all tables in schema public,closevault_private to cv_backup;`);
  // Explicit SCRAM on loopback; otherwise an image's trust rule could make the
  // password test meaningless. Only this owned disposable source is changed.
  const hba = sql(source, run, 'show hba_file'); assert.match(hba, /^\/[A-Za-z0-9_./-]+$/);
  sql(source, run, `copy (select unnest(array['local all all trust','host all all 127.0.0.1/32 scram-sha-256'])) to '${hba}'`);
  sql(source, run, 'select pg_reload_conf()');
  assert.equal(sql(source, run, "select count(*) from pg_hba_file_rules where error is not null"), '0');
  report.stage = 'scram-negative-authentication';
  const failedDump = dumpSource(source, run, randomBytes(32).toString('hex')); failedDump.readable.resume(); await assert.rejects(failedDump.done);
  assert.equal(sql(source, run, "select bool_and(not has_table_privilege('cv_backup',c.oid,'INSERT,UPDATE,DELETE')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','closevault_private')"), 't');
  pass('SCRAM password denial and read-only scoped extraction role');
  const expected = snapshot(source);
  const recipient = await generateIdentity(identityFile, root);
  report.artifacts.backup = await encryptBackup({ file: backup, repository: root, recipient, metadata: { schema: 2, scope: 'public,closevault_private', sourceVersion: report.tools.server, dumpVersion: report.tools.pgDump, nodeVersion: process.version, ageVersion: report.tools.age, createdAt: new Date().toISOString(), migrations }, source: dumpSource(source, run, backupPassword) });
  const restoreInput = { file: backup, identity: identityFile, expected: report.artifacts.backup };
  await decryptBackup(restoreInput); pass('age streaming backup and full ciphertext/archive SHA-256 verification');
  // Negative variants contain ciphertext only, never plaintext archives.
  const encrypted = await readFile(backup), corrupt = Buffer.from(encrypted); corrupt[corrupt.length - 20] ^= 1;
  const corruptFile = join(directory, 'corrupt.age'), truncatedFile = join(directory, 'truncated.age'), wrongFile = join(directory, 'wrong-identity.txt');
  await writeFile(corruptFile, corrupt, { mode: 0o600, flag: 'wx' }); await writeFile(truncatedFile, encrypted.subarray(0, encrypted.length - 20), { mode: 0o600, flag: 'wx' });
  await generateIdentity(wrongFile, root);
  try {
    await assert.rejects(decryptBackup({ ...restoreInput, file: corruptFile }));
    await assert.rejects(decryptBackup({ ...restoreInput, file: truncatedFile }));
    await assert.rejects(decryptBackup({ ...restoreInput, identity: wrongFile }));
    await assert.rejects(decryptBackup({ ...restoreInput, identity: join(directory, 'missing-identity.txt') }));
  } finally { await Promise.all([corruptFile,truncatedFile,wrongFile].map(file => unlink(file))); }
  pass('corrupted/truncated age archives, wrong/missing identity fail before restore');
  report.stage = 'missing-auth-rollback';
  await assert.rejects(restoreFresh(target, run, source, restoreInput), error => error.emptyAfterRollback === true);
  assert.equal(docker(['ps','-a','--filter',`name=^/${target}$`,'--format','{{.Names}}']).toString().trim(), '');
  pass('missing Auth UUID dependency rolls back all CRM DDL/data and disposes failed destination');
  await provision(target);
  // Target bootstrap is independent: only two synthetic UUIDs, no source CRM rows.
  sql(target, run, `insert into auth.users(id) values('70000000-0000-4000-8000-000000000001'),('70000000-0000-4000-8000-000000000002');`);
  report.stage = 'restore-fresh-target'; await restoreFresh(target, run, source, restoreInput);
  report.stage = 'compare-restored-snapshot'; report.expected = expected; report.restored = snapshot(target);
  assert.deepEqual(report.restored, expected);
  pass('different fresh target: exact six-table row hashes, counts, UUIDs and schema fingerprint');
  assert.equal(sql(target, run, "select count(*) from public.leads l left join public.follow_ups f on (f.id,f.owner_id,f.lead_id)=(l.primary_follow_up_id,l.owner_id,l.id) where l.primary_follow_up_id is not null and f.id is null"), '0');
  assert.equal(sql(target, run, "select bool_and(convalidated) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','closevault_private')"), 't');
  pass('primary follow-up, replacement, receipt, intent and Auth foreign-key integrity');
  for (const table of tables.slice(0,5)) {
    assert.equal(ownerCommand(target, `select count(*) from ${table}`, '70000000-0000-4000-8000-000000000002'), '0');
    assert.equal(Number(ownerCommand(target, `select count(*) from ${table}`)), expected.data[table].count);
    assert.equal(sql(target, run, `select has_table_privilege('anon','${table}','SELECT')`), 'f');
    for (const operation of ['INSERT','UPDATE','DELETE']) assert.equal(sql(target, run, `select has_table_privilege('authenticated','${table}','${operation}')`), 'f');
  }
  for (const role of ['anon','authenticated']) assert.equal(sql(target, run, `select has_table_privilege('${role}','closevault_private.approved_owner','SELECT')`), 'f');
  assert.throws(() => sql(target, run, 'begin; set local role anon; select * from public.leads; rollback;'));
  assert.throws(() => sql(target, run, `begin; set local role anon; ${createQuery}; rollback;`));
  assert.throws(() => ownerCommand(target, createQuery, '70000000-0000-4000-8000-000000000002'));
  assert.throws(() => sql(target, run, `update closevault_private.approved_owner set user_id='70000000-0000-4000-8000-000000000002'`));
  pass('restored RLS, anonymous denial, nonowner denial, owner SELECT, no direct writes and immutable owner');
  const beforeReplay = snapshot(target);
  assert.deepEqual(JSON.parse(ownerCommand(target, createQuery)), first); assert.deepEqual(JSON.parse(ownerCommand(target, editQuery)), edited);
  assert.deepEqual(snapshot(target), beforeReplay); pass('restored create/edit receipts replay exact results with zero mutations');
  const fresh = JSON.parse(ownerCommand(target, `select public.cv_create_lead('71000000-0000-4000-8000-000000000005','Fictional post-restore Buyer')`));
  assert.ok(fresh.lead_id); assert.equal(Number(ownerCommand(target, 'select count(*) from public.leads')), 3);
  assert.equal(ownerCommand(target, 'select public.cv_owner_status()'), 't');
  pass('new authenticated RPC and owner-status function work after restore');
  await assert.rejects(restoreFresh(target, run, source, restoreInput)); pass('populated restore target refused without destructive fallback');
  report.verification = 'local-fictional-restore-verified'; report.artifacts.backup.status = report.verification;
} catch (error) { report.verification = 'failed'; if (error instanceof Error && error.message.startsWith('Owned Docker operation failed')) console.error(error.message); console.error(`STOP: local rehearsal failed (${report.stage ?? 'preparation'}); raw SQL, dump and credential diagnostics withheld.`); process.exitCode = 1; }
finally {
  await unlink(identityFile).catch(() => undefined);
  let cleanup = true;
  for (const name of created.reverse()) { try { if (!docker(['ps','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}']).toString().trim()) continue; verifyContainer(name, run); docker(['rm','-f',name]); } catch { cleanup = false; } }
  if (networkCreated) { try { const net = JSON.parse(docker(['network','inspect',run]).toString())[0]; assert.equal(net.Labels['com.closevault.backup'],run); assert.equal(net.Internal,true); docker(['network','rm',run]); } catch { cleanup=false; } }
  report.cleanup = cleanup ? 'owned-resources-removed' : 'manual-review-required'; report.disposableIdentity = 'removed-after-rehearsal';
  if (!cleanup) process.exitCode = 1;
  await writeFile(join(directory,'report.json'), JSON.stringify(report,null,2), { mode: 0o600, flag: 'wx' });
  console.log(`REPORT ${join(directory,'report.json')}`); console.log(`RESULT ${report.verification}; ${report.cleanup}; no hosted access`);
}
