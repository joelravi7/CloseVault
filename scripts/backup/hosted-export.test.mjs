import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { generateIdentity, decryptBackup } from './envelope.mjs';
import { runExport, validateConfig, nativeEnvironment, project, host, tables, versions, splitPassLine, preflightSQL, dumpArgs } from './hosted-export.mjs';
async function fixture(test) {
  const dir=await mkdtemp(join(tmpdir(),'cv-export-test-'));await chmod(dir,0o700);
  try {
    const passfile=join(dir,'fixture.pgpass'), rootCertificate=join(dir,'fixture.crt'), identity=join(dir,'identity.txt');
    await writeFile(passfile,`${host}:5432:postgres:cv_backup:fictional-only\n`,{mode:0o600});await writeFile(rootCertificate,'fictional unit-test CA placeholder',{mode:0o600});
    const recipient=await generateIdentity(identity,process.cwd());
    const config={project,host,port:5432,database:'postgres',user:'cv_backup',passfile,rootCertificate,clientBin:'/usr/bin',recipient,output:join(dir,'fixture.age')};
    const state={database:'postgres',version:'17.6',readOnly:true,completeAccess:true,broadRole:false,tables:tables.map(name=>({name,select:true,rls:true})),migrations:versions,schema:[['fictional-column']]};
    let calls=0;
    const transport={async versions(){calls++;return {psql:'psql (PostgreSQL) 17.6',pgDump:'pg_dump (PostgreSQL) 17.6'};},async preflight(){calls++;return state;},dump(){calls++;return {readable:Readable.from(['PGDMP fictional unit-test archive']),done:Promise.resolve()};}};
    await test({dir,config,identity,state,transport,calls:()=>calls});
  }finally{await rm(dir,{recursive:true});}
}
test('export records approved identity/migrations/fingerprint without private material',()=>fixture(async({config,identity,transport})=>{
  const manifest=await runExport(config,process.cwd(),transport);
  assert.equal(manifest.backup.metadata.sourceProject,project);assert.equal(manifest.backup.metadata.recipientFingerprint.length,64);assert.deepEqual(manifest.backup.metadata.migrationVersions,versions);
  assert.equal(manifest.backup.metadata.sourceKind,'isolated-fixture');assert.equal(manifest.verification,'encrypted-export-not-decryption-or-restore-verified');assert.equal(manifest.provenance,'unsigned-checksums-only');assert.ok(!JSON.stringify(manifest).includes('fictional-only'));
  await decryptBackup({file:config.output,identity,expected:manifest.backup});
}));
for(const [name,change] of [['unexpected project',{project:'other'}],['unexpected host',{host:'127.0.0.1'}],['pooler',{port:6543}],['other database',{database:'other'}],['unsafe username',{user:'postgres options=unsafe'}],['embedded secret',{password:'fictional'}]])test(`${name} denied before transport`,()=>fixture(async({config,transport,calls})=>{await assert.rejects(runExport({...config,...change},process.cwd(),transport));assert.equal(calls(),0);await assert.rejects(access(config.output));}));
test('missing, wildcard, multiple and broad-permission password files denied',()=>fixture(async({config,transport,calls})=>{
  await assert.rejects(runExport({...config,passfile:join(join(config.passfile,'..'),'missing.pgpass')},process.cwd(),transport));
  for(const value of ['*:5432:postgres:cv_backup:fictional\n',`${host}:5432:postgres:cv_backup:fictional\n${host}:5432:postgres:cv_backup:second\n`]){await writeFile(config.passfile,value);await assert.rejects(runExport(config,process.cwd(),transport));}
  await writeFile(config.passfile,`${host}:5432:postgres:cv_backup:fictional\n`);await chmod(config.passfile,0o644);await assert.rejects(runExport(config,process.cwd(),transport));assert.equal(calls(),0);
}));
test('password escaping round trip and scoped validation',()=>fixture(async({config})=>{
  await writeFile(config.passfile,`${host}:5432:postgres:cv_backup:fictional\\:colon\\\\slash\n`);
  await validateConfig(config,process.cwd());assert.equal(splitPassLine('h:5432:d:u:fictional\\:colon\\\\slash')[4],'fictional:colon\\slash');
}));
for(const [name,mutate] of [['server major mismatch',s=>s.version='16.9'],['not read-only',s=>s.readOnly=false],['RLS filtering risk',s=>s.completeAccess=false],['missing table',s=>s.tables=s.tables.slice(1)],['missing SELECT',s=>s.tables[0].select=false],['missing RLS',s=>s.tables[0].rls=false],['migration mismatch',s=>s.migrations=['20261010000100']]])test(`${name} fails before dump`,()=>fixture(async({config,state,transport,calls})=>{mutate(state);await assert.rejects(runExport(config,process.cwd(),transport));assert.equal(calls(),2);await assert.rejects(access(config.output));}));
test('broad credentials are not described as read-only',()=>fixture(async({config,state,transport})=>{state.broadRole=true;const m=await runExport(config,process.cwd(),transport);assert.equal(m.source.credentialAssessment,'broad-credential-export-only-tool');}));
test('transport/network failure is sanitized and publishes no artifact',()=>fixture(async({dir,config,transport})=>{transport.preflight=async()=>{throw new Error('fictional-secret-bearing server diagnostics');};await assert.rejects(runExport(config,process.cwd(),transport),e=>!e.message.includes('secret-bearing'));assert.deepEqual((await readdir(dir)).sort(),['fixture.crt','fixture.pgpass','identity.txt']);}));
test('interrupted partial dump fails publication',()=>fixture(async({config,transport})=>{transport.dump=()=>({readable:Readable.from((async function*(){yield 'PGDMP partial';throw new Error('Interrupted network');})()),done:Promise.resolve()});await assert.rejects(runExport(config,process.cwd(),transport));await assert.rejects(access(config.output));await assert.rejects(access(`${config.output}.manifest.json`));}));
test('environment scrubs credentials/overrides and uses TLS/read-only options',()=>{
  const saved=process.env.PGPASSWORD;process.env.PGPASSWORD='fictional-test-only';
  try{const env=nativeEnvironment({host,passfile:'/private/fixture.pgpass',rootCertificate:'/private/fixture.crt',database:'postgres',user:'cv_backup'});assert.equal(env.PGPASSWORD,undefined);assert.equal(env.PGHOSTADDR,undefined);assert.equal(env.PGSERVICE,undefined);assert.equal(env.PGSSLMODE,'verify-full');assert.match(env.PGOPTIONS,/default_transaction_read_only=on/);assert.equal(env.PGPASSFILE,'/private/fixture.pgpass');}finally{if(saved===undefined)delete process.env.PGPASSWORD;else process.env.PGPASSWORD=saved;}
});
test('fixed export commands contain no mutation or restore capability',()=>{assert.ok(preflightSQL.startsWith('select '));assert.ok(!/\b(insert|update|delete|alter|create|drop|grant)\s/i.test(preflightSQL));assert.ok(dumpArgs.includes('--no-password'));assert.ok(!dumpArgs.includes('--enable-row-security'));});
test('observed catalog drift does not receive a completed manifest',()=>fixture(async({config,state,transport})=>{
  let n=0;transport.preflight=async()=>{if(n++)state.schema.push(['changed fictional schema']);return state;};
  await assert.rejects(runExport(config,process.cwd(),transport));await assert.rejects(access(`${config.output}.manifest.json`));
}));
for(const name of ['export-hosted.mjs','verify-export.mjs','prepare-passfile.mjs'])test(`${name} rejects missing operator arguments without connecting`,()=>{
  const result=spawnSync(process.execPath,[`scripts/backup/${name}`],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/STOP:/);assert.ok(!result.stderr.includes('AGE-SECRET-KEY'));
});
