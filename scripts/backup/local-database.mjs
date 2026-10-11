// Docker-only capability boundary. No URL, connection-string or hosted CLI input.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { decryptBackup, processStream } from './envelope.mjs';

export const image = 'public.ecr.aws/supabase/postgres:17.6.1.167';
export function docker(args, input, maxBuffer = 64 * 1024 ** 2) {
  const result = spawnSync('docker', args, { input, maxBuffer, timeout: 120_000 });
  if (result.status !== 0 || result.error) {
    const reason = ['already exists', 'does not exist', 'permission denied', 'duplicate key', 'violates'].find(label => result.stderr?.toString().includes(label)) ?? 'unspecified';
    throw new Error(`Owned Docker operation failed (${args[0]}, ${reason}); raw diagnostics withheld.`);
  }
  return result.stdout;
}
export function verifyContainer(name, run) {
  assert.match(run, /^closevault-backup-[a-f0-9]{12}$/);
  assert.ok([`${run}-source`, `${run}-restore`].includes(name), 'Only the two owned disposable databases are permitted');
  const item = JSON.parse(docker(['inspect', '--format', '{{json .}}', name]).toString());
  assert.equal(item.Config.Labels['com.closevault.backup'], run); assert.equal(item.HostConfig.NetworkMode, run);
  assert.equal(item.HostConfig.Privileged, false);
  assert.equal(Object.keys(item.HostConfig.PortBindings ?? {}).length, 0);
  assert.equal(Object.values(item.NetworkSettings.Ports ?? {}).filter(Boolean).length, 0);
  assert.equal(item.Mounts.filter(m => m.Type !== 'tmpfs').length, 0);
  const network = JSON.parse(docker(['network', 'inspect', run]).toString())[0];
  assert.equal(network.Internal, true); assert.equal(network.Labels['com.closevault.backup'], run);
  return item;
}
export function sql(name, run, query) {
  verifyContainer(name, run);
  return docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], query).toString().trim();
}
export function dumpSource(name, run, password) {
  verifyContainer(name, run); assert.equal(name, `${run}-source`);
  // The disposable password travels only over stdin, never arguments or logs.
  return processStream('docker', ['exec', '-i', name, 'sh', '-c', 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec pg_dump --host=127.0.0.1 --username=cv_backup --dbname=postgres --no-password --format=custom --schema=public --schema=closevault_private --strict-names --no-owner --no-publications --no-subscriptions --lock-wait-timeout=10s'], `${password}\n`);
}
export async function restoreFresh(name, run, source, backup) {
  verifyContainer(name, run); assert.equal(name, `${run}-restore`); assert.notEqual(name, source);
  const existing = sql(name, run, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ('public','closevault_private')");
  assert.equal(existing, '0', 'Restore requires an empty owned target; no clean/reset/drop fallback');
  try {
  // Complete authentication/hash/framing pass before any target mutation.
  await decryptBackup(backup);
  // Supabase image defaults can otherwise add privileges absent from the archive.
  // Only this empty owned target is prepared; archive ACLs are NOT skipped.
  for (const scope of ['', ' in schema public']) {
    sql(name, run, `alter default privileges for role supabase_admin${scope} revoke all on tables from public,anon,authenticated,service_role,postgres;
      alter default privileges for role supabase_admin${scope} revoke all on functions from public,anon,authenticated,service_role,postgres;`);
  }
  const listing = processStream('docker', ['exec', '-i', name, 'pg_restore', '--list']);
  let toc = '';
  const capture = (async () => { for await (const chunk of listing.readable) { toc += chunk.toString(); if (toc.length > 1024 * 1024) { listing.kill(); throw new Error('Oversized archive listing.'); } } })();
  await Promise.all([decryptBackup({ ...backup, destination: listing }), capture]);
  // initdb already owns the empty public schema. Keep its ACL/comments and all
  // application objects; skip ONLY its CREATE SCHEMA entry, never DROP it.
  const entries = toc.split('\n');
  assert.equal(entries.filter(line => /^\d+; \d+ \d+ SCHEMA - public /.test(line)).length, 1);
  const list = entries.filter(line => !/^\d+; \d+ \d+ SCHEMA - public /.test(line)).join('\n');
  const file = '/var/lib/postgresql/data/cv-restore.list';
  docker(['exec', '-i', name, 'sh', '-c', `umask 077; tee ${file} >/dev/null`], list);
  const restore = processStream('docker', ['exec', '-i', name, 'pg_restore', `--use-list=${file}`, '--single-transaction', '--exit-on-error', '--no-owner', '--host=/var/run/postgresql', '--username=supabase_admin', '--dbname=postgres']);
  restore.readable.resume();
  await decryptBackup({ ...backup, destination: restore });
  docker(['exec', name, 'rm', '--', file]);
  }
  catch {
    // Never leave a failed restoration available, even if PostgreSQL rolled back.
    let emptyAfterRollback = false;
    try { emptyAfterRollback = sql(name, run, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','closevault_private')") === '0'; } catch { /* Removal is mandatory even if diagnostic query fails. */ }
    verifyContainer(name, run); docker(['rm', '-f', name]);
    const failure = new Error('Restore failed; owned destination invalidated and removed.');
    failure.emptyAfterRollback = emptyAfterRollback; throw failure;
  }
}
