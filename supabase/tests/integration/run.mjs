// Local-only disposable harness. Never accepts hosted URLs or existing resources.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statfsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const base = '43fe931195247b7b6682f0875704e09efb453d42';
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
execFileSync('git', ['merge-base', '--is-ancestor', base, 'HEAD']);
assert.equal(execFileSync('git', ['rev-parse', 'checkpoint/phase-5a-authentication'], { encoding: 'utf8' }).trim(), base, 'Preserved Phase 5A checkpoint must match');
const space = statfsSync(root); assert.ok(space.bavail * space.bsize > 2 * 1024 ** 3, 'At least 2 GiB free required');
const run = `closevault-phase5b-${randomBytes(5).toString('hex')}`;
const images = { db: 'public.ecr.aws/supabase/postgres:17.6.1.167', auth: 'public.ecr.aws/supabase/gotrue:v2.196.0', authshort: 'public.ecr.aws/supabase/gotrue:v2.196.0', rest: 'public.ecr.aws/supabase/postgrest:v16.2', runner: 'public.ecr.aws/supabase/postgres-meta:v0.99.0' };
const names = Object.fromEntries(Object.keys(images).map(key => [key, `${run}-${key}`]));
const created = []; let networkCreated = false;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 ** 2 });
  if (result.status !== 0) {
    const codes = [...result.stderr.matchAll(/(?:ERROR|FATAL):[^\n]*/g)].map(match => match[0].replace(/'[^']*'|"[^"]*"/g, '[redacted]'));
    const safe = result.stderr.replace(/postgres:\/\/[^\s]+/g, '[redacted]').replace(/[A-Za-z0-9_-]{48,}/g, '[redacted]').slice(0, 600);
    throw new Error(`Docker operation failed: ${args[0]}${codes.length ? `; ${codes.join('; ')}` : `; ${safe}`} (credential-bearing details withheld)`);
  }
  return result.stdout.trim();
}
const inspect = name => JSON.parse(docker(['inspect', '--format', '{{json .}}', name]));
function verify(name) {
  const item = inspect(name);
  assert.equal(item.Config.Labels['com.closevault.test'], run);
  assert.equal(item.HostConfig.NetworkMode, run);
  assert.equal(Object.keys(item.HostConfig.PortBindings ?? {}).length, 0);
  assert.equal(Object.keys(item.NetworkSettings.Ports ?? {}).filter(p => item.NetworkSettings.Ports[p]).length, 0);
  assert.equal(item.Mounts.filter(m => m.Type !== 'tmpfs').length, 0);
  assert.equal(item.HostConfig.Privileged, false);
  return item;
}
function create(key, env, command = []) {
  const options = ['create', '--name', names[key], '--network', run, '--network-alias', key, '--label', `com.closevault.test=${run}`, '--memory', key === 'db' ? '768m' : '512m'];
  if (Object.keys(env).length) options.push('--env-file', '/dev/stdin');
  if (key === 'db') options.push('--tmpfs', '/var/lib/postgresql/data:rw,size=536870912');
  if (key === 'runner') options.push('--tmpfs', '/work:rw,size=134217728', '--entrypoint', 'node');
  docker([...options, images[key], ...command], Object.entries(env).map(([k,v]) => `${k}=${v}`).join('\n'));
  created.push(names[key]); verify(names[key]); docker(['start', names[key]]); verify(names[key]);
}
const psql = sql => docker(['exec', '-i', names.db, 'psql', '-X', '-qAt', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql);
async function ready(operation, label) {
  for (let i = 0; i < 60; i++) { try { if (operation()) return; } catch { /* bounded readiness probe, never print logs */ } await new Promise(resolve => setTimeout(resolve, 1000)); }
  throw new Error(`${label} readiness failed; inspect only sanitized diagnostics`);
}
const dbPassword = randomBytes(32).toString('hex'); const authPassword = randomBytes(32).toString('hex'); const restPassword = randomBytes(32).toString('hex'); const jwtSecret = randomBytes(48).toString('hex');
try {
  for (const image of new Set(Object.values(images))) process.stdout.write(`IMAGE ${image} ${docker(['image', 'inspect', '--format', '{{.Id}}', image])}\n`); // no automatic pulls
  docker(['network', 'create', '--internal', '--label', `com.closevault.test=${run}`, run]); networkCreated = true;
  assert.equal(JSON.parse(docker(['network', 'inspect', run]))[0].Internal, true);
  create('db', { POSTGRES_USER: 'supabase_admin', POSTGRES_PASSWORD: dbPassword, POSTGRES_HOST: '/var/run/postgresql', PGDATA: '/var/lib/postgresql/data' }, ['postgres', '-D', '/var/lib/postgresql/data', '-c', 'listen_addresses=*']);
  await ready(() => docker(['exec', names.db, 'pg_isready', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'postgres']).includes('accepting connections'), 'PostgreSQL');
  process.stdout.write('READY isolated PostgreSQL\n');
  psql(`alter role supabase_admin login password '${dbPassword}'; alter role supabase_auth_admin login password '${authPassword}'; alter role authenticator login password '${restPassword}';`);
  create('runner', {}, ['-e', 'setInterval(()=>{},1000)']);
  const packages = ['@supabase', 'tslib', 'zod', 'iceberg-js'];
  const archive = execFileSync('tar', ['-cf', '-', ...packages.map(p => `node_modules/${p}`)], { maxBuffer: 64 * 1024 ** 2 });
  docker(['exec', '-i', names.runner, 'tar', '-xf', '-', '-C', '/work'], archive);
  const sources = {};
  for (const [file, target] of Object.entries({ 'src/domain/authentication.ts': 'authentication.js', 'src/data/supabase/auth-gateway.ts': 'auth-gateway.js', 'src/data/supabase/auth-config.ts': 'auth-config.js', 'src/data/supabase/auth-storage.ts': 'auth-storage.js' })) {
    const source = execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' });
    sources[target] = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  }
  sources['http.test.mjs'] = readFileSync('supabase/tests/integration/http.test.mjs', 'utf8');
  docker(['exec', '-i', names.runner, 'node', '-e', "const fs=require('fs');for(const [name,source]of Object.entries(JSON.parse(fs.readFileSync(0,'utf8'))))fs.writeFileSync('/work/'+name,source,{mode:0o444});"], JSON.stringify(sources));
  const authEnv = { GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: 'http://auth:9999', GOTRUE_SITE_URL: 'http://fictional.invalid', GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${authPassword}@db:5432/postgres`, GOTRUE_JWT_SECRET: jwtSecret, GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_DISABLE_SIGNUP: 'true', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: 'false', GOTRUE_MAILER_AUTOCONFIRM: 'true', GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true', GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: '0', GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '1000', LOG_LEVEL: 'error' };
  create('auth', authEnv);
  const probe = url => docker(['exec', names.runner, 'node', '-e', `fetch('${url}',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`]) === '';
  await ready(() => probe('http://auth:9999/health'), 'Auth');
  create('authshort', { ...authEnv, API_EXTERNAL_URL: 'http://authshort:9999', GOTRUE_JWT_EXP: '5' });
  await ready(() => probe('http://authshort:9999/health'), 'Short-lived Auth');
  const migrations = [
    ['20261010202459_secure_foundation.sql', '20261010000100_secure_foundation.sql'],
    ['20261010202601_foundation_commands.sql', '20261010000200_foundation_commands.sql'],
    ['20261010202607_owner_status.sql', '20261010181858_owner_status.sql'],
  ];
  for (const [file, preservedFile] of migrations) {
    const source = readFileSync(`supabase/migrations/${file}`);
    const preserved = execFileSync('git', ['show', `${base}:supabase/migrations/${preservedFile}`]);
    assert.deepEqual(source, preserved, `Migration bytes differ from preserved source: ${file}`);
    psql(source);
    process.stdout.write(`PASS migration ${file} SHA256 ${createHash('sha256').update(source).digest('hex')}\n`);
  }
  for (const file of ['foundation.test.sql', 'owner-status.test.sql']) {
    const tap = psql(execFileSync('git', ['show', `${base}:supabase/tests/${file}`], { encoding: 'utf8' }));
    const lines = tap.split('\n'); const failures = lines.filter(l => /^not ok\b/.test(l)); const passed = lines.filter(l => /^ok\b/.test(l)).length;
    assert.equal(failures.length, 0, `${file} assertions failed`); assert.ok(passed > 0); process.stdout.write(`PASS SQL ${file}: ${passed} assertions\n`);
  }
  create('rest', { PGRST_DB_URI: `postgres://authenticator:${restPassword}@db:5432/postgres`, PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: jwtSecret, PGRST_JWT_AUD: 'authenticated', PGRST_DB_CONFIG: 'false', PGRST_SERVER_PORT: '3000', PGRST_LOG_LEVEL: 'crit' });
  await ready(() => probe('http://rest:3000/'), 'PostgREST');
  for (const name of created) verify(name);
  const config = { jwtSecret, adminDatabase: `postgres://supabase_admin:${dbPassword}@db:5432/postgres`, fixturePassword: randomBytes(24).toString('hex') };
  process.stdout.write(`ISOLATION ${run}: internal network, 5 containers, zero published ports, tmpfs only\n`);
  const result = spawnSync('docker', ['exec', '-i', '-e', 'NODE_PATH=/work/node_modules', names.runner, 'node', '/work/http.test.mjs'], { input: JSON.stringify(config), encoding: 'utf8', maxBuffer: 1024 ** 2 });
  // Runner emits only fixed test labels/counts, never response bodies or secrets.
  process.stdout.write(result.stdout);
  if (result.status !== 0) throw new Error('HTTP integration assertions failed; sanitized labels above identify failures');
} catch (error) {
  process.stderr.write(`STOP: ${error instanceof Error ? error.message.replace(/postgres:\/\/[^\s]+/g, '[redacted]') : 'Integration failure'}\n`); process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  for (const name of created.reverse()) { try { verify(name); docker(['rm', '-f', name]); } catch { process.stderr.write(`Cleanup requires review for ${name}\n`); process.exitCode = 1; cleanupFailed = true; } }
  if (networkCreated) { try { const net=JSON.parse(docker(['network','inspect',run]))[0]; assert.equal(net.Labels['com.closevault.test'],run); docker(['network', 'rm', run]); } catch { process.stderr.write(`Network cleanup requires review for ${run}\n`); process.exitCode = 1; cleanupFailed = true; } }
  process.stdout.write(cleanupFailed ? 'STOP: disposable resource cleanup needs manual review.\n' : 'Disposable Phase 5B resources removed; unrelated resources untouched.\n');
}
