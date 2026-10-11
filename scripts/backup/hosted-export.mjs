// Export-only core. Importing this file NEVER connects. No restore/DDL/RPC commands.
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFile, lstat, open, link, unlink } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { encryptBackup, ageVersion, sha256, privateDestination, processStream } from './envelope.mjs';

export const project = 'uxecsfrnmlbugkuhjfeu';
export const host = `db.${project}.supabase.co`;
export const versions = ['20261010202459','20261010202601','20261010202607'];
export const tables = ['closevault_private.approved_owner','public.activities','public.command_receipts','public.follow_ups','public.leads','public.reminder_intents'];
export const configSchema = z.object({ project: z.literal(project), host: z.literal(host), port: z.literal(5432), database: z.literal('postgres'), user: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/), passfile: z.string(), rootCertificate: z.string(), clientBin: z.string(), recipient: z.string().regex(/^age1[0-9a-z]+$/), output: z.string() }).strict();
const migrationHashes = {
  '20261010202459_secure_foundation.sql': '36a6eb9412c21cbe92791a547c46165ddb41715167809ca9521f5c7fdf95d329',
  '20261010202601_foundation_commands.sql': '557de32fbc2ae2960ac12e95cd9f19d5e432b78552a1623bfbba1c9a19eeec39',
  '20261010202607_owner_status.sql': '6c8aa65032825f617da163e6ead42d7640791bda157ad3023f065d1ba532efbb',
};
export function splitPassLine(line) {
  const fields = ['']; let escape = false;
  for (const c of line) { if (escape) { fields[fields.length-1] += c; escape=false; } else if (c === '\\') escape=true; else if (c === ':') fields.push(''); else fields[fields.length-1] += c; }
  if (escape || fields.length !== 5) throw new Error('Invalid private password-file format.');
  return fields;
}
export async function validateConfig(input, repository) {
  const c = configSchema.parse(input);
  for (const p of [c.passfile,c.rootCertificate,c.clientBin,c.output]) if (!isAbsolute(p)) throw new Error('Absolute paths required.');
  for (const p of [c.passfile,c.rootCertificate]) {
    await privateDestination(p, repository); const s = await lstat(p);
    if (!s.isFile() || s.isSymbolicLink() || (s.mode & 0o777) !== 0o600 || s.uid !== process.getuid() || s.size>1024*1024) throw new Error('Private operator files must be owned bounded regular 0600 files.');
  }
  const content = await readFile(c.passfile, 'utf8');
  if (content.length > 16384) throw new Error('Oversized password file.');
  const lines = content.split(/\r?\n/).filter(l => l && !l.startsWith('#'));
  if (lines.length !== 1) throw new Error('Exactly one scoped password entry required.');
  const fields = splitPassLine(lines[0]);
  if (JSON.stringify(fields.slice(0,4)) !== JSON.stringify([c.host,'5432',c.database,c.user]) || !fields[4] || fields[4].includes('\0')) throw new Error('Password entry must match exact approved connection.');
  await privateDestination(c.output, repository);
  return c;
}
// Database catalogs only; no Auth-user rows, passwords, CRM records or RPC execution.
export const preflightSQL = `select jsonb_build_object(
 'database',current_database(),'version',current_setting('server_version'),
 'readOnly',current_setting('transaction_read_only')='on',
 'completeAccess',r.rolsuper or r.rolbypassrls,
 'broadRole',r.rolsuper or r.rolcreatedb or r.rolcreaterole or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','closevault_private') and has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cv_create_lead','cv_edit_lead','cv_cancel_follow_up') and has_function_privilege(current_user,p.oid,'EXECUTE')),
 'tables',(select jsonb_agg(jsonb_build_object('name',n.nspname||'.'||c.relname,'select',has_table_privilege(current_user,c.oid,'SELECT'),'rls',c.relrowsecurity) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ('public','closevault_private')),
 'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'schema',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where a.attnum>0 and not a.attisdropped and c.relkind='r' and n.nspname in ('public','closevault_private'))
) from pg_roles r where r.rolname=current_user;`;
export const dumpArgs = ['--no-password','--format=custom','--schema=public','--schema=closevault_private','--strict-names','--no-owner','--no-publications','--no-subscriptions','--lock-wait-timeout=10s'];
export function nativeEnvironment(c) {
  // Do NOT inherit PGPASSWORD, PGSERVICE, PGHOSTADDR, .env or caller PGOPTIONS.
  return { PATH: process.env.PATH, LANG: 'C', PGHOST:c.host, PGPORT:'5432', PGDATABASE:c.database, PGUSER:c.user, PGPASSFILE:c.passfile, PGSSLMODE:'verify-full', PGSSLROOTCERT:c.rootCertificate, PGCONNECT_TIMEOUT:'10', PGAPPNAME:'closevault-backup-export', PGOPTIONS:'-c search_path=pg_catalog -c default_transaction_read_only=on -c row_security=off -c statement_timeout=120000' };
}
export async function collect(p) {
  let text=''; const capture=(async () => { for await (const chunk of p.readable) { text += chunk.toString(); if (Buffer.byteLength(text)>1024*1024) { p.kill(); throw new Error('Oversized metadata.'); } } })();
  await Promise.all([capture,p.done]); return text.trim();
}
export function nativeTransport(c) {
  const env=nativeEnvironment(c);
  return transportFromStart((command,args,input)=>processStream(join(c.clientBin,command),args,input,{env}));
}
export function transportFromStart(start) {
  return {
    async versions() { return { psql: await collect(start('psql',['--version'])), pgDump: await collect(start('pg_dump',['--version'])) }; },
    async preflight() { return JSON.parse(await collect(start('psql',['-X','-qAt','--no-password','-v','ON_ERROR_STOP=1'],preflightSQL))); },
    dump() { return start('pg_dump',dumpArgs); },
  };
}
export async function writeManifest(file, value, repository) {
  const target=await privateDestination(file,repository), partial=`${target}.${randomBytes(8).toString('hex')}.partial`; let handle;
  try { handle=await open(partial,'wx',0o600); await handle.writeFile(JSON.stringify(value,null,2)); await handle.sync(); await handle.close(); handle=undefined; await link(partial,target); const d=await open(dirname(target),'r'); try {await d.sync();} finally {await d.close();} }
  finally {await handle?.close();await unlink(partial).catch(()=>undefined);}
}
export async function runExport(input, repository, transport) {
  try {
    const c=await validateConfig(input,repository), t=transport ?? nativeTransport(c);
    const clients=await t.versions(); assert.match(clients.psql,/PostgreSQL\) 17\./); assert.match(clients.pgDump,/PostgreSQL\) 17\./);
    const state=await t.preflight(); assert.equal(state.database,'postgres'); assert.match(state.version,/^17\./); assert.equal(state.readOnly,true); assert.equal(state.completeAccess,true);
    const preflightSnapshot=JSON.stringify(state);
    assert.deepEqual(state.tables.map(t=>t.name),tables); assert.ok(state.tables.every(t=>t.select&&t.rls)); assert.deepEqual(state.migrations,versions);
    for (const [file,hash] of Object.entries(migrationHashes)) assert.equal(sha256(await readFile(join(repository,'supabase/migrations',file))),hash);
    const metadata={schema:2,scope:'public,closevault_private',sourceVersion:state.version,dumpVersion:clients.pgDump,nodeVersion:process.version,ageVersion:ageVersion(),createdAt:new Date().toISOString(),migrations:migrationHashes,sourceProject:project,sourceKind:transport?'isolated-fixture':'hosted-owner-operated',recipientFingerprint:sha256(c.recipient),sourceSchemaFingerprint:sha256(JSON.stringify(state.schema)),migrationVersions:versions};
    const backup=await encryptBackup({file:c.output,repository,recipient:c.recipient,metadata,source:t.dump()});
    // Catalog metadata must not silently describe an incompatible post-dump state.
    assert.equal(JSON.stringify(await t.preflight()),preflightSnapshot);
    const manifest={schema:1,backupFile:c.output,source:{project,host:c.host,database:c.database,sslmode:'verify-full',credentialAssessment:state.broadRole?'broad-credential-export-only-tool':'CRM-select-only-bypassRLS-role-not-universally-unprivileged'},backup,verification:'encrypted-export-not-decryption-or-restore-verified',provenance:'unsigned-checksums-only'};
    await writeManifest(`${c.output}.manifest.json`,manifest,repository); return manifest;
  } catch { throw new Error('Export failed or incomplete; no verified recovery claimed. Raw connection/database diagnostics withheld.'); }
}
