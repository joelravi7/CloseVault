// Isolated test adapter ONLY. No production CLI imports this module.
import assert from 'node:assert/strict';
import { readFile, writeFile, chmod, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { docker, verifyContainer, sql, restoreFresh } from './local-database.mjs';
import { runExport, host, project, versions, transportFromStart, nativeEnvironment, splitPassLine } from './hosted-export.mjs';
import { generateIdentity, decryptBackup, processStream } from './envelope.mjs';

export async function rehearseHosted({source,target,run,directory,root,password,provision,snapshot,pass,report,ownerCommand,createQuery,editQuery,first,edited}) {
  const key=join(directory,'fixture-tls.key'), ca=join(directory,'fixture-ca.crt'), passfile=join(directory,'fixture.pgpass'), identity=join(directory,'export-identity.txt');
  try {
    // Self-signed fixture trust root is confined to this owned source/client pair.
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',ca,'-days','1','-subj',`/CN=${host}`,'-addext',`subjectAltName=DNS:${host}`],{stdio:'ignore'});
    await chmod(key,0o600); await chmod(ca,0o600);
    await writeFile(passfile,`${host}:5432:postgres:cv_backup:${password}\n`,{mode:0o600,flag:'wx'});
    const recipient=await generateIdentity(identity,root);
    for (const [path,file] of [['/var/lib/postgresql/data/export.key',key],['/var/lib/postgresql/data/export.crt',ca]]) {
      verifyContainer(source,run); docker(['exec','-i',source,'sh','-c',`umask 077; tee ${path} >/dev/null`],await readFile(file));
      docker(['exec',source,'chown','postgres:postgres',path]); docker(['exec',source,'chmod','600',path]);
    }
    docker(['exec','-i',source,'sh','-c','umask 077; tee /var/lib/postgresql/data/client-root.crt >/dev/null'],await readFile(ca));
    docker(['exec','-i',source,'sh','-c','tee -a /etc/hosts >/dev/null'],`\n127.0.0.1 ${host}\n`);
    sql(source,run,"alter system set ssl_cert_file='/var/lib/postgresql/data/export.crt'");
    sql(source,run,"alter system set ssl_key_file='/var/lib/postgresql/data/export.key'");
    sql(source,run,'alter system set ssl=on'); sql(source,run,'select pg_reload_conf()');
    sql(source,run,`create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key);
      insert into supabase_migrations.schema_migrations values ${versions.map(v=>`('${v}')`).join(',')};
      grant usage on schema supabase_migrations to cv_backup; grant select on supabase_migrations.schema_migrations to cv_backup;`);
    const config={project,host,port:5432,database:'postgres',user:'cv_backup',passfile,rootCertificate:ca,clientBin:'/usr/bin',recipient,output:join(directory,'export-fixture.age')};
    const makeTransport=async (mode='normal')=>{
      const secret=splitPassLine((await readFile(passfile,'utf8')).trim())[4];
      docker(['exec','-i',source,'sh','-c','umask 077; tee /var/lib/postgresql/data/export.pgpass >/dev/null'],`${host}:5432:postgres:cv_backup:${secret}\n`);
      const env={...nativeEnvironment(config),PGPASSFILE:'/var/lib/postgresql/data/export.pgpass',PGSSLROOTCERT:'/var/lib/postgresql/data/client-root.crt'};
      const start=(command,args,input)=>{
        verifyContainer(source,run);
        if(mode==='partial'&&command==='pg_dump'&&!args.includes('--version'))return {readable:Readable.from((async function*(){yield 'PGDMP interrupted fictional stream';throw new Error('Disconnected');})()),done:Promise.resolve()};
        const p=processStream('docker',['exec','-i',...Object.entries(env).filter(([,v])=>v!==undefined).flatMap(([k,v])=>['--env',`${k}=${v}`]),source,command,...args],mode==='network'&&input?`select pg_sleep(5);\n${input}`:input);
        if(mode==='interrupt'&&command==='pg_dump'&&!args.includes('--version'))p.kill();
        if(mode==='network'&&input){
          const terminate=(async()=>{for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,50));if(sql(source,run,"select count(*) from pg_stat_activity where application_name='closevault-backup-export' and wait_event='PgSleep'")!=='0'){sql(source,run,"select pg_terminate_backend(pid) from pg_stat_activity where application_name='closevault-backup-export' and wait_event='PgSleep'");return;}}throw new Error('Fault injection did not reach active connection');})();
          const done=Promise.all([p.done,terminate]);done.catch(()=>undefined);return {...p,done};
        }
        return p;
      };
      return transportFromStart(start);
    };
    const state=await (await makeTransport()).preflight();assert.equal(state.readOnly,true);assert.equal(state.broadRole,false);
    pass('export interface: actual verify-full TLS, scoped passfile, read-only sessions and complete catalogs');
    const manifest=await runExport(config,root,await makeTransport());
    await decryptBackup({file:config.output,identity,expected:manifest.backup});
    report.hostedInterface={fixtureOnly:true,manifest:manifest,verification:'local-TLS-export-and-restore-only'};
    pass('export interface: valid age artifact, project/recipient/migration metadata and checksum verification');
    const rejected=async(mode,input={})=>{const output=join(directory,`rejected-${mode}.age`);await assert.rejects(runExport({...config,output,...input},root,await makeTransport(mode)));await assert.rejects(access(output));await assert.rejects(access(`${output}.manifest.json`));};
    await rejected('unexpected',{host:'unexpected.invalid'});
    await rejected('missing',{passfile:join(directory,'missing.pgpass')});
    await writeFile(passfile,`${host}:5432:postgres:cv_backup:fictional-wrong-password\n`);
    await rejected('wrong'); await writeFile(passfile,`${host}:5432:postgres:cv_backup:${password}\n`);
    docker(['exec','-i',source,'sh','-c','tee /var/lib/postgresql/data/client-root.crt >/dev/null'],'invalid fictional trust root');
    await rejected('tls');docker(['exec','-i',source,'sh','-c','tee /var/lib/postgresql/data/client-root.crt >/dev/null'],await readFile(ca));
    await rejected('network');await rejected('interrupt');await rejected('partial');
    pass('export interface: unexpected target, missing/wrong password, TLS trust failure, actual connection loss, interrupted dump and partial output rejected without publication');
    // An unrelated valid existing restore must never be overwritten.
    await assert.rejects(restoreFresh(target,run,source,{file:config.output,identity,expected:manifest.backup}));
    verifyContainer(target,run);docker(['rm','-f',target]);await provision(target);
    sql(target,run,"insert into auth.users(id) values('70000000-0000-4000-8000-000000000001'),('70000000-0000-4000-8000-000000000002')");
    await restoreFresh(target,run,source,{file:config.output,identity,expected:manifest.backup});
    assert.deepEqual(snapshot(target),snapshot(source));
    for(const table of ['public.leads','public.follow_ups','public.activities','public.command_receipts','public.reminder_intents']){
      assert.equal(ownerCommand(target,`select count(*) from ${table}`),ownerCommand(source,`select count(*) from ${table}`));
      assert.equal(ownerCommand(target,`select count(*) from ${table}`,'70000000-0000-4000-8000-000000000002'),'0');
      assert.equal(sql(target,run,`select has_table_privilege('anon','${table}','SELECT')`),'f');
      for(const op of ['INSERT','UPDATE','DELETE'])assert.equal(sql(target,run,`select has_table_privilege('authenticated','${table}','${op}')`),'f');
    }
    const before=snapshot(target);assert.deepEqual(JSON.parse(ownerCommand(target,createQuery)),first);assert.deepEqual(JSON.parse(ownerCommand(target,editQuery)),edited);assert.deepEqual(snapshot(target),before);
    assert.equal(ownerCommand(target,'select public.cv_owner_status()'),'t');
    assert.throws(()=>sql(target,run,'begin;set local role anon;select public.cv_owner_status();rollback;'));
    assert.throws(()=>ownerCommand(target,createQuery,'70000000-0000-4000-8000-000000000002'));
    pass('export interface: restored owner/nonowner/anonymous/direct-write boundaries, owner RPC and receipt replay');
    report.hostedInterface.verification='local-TLS-export-restored-data-and-security-match';
    pass('export interface: separate fresh destination preserves all rows, UUIDs, history, receipts, intents and security definitions');
  } finally {await Promise.all([key,ca,passfile,identity].map(f=>unlink(f).catch(()=>undefined)));}
}
