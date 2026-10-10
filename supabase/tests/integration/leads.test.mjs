// Fictional records and real HTTP only inside the existing isolated Docker runner.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createIsolatedLeadRepository, createHostedLeadRepository, LeadFailure } = require('./lead-repository.js');
export async function runLeadTests({ test, sdk, query, owner, other, password, anon }) {
  const client = sdk(); const signed = await client.auth.signInWithPassword({ email: 'owner@example.invalid', password }); assert.equal(signed.error, null);
  let active = true;
  const authorize = async () => {
    const user = await client.auth.getUser(); const status = await client.rpc('cv_owner_status');
    if (user.error || user.data.user?.id !== owner || status.error || status.data !== true) throw new LeadFailure('unauthorized', 'Owner access denied.');
    return user.data.user.id;
  };
  const accessToken = async () => { const session = await client.auth.getSession(); assert.ok(session.data.session); return session.data.session.access_token; };
  const options = { url: 'http://rest:3000', publishableKey: anon, accessToken, authorize, active: () => active };
  const repository = createIsolatedLeadRepository(options);
  const hosted = createHostedLeadRepository(client, authorize, () => active);
  const make = (index = 0) => ({ commandId: randomUUID(), fullName: `Fictional Phase7 Buyer ${index}`, phone: '+971501234567', email: 'phase7@example.invalid', source: 'Phase7 fictional fixture', initialSummary: 'Fictional qualification: two bedrooms, fictional budget', initialFollowUp: { action: 'Discuss fictional requirements', dueAt: '2026-10-12T09:30' } });
  let command = make(), created, edited;
  const rows = async () => (await query('select id,version from public.leads order by id'));
  await test('Phase7 actual adapter creates lead, inquiry and primary follow-up atomically', async () => {
    created = await repository.createLead(command, true); const detail = await repository.detail(created.leadId);
    assert.equal(detail.lead.owner_id, owner); assert.equal(detail.lead.phone, '+971501234567'); assert.equal(detail.lead.primary_follow_up_id, created.followUpId); assert.equal(detail.followUps.length, 1); assert.equal(new Date(detail.followUps[0].due_at).toISOString(), '2026-10-12T04:00:00.000Z'); assert.ok(detail.activities.some(v => v.kind === 'initial_inquiry' && v.summary === command.initialSummary));
  });
  await test('Phase7 identical retry returns same lead without duplicate records', async () => { const before = await rows(); assert.deepEqual(await repository.createLead(command, true), created); assert.deepEqual(await rows(), before); });
  await test('Phase7 concurrent duplicate submissions create exactly one lead', async () => { const concurrent = make(100); const before = (await rows()).length; const result = await Promise.all([repository.createLead(concurrent, true), repository.createLead(concurrent, true)]); assert.deepEqual(result[0], result[1]); assert.equal((await rows()).length, before + 1); });
  await test('Phase7 missing required mobile rejected before CRM changes', async () => { const before = await rows(); await assert.rejects(repository.createLead({ ...make(), phone: '' }), e => e.code === 'invalid_command'); assert.deepEqual(await rows(), before); });
  await test('Phase7 invalid Colombo date rejected before CRM changes', async () => { const before = await rows(); const invalid = make(); invalid.initialFollowUp.dueAt = '2026-02-30T09:30'; await assert.rejects(repository.createLead(invalid), e => e.code === 'invalid_command'); assert.deepEqual(await rows(), before); });
  await test('Phase7 contact duplicate detected and allowed only after confirmation', async () => { const before = (await rows()).length; const duplicate = make(101); const matches = await repository.duplicates(duplicate.phone, duplicate.email); assert.ok(matches.some(v => v.id === created.leadId)); await assert.rejects(repository.createLead(duplicate), e => e.code === 'duplicate_confirmation'); assert.equal((await rows()).length, before); await repository.createLead(duplicate, true); assert.equal((await rows()).length, before + 1); });
  await test('Phase7 edit uses RPC optimistic version and retains follow-up', async () => { edited = { commandId: randomUUID(), leadId: created.leadId, expectedVersion: created.leadVersion, changes: { fullName: 'Fictional Phase7 Edited Buyer', phone: '+447911123456', email: 'Edited@Example.Invalid', source: 'Phase7 fictional fixture' } }; const result = await repository.editLead(edited, true); assert.ok(result.leadVersion > created.leadVersion); const detail = await repository.detail(created.leadId); assert.equal(detail.lead.phone, '+447911123456'); assert.equal(detail.lead.email, 'edited@example.invalid'); assert.equal(detail.lead.primary_follow_up_id, created.followUpId); assert.ok(detail.activities.some(v => v.kind === 'lead_edited')); });
  await test('Phase7 identical edit retry replays before stale version check', async () => { const before = await rows(); const result = await repository.editLead(edited, true); assert.equal(result.leadId, created.leadId); assert.deepEqual(await rows(), before); });
  await test('Phase7 stale version rejected with sanitized conflict and no changes', async () => { const before = await rows(); await assert.rejects(repository.editLead({ ...edited, commandId: randomUUID(), changes: { ...edited.changes, fullName: 'Fictional stale change' } }, true), e => e.code === 'version_conflict'); assert.deepEqual(await rows(), before); });
  await test('Phase7 reused command with different payload rejected', async () => { const before = await rows(); await assert.rejects(repository.createLead({ ...command, fullName: 'Fictional conflicting payload' }, true), e => e.code === 'command_conflict'); assert.deepEqual(await rows(), before); });
  await test('Phase7 paginated database search/filter and duplicate lookup beyond first page', async () => {
    for (let i = 0; i < 27; i++) await repository.createLead(make(i + 200), true);
    const first = await repository.list({ page: 0, search: 'Fictional Phase7', source: 'Phase7 fictional fixture', stage: 'new' }); const second = await repository.list({ page: 1, search: 'Fictional Phase7', source: 'Phase7 fictional fixture', stage: 'new' });
    assert.equal(first.leads.length, 25); assert.ok(second.leads.length > 0); assert.equal(first.total, 30); assert.equal(new Set([...first.leads, ...second.leads].map(v => v.id)).size, 30);
    assert.ok((await repository.duplicates('+447911123456', '')).some(v => v.id === created.leadId)); assert.ok(!(await repository.duplicates('+447911123456', '', created.leadId)).some(v => v.id === created.leadId));
    const emailMatches = await repository.list({ page: 0, search: 'edited@example.invalid' }); assert.equal(emailMatches.leads[0].id, created.leadId);
  });
  await test('Phase7 empty database filter never falls back to demo', async () => { const page = await repository.list({ page: 0, search: 'NoSuchFictionalPhase7Name' }); assert.deepEqual(page, { leads: [], total: 0 }); });
  await test('Phase7 actual short HTTP contact pages do not truncate duplicate detection', async () => {
    const capped = createIsolatedLeadRepository({ ...options, fetch: async (input, init) => { const url = new URL(input); if (url.pathname === '/leads') url.searchParams.set('limit', '1'); return fetch(url, init); } });
    const matches = await capped.duplicates('+447911123456', ''); assert.ok(matches.some(v => v.id === created.leadId));
  });
  await test('Phase7 actual incomplete HTTP scan blocks mutation rather than certifying no duplicate', async () => {
    const capped = createIsolatedLeadRepository({ ...options, fetch: async (input, init) => { const url = new URL(input); if (url.pathname === '/leads') url.searchParams.set('limit', '0'); return fetch(url, init); } });
    const before = await rows(); await assert.rejects(capped.createLead(make()), e => e.code === 'unavailable'); assert.deepEqual(await rows(), before);
  });
  await test('Phase7 lost real create response retains unknown outcome and idempotent retry', async () => {
    let lost = false; const uncertain = make(900); const before = (await rows()).length;
    const interrupted = createIsolatedLeadRepository({ ...options, fetch: async (input, init) => { const response = await fetch(input, init); if (!lost && new URL(input).pathname === '/rpc/cv_create_lead' && response.ok) { lost = true; throw new Error('Fictional lost response after actual commit'); } return response; } });
    await assert.rejects(interrupted.createLead(uncertain, true), e => e.code === 'uncertain_outcome'); assert.equal((await rows()).length, before + 1);
    const replay = await interrupted.createLead(uncertain, true); assert.equal((await rows()).length, before + 1); assert.equal((await repository.detail(replay.leadId)).lead.full_name, uncertain.fullName);
  });
  await test('Phase7 hosted adapter blocks create/edit despite valid owner session', async () => { const before = await rows(); await assert.rejects(hosted.createLead(make(), true), e => e.code === 'read_only'); await assert.rejects(hosted.editLead(edited, true), e => e.code === 'read_only'); assert.deepEqual(await rows(), before); });
  await test('Phase7 real nonowner authorization fails before repository read or write', async () => { const otherClient = sdk(); assert.equal((await otherClient.auth.signInWithPassword({ email: 'other@example.invalid', password })).error, null); const nonowner = createIsolatedLeadRepository({ ...options, accessToken: async () => (await otherClient.auth.getSession()).data.session.access_token, authorize: async () => { const user = await otherClient.auth.getUser(); assert.equal(user.data.user.id, other); const status = await otherClient.rpc('cv_owner_status'); if (status.data !== true) throw new LeadFailure('unauthorized', 'Owner denied.'); return other; } }); const before = await rows(); await assert.rejects(nonowner.list({ page: 0, search: '' }), e => e.code === 'unauthorized'); await assert.rejects(nonowner.createLead(make(), true), e => e.code === 'unauthorized'); assert.deepEqual(await rows(), before); });
  await test('Phase7 actual nonowner JWT denied by RLS even if client callback lies', async () => { const otherClient = sdk(); await otherClient.auth.signInWithPassword({ email: 'other@example.invalid', password }); const forbidden = createIsolatedLeadRepository({ ...options, accessToken: async () => (await otherClient.auth.getSession()).data.session.access_token, authorize: async () => other }); assert.deepEqual(await forbidden.list({ page: 0, search: '' }), { leads: [], total: 0 }); await assert.rejects(forbidden.createLead(make(), true), e => e.code === 'unauthorized'); });
  await test('Phase7 lost access blocks commands without changing persisted data', async () => { active = false; const before = await rows(); await assert.rejects(repository.list({ page: 0, search: '' }), e => e.code === 'unauthorized'); await assert.rejects(repository.createLead(make(), true), e => e.code === 'unauthorized'); assert.deepEqual(await rows(), before); active = true; });
}
