// Executes only inside the disposable internal Docker network.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire, Module } from 'node:module';
const config = JSON.parse(readFileSync(0, 'utf8'));
const require = createRequire(import.meta.url);
const { Client } = createRequire('/usr/src/app/package.json')('pg');
const { createClient, processLock } = require('@supabase/supabase-js');
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'react-native') return { Platform: { OS: 'node' } };
  if (name === 'expo-secure-store') return {};
  if (name === '@/domain/authentication') return require('./authentication.js');
  if (name === '@/domain/lead-persistence') return require('./lead-persistence.js');
  if (name === '@/domain/daily-follow-ups') return require('./daily-follow-ups.js');
  if (name === '@/domain/lead-save-recovery') return require('./lead-save-recovery-domain.js');
  if (name === './supabase/lead-repository') return require('./lead-repository.js');
  return originalLoad.call(this, name, ...args);
};
const { AuthController, canAccessPrivate } = require('./authentication.js');
const { createAuthGateway } = require('./auth-gateway.js');
const db = new Client({ connectionString: config.adminDatabase });
let passed = 0; const failures = []; const clients = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch { failures.push(name); console.log(`FAIL ${name}`); }
}
function jwt(claims) {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${head}.${body}.${createHmac('sha256', config.jwtSecret).update(`${head}.${body}`).digest('base64url')}`;
}
const epoch = () => Math.floor(Date.now() / 1000);
const anon = jwt({ role: 'anon', iss: 'supabase', iat: epoch(), exp: epoch() + 3600 });
const service = jwt({ role: 'service_role', iss: 'supabase', iat: epoch(), exp: epoch() + 3600 });
const errorIdentifiers = new Set(['invalid_credentials', 'signup_disabled', 'refresh_token_not_found', '42501', '22023', '22007', '40001', 'P0001', 'PGRST301', 'PGRST303', 'PGRST205', 'PGRST202']);
function assertError(response, status, identifier, domainIdentifier) {
  assert.equal(response.ok, false);
  assert.equal(response.status, status);
  assert.ok(errorIdentifiers.has(identifier));
  assert.equal(response.data?.error_code ?? response.data?.code, identifier);
  if (domainIdentifier !== undefined) assert.equal(response.data?.message, domainIdentifier);
}
function assertRefreshError(error) {
  assert.ok(error);
  assert.equal(error.status, 400);
  assert.equal(error.code, 'refresh_token_not_found');
}
async function request(kind, path, token, body, method = body === undefined ? 'GET' : 'POST') {
  const base = kind === 'auth' ? 'http://auth:9999' : 'http://rest:3000';
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  const raw = await response.text(); let data; try { data = JSON.parse(raw); } catch { data = null; }
  if (!response.ok) {
    const code = data?.error_code ?? data?.code;
    console.log(`DENIAL HTTP ${response.status} identifier ${errorIdentifiers.has(code) || /^(?:PGRST\d{3}|\d{5})$/.test(code ?? '') ? code : 'unrecognized'}`);
  }
  return { status: response.status, ok: response.ok, data };
}
const rpc = (name, token, args = {}) => request('rest', `/rpc/${name}`, token, args);
const login = email => request('auth', '/token?grant_type=password', anon, { email, password: config.fixturePassword });
const query = async (sql, parameters = []) => (await db.query(sql, parameters)).rows;
async function snapshot() {
  const result = {};
  for (const table of ['leads', 'follow_ups', 'activities', 'command_receipts', 'reminder_intents']) result[table] = await query(`select * from public.${table} order by ${table === 'command_receipts' ? 'command_id' : 'id'}`);
  return result;
}
function storage() {
  const values = new Map();
  return { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); }, assertHealthy() {} };
}
function sdk(store = storage(), intercept, authHost = 'auth') {
  const client = createClient('http://transport.invalid', anon, { auth: { storage: store, storageKey: 'closevault.auth.session', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, lock: processLock }, global: { fetch: async (input, init) => {
    assert.ok(authHost === 'auth' || authHost === 'authshort');
    const url = String(input).replace('http://transport.invalid/auth/v1', `http://${authHost}:9999`).replace('http://transport.invalid/rest/v1', 'http://rest:3000');
    assert.ok(url.startsWith(`http://${authHost}:9999/`) || url.startsWith('http://rest:3000/'));
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
    if (intercept) await intercept(url);
    return response;
  } } }); clients.push(client); return client;
}
async function waitFor(condition) {
  for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Bounded condition timeout');
}
let owner, other, ownerSession, otherSession, lead, leadVersion, followUp, extra;
try {
  await db.connect();
  for (const [key, email] of [['owner', 'owner@example.invalid'], ['other', 'other@example.invalid']]) {
    const result = await request('auth', '/admin/users', service, { email, password: config.fixturePassword, email_confirm: true });
    assert.ok(result.ok); assert.ok(result.data.id);
    if (key === 'owner') owner = result.data.id; else other = result.data.id;
  }
  await query('insert into closevault_private.approved_owner (user_id) values ($1)', [owner]);
  await test('real Auth owner password sign-in', async () => { const r = await login('owner@example.invalid'); assert.ok(r.ok); ownerSession = r.data; assert.equal(r.data.user.id, owner); });
  await test('real Auth nonowner password sign-in', async () => { const r = await login('other@example.invalid'); assert.ok(r.ok); otherSession = r.data; assert.equal(r.data.user.id, other); });
  await test('invalid password rejected', async () => assertError(await request('auth', '/token?grant_type=password', anon, { email: 'owner@example.invalid', password: 'fictional-invalid-password' }), 400, 'invalid_credentials'));
  await test('nonexistent identity rejected', async () => assertError(await login('absent@example.invalid'), 400, 'invalid_credentials'));
  await test('public signup disabled with no new identity', async () => {
    const before = await query('select id from auth.users order by id');
    assertError(await request('auth', '/signup', anon, { email: 'signup@example.invalid', password: config.fixturePassword }), 422, 'signup_disabled');
    assert.deepEqual(await query('select id from auth.users order by id'), before);
  });
  const token = ownerSession.access_token;
  await test('owner-status true for approved owner', async () => { const r = await rpc('cv_owner_status', token); assert.ok(r.ok); assert.equal(r.data, true); });
  await test('owner-status false for authenticated nonowner', async () => { const r = await rpc('cv_owner_status', otherSession.access_token); assert.ok(r.ok); assert.equal(r.data, false); });
  await test('anonymous owner-status denied', async () => assertError(await rpc('cv_owner_status', anon), 401, '42501'));
  for (const [name, bad] of [['malformed JWT', 'not-a-jwt'], ['invalid signature JWT', `${token.slice(0, token.lastIndexOf('.') + 1)}${'a'.repeat(43)}`], ['expired correctly signed JWT', jwt({ ...JSON.parse(Buffer.from(token.split('.')[1], 'base64url')), exp: epoch() - 60 })]]) {
    await test(`${name} rejected without mutation`, async () => { const before = await snapshot(); assertError(await rpc('cv_owner_status', bad), 401, name === 'expired correctly signed JWT' ? 'PGRST303' : 'PGRST301'); assert.deepEqual(await snapshot(), before); });
  }
  await test('missing Authorization denies CRM read', async () => assertError(await request('rest', '/leads?select=id'), 401, '42501'));
  const command = { p_command_id: randomUUID(), p_full_name: 'Fictional HTTP Lead', p_initial_action: 'Fictional next action', p_initial_due_at: '2030-01-01T04:30:00Z' };
  for (const [name, access] of [['nonowner', otherSession.access_token], ['anonymous', anon]]) {
    await test(`${name} command denial preserves all CRM tables`, async () => { const before = await snapshot(); assertError(await rpc('cv_create_lead', access, command), name === 'nonowner' ? 403 : 401, '42501', name === 'nonowner' ? 'CV_UNAUTHORIZED' : undefined); assert.deepEqual(await snapshot(), before); });
  }
  await test('authenticated create persists lead and initial follow-up', async () => { const r = await rpc('cv_create_lead', token, command); assert.ok(r.ok); lead = r.data.lead_id; leadVersion = r.data.lead_version; followUp = r.data.follow_up_id; assert.equal((await query('select id from public.leads where id=$1', [lead])).length, 1); });
  await test('authenticated edit persists versioned lead', async () => { const r = await rpc('cv_edit_lead', token, { p_command_id: randomUUID(), p_lead_id: lead, p_expected_version: leadVersion, p_changes: { full_name: 'Fictional HTTP Edited' } }); assert.ok(r.ok); assert.equal((await query('select full_name from public.leads where id=$1', [lead]))[0].full_name, 'Fictional HTTP Edited'); });
  await test('fresh owner HTTP session reads durable lead', async () => { const session = await login('owner@example.invalid'); assert.ok(session.ok); const r = await request('rest', `/leads?id=eq.${lead}&select=full_name`, session.data.access_token); assert.ok(r.ok); assert.equal(r.data[0].full_name, 'Fictional HTTP Edited'); });
  await test('nonowner RLS hides existing owner rows', async () => { const r = await request('rest', '/leads?select=id', otherSession.access_token); assert.ok(r.ok); assert.deepEqual(r.data, []); assert.equal((await query('select id from public.leads')).length, 1); });
  await test('all five populated CRM tables enforce nonowner RLS', async () => { for (const table of ['leads', 'follow_ups', 'activities', 'command_receipts', 'reminder_intents']) { assert.ok((await query(`select * from public.${table}`)).length > 0); const r = await request('rest', `/${table}?select=*`, otherSession.access_token); assert.ok(r.ok); assert.deepEqual(r.data, []); } });
  await test('anonymous cannot read any private CRM table', async () => { for (const table of ['leads', 'follow_ups', 'activities', 'command_receipts', 'reminder_intents']) assertError(await request('rest', `/${table}?select=*`, anon), 401, '42501'); });
  await test('nonowner edit command cannot modify owner lead', async () => { const before = await snapshot(); assertError(await rpc('cv_edit_lead', otherSession.access_token, { p_command_id: randomUUID(), p_lead_id: lead, p_expected_version: leadVersion + 1, p_changes: { full_name: 'Fictional unauthorized edit' } }), 403, '42501', 'CV_UNAUTHORIZED'); assert.deepEqual(await snapshot(), before); });
  await test('forged owner subject fails signature validation', async () => {
    const parts = otherSession.access_token.split('.'); const claims = JSON.parse(Buffer.from(parts[1], 'base64url')); claims.sub = owner;
    parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const before = await snapshot(); assertError(await rpc('cv_owner_status', parts.join('.')), 401, 'PGRST301'); assert.deepEqual(await snapshot(), before);
  });
  await test('nonowner cannot provision approved owner registry via HTTP', async () => { const before = await query('select * from closevault_private.approved_owner'); assertError(await request('rest', '/approved_owner', otherSession.access_token, { user_id: other }), 404, 'PGRST205'); assert.deepEqual(await query('select * from closevault_private.approved_owner'), before); });
  for (const method of ['POST', 'PATCH', 'DELETE']) await test(`direct ${method} denied without CRM mutation`, async () => { const before = await snapshot(); const r = await request('rest', `/leads?id=eq.${lead}`, token, method === 'DELETE' ? undefined : { full_name: 'Fictional forbidden write' }, method); assertError(r, 403, '42501'); assert.deepEqual(await snapshot(), before); });
  await test('release all CRM direct-write and anonymous-read boundaries', async () => {
    const before = await snapshot();
    for (const table of ['leads', 'follow_ups', 'activities', 'command_receipts', 'reminder_intents']) {
      const key = table === 'command_receipts' ? 'command_id' : 'id';
      assertError(await request('rest', `/${table}?select=${key}`, anon), 401, '42501');
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        const body = method === 'DELETE' ? undefined : table === 'leads' ? { full_name: 'Fictional denied' } : table === 'follow_ups' ? { title: 'Fictional denied' } : table === 'activities' ? { summary: 'Fictional denied' } : table === 'command_receipts' ? { command_type: 'forbidden' } : { action: 'cancel' };
        console.log(`CHECK direct ${method} ${table}`);
        assertError(await request('rest', `/${table}?${key}=eq.${lead}`, token, body, method), 403, '42501');
      }
    }
    assert.deepEqual(await snapshot(), before);
  });
  await test('release unsupported business RPCs are unavailable', async () => {
    const before = await snapshot();
    for (const name of ['cv_close_lead_lost', 'cv_complete_follow_up', 'cv_create_site_visit']) assertError(await rpc(name, token), 404, 'PGRST202');
    assert.deepEqual(await snapshot(), before);
  });
  await test('release anonymous and nonowner cancellation denied atomically', async () => {
    const before = await snapshot();
    const args = { p_command_id: randomUUID(), p_follow_up_id: followUp, p_expected_version: 1, p_reason: 'Fictional denied', p_next_action: 'Fictional replacement', p_due_at: '2030-01-03T04:30:00Z' };
    assertError(await rpc('cv_cancel_follow_up', anon, args), 401, '42501');
    assertError(await rpc('cv_cancel_follow_up', otherSession.access_token, args), 403, '42501', 'CV_UNAUTHORIZED');
    assert.deepEqual(await snapshot(), before);
  });
  extra = randomUUID();
  await query('insert into public.follow_ups (id,owner_id,lead_id,title,due_at) values ($1,$2,$3,$4,$5)', [extra, owner, lead, 'Fictional existing task', '2030-01-02T04:30:00Z']);
  const cancellation = { p_command_id: randomUUID(), p_follow_up_id: followUp, p_expected_version: 1, p_reason: 'Fictional change of plan', p_next_action: 'Fictional replacement action', p_due_at: '2030-01-03T04:30:00Z' };
  for (const [name, change] of [['missing reason', { p_reason: null }], ['blank action', { p_next_action: ' \t\n' }], ['missing date', { p_due_at: null }], ['invalid date', { p_due_at: 'not-a-date' }], ['version conflict', { p_expected_version: 99 }]]) {
    await test(`FU-CANCEL invalid ${name} fully atomic`, async () => { const before = await snapshot(); assertError(await rpc('cv_cancel_follow_up', token, { ...cancellation, ...change }), name === 'version conflict' ? 500 : 400, name === 'version conflict' ? '40001' : name === 'invalid date' ? '22007' : '22023', name === 'version conflict' ? 'CV_VERSION_CONFLICT' : name === 'invalid date' ? undefined : 'CV_INVALID_COMMAND'); assert.deepEqual(await snapshot(), before); });
  }
  let cancelled;
  await test('FU-CANCEL creates exactly one replacement despite existing task', async () => {
    const r = await rpc('cv_cancel_follow_up', token, cancellation); assert.ok(r.ok); cancelled = r.data;
    const rows = await query('select * from public.follow_ups where replaces_follow_up_id=$1', [followUp]); assert.equal(rows.length, 1); assert.equal(rows[0].id, r.data.replacement_id);
    const original = (await query('select * from public.follow_ups where id=$1', [followUp]))[0]; assert.equal(original.status, 'cancelled'); assert.equal(original.outcome, cancellation.p_reason);
    assert.equal((await query('select status from public.follow_ups where id=$1', [extra]))[0].status, 'upcoming');
    assert.equal((await query('select primary_follow_up_id from public.leads where id=$1', [lead]))[0].primary_follow_up_id, r.data.replacement_id);
  });
  await test('FU-CANCEL commits audit and reminder intents with CRM changes', async () => { assert.equal((await query("select id from public.activities where lead_id=$1 and kind='follow_up_cancelled'", [lead])).length, 1); const rows = await query('select * from public.reminder_intents where follow_up_id=any($1::uuid[])', [[followUp, cancelled.replacement_id]]); assert.ok(rows.length >= 2); });
  await test('FU-CANCEL identical replay creates no duplicate changes', async () => { const before = await snapshot(); const r = await rpc('cv_cancel_follow_up', token, cancellation); assert.ok(r.ok); assert.deepEqual(r.data, cancelled); assert.deepEqual(await snapshot(), before); });
  await test('FU-CANCEL conflicting command replay rejected atomically', async () => { const before = await snapshot(); assertError(await rpc('cv_cancel_follow_up', token, { ...cancellation, p_reason: 'Fictional conflicting reason' }), 400, '22023', 'CV_COMMAND_CONFLICT'); assert.deepEqual(await snapshot(), before); });
  await test('terminal task second cancellation rejected', async () => { const before = await snapshot(); assertError(await rpc('cv_cancel_follow_up', token, { ...cancellation, p_command_id: randomUUID() }), 500, '40001', 'CV_VERSION_CONFLICT');
    assertError(await rpc('cv_cancel_follow_up', token, { ...cancellation, p_command_id: randomUUID(), p_expected_version: 2 }), 400, '22023', 'CV_TERMINAL_FOLLOW_UP'); assert.deepEqual(await snapshot(), before); });
  await test('concurrent HTTP cancellation replay produces one replacement', async () => {
    const args = { ...cancellation, p_command_id: randomUUID(), p_follow_up_id: extra };
    const responses = await Promise.all([rpc('cv_cancel_follow_up', token, args), rpc('cv_cancel_follow_up', token, args)]);
    assert.ok(responses.every(r => r.ok)); assert.deepEqual(responses[0].data, responses[1].data);
    assert.equal((await query('select id from public.follow_ups where replaces_follow_up_id=$1', [extra])).length, 1);
  });
  await test('concurrent conflicting HTTP cancellations cannot create duplicates', async () => {
    const args = { ...cancellation, p_follow_up_id: cancelled.replacement_id };
    const responses = await Promise.all([rpc('cv_cancel_follow_up', token, { ...args, p_command_id: randomUUID() }), rpc('cv_cancel_follow_up', token, { ...args, p_command_id: randomUUID() })]);
    assert.equal(responses.filter(r => r.ok).length, 1);
    assertError(responses.find(r => !r.ok), 500, '40001', 'CV_VERSION_CONFLICT');
    assert.equal((await query('select id from public.follow_ups where replaces_follow_up_id=$1', [cancelled.replacement_id])).length, 1);
  });
  await test('actual HTTP COMMIT-time failure rolls back all CRM tables', async () => {
    // Controlled disposable fixture only; none of this SQL enters a migration.
    await query("create function closevault_private.phase5b_fail_commit() returns trigger language plpgsql as $$ begin raise exception 'PHASE5B_FIXTURE_COMMIT_FAILURE'; end $$; create constraint trigger phase5b_fail_commit after insert on public.command_receipts deferrable initially deferred for each row execute function closevault_private.phase5b_fail_commit()");
    try { const before = await snapshot(); const r = await rpc('cv_create_lead', token, { ...command, p_command_id: randomUUID() }); assertError(r, 400, 'P0001', 'PHASE5B_FIXTURE_COMMIT_FAILURE'); assert.deepEqual(await snapshot(), before);
      const active = (await query('select id from public.follow_ups where replaces_follow_up_id=$1', [cancelled.replacement_id]))[0].id;
      const cancellationFailure = await rpc('cv_cancel_follow_up', token, { ...cancellation, p_command_id: randomUUID(), p_follow_up_id: active });
      assertError(cancellationFailure, 400, 'P0001', 'PHASE5B_FIXTURE_COMMIT_FAILURE'); assert.deepEqual(await snapshot(), before);
    }
    finally { await query('drop trigger phase5b_fail_commit on public.command_receipts; drop function closevault_private.phase5b_fail_commit()'); }
  });
  await test('real SDK events and token refresh', async () => {
    const client = sdk(); const events = []; const subscription = client.auth.onAuthStateChange(event => { events.push(event); });
    await waitFor(() => events.includes('INITIAL_SESSION'));
    assert.equal((await client.auth.signInWithPassword({ email: 'owner@example.invalid', password: config.fixturePassword })).error, null);
    assert.equal((await client.auth.refreshSession()).error, null);
    assert.ok(events.includes('SIGNED_IN')); assert.ok(events.includes('TOKEN_REFRESHED'));
    const refreshedStore = storage(); const refreshedSession = (await client.auth.getSession()).data.session;
    await refreshedStore.setItem('closevault.auth.session', JSON.stringify(refreshedSession));
    const restoredClient = sdk(refreshedStore); assert.equal((await restoredClient.auth.getUser()).data.user.id, owner);
    const session = (await client.auth.getSession()).data.session;
    assert.equal((await client.auth.signOut({ scope: 'local' })).error, null); assert.ok(events.includes('SIGNED_OUT'));
    assertError(await request('auth', '/token?grant_type=refresh_token', anon, { refresh_token: session.refresh_token }), 400, 'refresh_token_not_found');
    assert.equal((await client.auth.signOut({ scope: 'local' })).error, null);
    subscription.data.subscription.unsubscribe();
  });
  await test('SDK proactive failed refresh preserves still-valid access session', async () => {
    const store = storage(); const client = sdk(store); const events = []; const subscription = client.auth.onAuthStateChange(event => { events.push(event); });
    assert.equal((await client.auth.signInWithPassword({ email: 'owner@example.invalid', password: config.fixturePassword })).error, null);
    const session = (await client.auth.getSession()).data.session;
    assert.ok((await request('auth', '/logout?scope=local', session.access_token, undefined, 'POST')).ok);
    assertRefreshError((await client.auth.refreshSession()).error); assert.equal(events.includes('SIGNED_OUT'), false);
    assert.ok((await client.auth.getSession()).data.session); await client.auth.signOut({ scope: 'local' }); subscription.data.subscription.unsubscribe();
  });
  await test('real Auth-issued token expires and failed reactive refresh signs out SDK', async () => {
    const store = storage(); const client = sdk(store, undefined, 'authshort'); const events = []; const subscription = client.auth.onAuthStateChange(event => { events.push(event); });
    const signedIn = await client.auth.signInWithPassword({ email: 'owner@example.invalid', password: config.fixturePassword }); assert.equal(signedIn.error, null);
    const session = signedIn.data.session; const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url'));
    console.log(`INFO short-lived Auth issued TTL: ${claims.exp - epoch()} seconds`);
    assert.ok(claims.exp - epoch() <= 10); assert.equal((await rpc('cv_owner_status', session.access_token)).data, true);
    assert.ok((await request('auth', '/logout?scope=local', session.access_token, undefined, 'POST')).ok);
    while (epoch() <= claims.exp) await new Promise(resolve => setTimeout(resolve, 200));
    console.log('INFO real token expiry reached');
    // PostgREST permits clock-skew tolerance; wait for actual server rejection,
    // not just the nominal exp claim, with a strict 40-second post-exp bound.
    let expired;
    do { expired = await rpc('cv_owner_status', session.access_token); if (expired.ok) await new Promise(resolve => setTimeout(resolve, 500)); } while (expired.ok && epoch() <= claims.exp + 40);
    console.log(`INFO actual expiry rejection: HTTP ${expired.status}, ${epoch() - claims.exp}s after exp`); assertError(expired, 401, 'PGRST303');
    assertRefreshError((await client.auth.refreshSession()).error); console.log(`INFO reactive refresh emitted SIGNED_OUT: ${events.includes('SIGNED_OUT')}`); assert.ok(events.includes('SIGNED_OUT'));
    assert.equal((await client.auth.getSession()).data.session, null); subscription.data.subscription.unsubscribe();
  });
  await test('server logout revokes refresh but existing JWT remains valid until expiry', async () => {
    const session = (await login('owner@example.invalid')).data;
    assert.ok((await request('auth', '/logout?scope=local', session.access_token, undefined, 'POST')).ok);
    assertError(await request('auth', '/token?grant_type=refresh_token', anon, { refresh_token: session.refresh_token }), 400, 'refresh_token_not_found');
    assert.equal((await rpc('cv_owner_status', session.access_token)).data, true);
  });
  await test('actual controller gateway owner authorization and fresh-client restoration', async () => {
    const store = storage(); const client = sdk(store); let clears = 0;
    const controller = new AuthController(createAuthGateway(client, store), () => { clears++; }); controller.start();
    await controller.signIn('owner@example.invalid', config.fixturePassword); assert.ok(canAccessPrivate(controller.getState())); controller.stop();
    const fresh = sdk(store); const restored = new AuthController(createAuthGateway(fresh, store), () => { clears++; });
    await restored.restore(); assert.ok(canAccessPrivate(restored.getState()));
    await restored.signOut(); assert.equal(canAccessPrivate(restored.getState()), false); assert.ok(clears > 0);
    const remount = new AuthController(createAuthGateway(fresh, store), () => {}); await remount.restore(); assert.equal(canAccessPrivate(remount.getState()), false);
    await remount.signIn('owner@example.invalid', config.fixturePassword); assert.ok(canAccessPrivate(remount.getState())); await remount.signOut(); restored.stop(); remount.stop();
  });
  await test('actual controller rejects valid nonowner session', async () => { const store = storage(); const controller = new AuthController(createAuthGateway(sdk(store), store), () => {}); await controller.signIn('other@example.invalid', config.fixturePassword); assert.equal(controller.getState().status, 'unauthorized'); await controller.signOut(); controller.stop(); });
  await test('real SDK SIGNED_OUT defeats in-flight real owner RPC response', async () => {
    let release; let reached = false; const barrier = new Promise(resolve => { release = resolve; }); const store = storage();
    const client = sdk(store, async url => { if (url.includes('/rpc/cv_owner_status')) { reached = true; await barrier; } });
    const controller = new AuthController(createAuthGateway(client, store), () => {}); controller.start();
    const signingIn = controller.signIn('owner@example.invalid', config.fixturePassword).catch(() => {});
    await waitFor(() => reached); await client.auth.signOut({ scope: 'local' }); assert.equal(canAccessPrivate(controller.getState()), false);
    release(); await signingIn; await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(canAccessPrivate(controller.getState()), false); controller.stop();
  });
  await test('recovery unavailable without approved redirect configuration', async () => { const store = storage(); const gateway = createAuthGateway(sdk(store), store); await assert.rejects(gateway.requestRecovery('owner@example.invalid')); });
  await (await import('./leads.test.mjs')).runLeadTests({ test, sdk, query, owner, other, password: config.fixturePassword, anon });
  await (await import('./recovery.test.mjs')).runRecoveryTests({ test, sdk, query, owner, other, password: config.fixturePassword, anon });
} catch { failures.push('fixture/bootstrap setup'); console.log('FAIL fixture/bootstrap setup (details withheld)'); }
finally {
  for (const client of clients) client.auth.stopAutoRefresh();
  await db.end();
  console.log(`HTTP/JWT RESULTS: ${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
}
