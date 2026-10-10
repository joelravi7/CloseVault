// Real receipts and RPCs, fictional data, disposable network only. No payload logs.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createIsolatedLeadRepository } = require('./lead-repository.js');
const { createLeadSaveRecovery } = require('./lead-save-recovery.js');
const { createWebSessionStorage } = require('./auth-storage.js');
export async function runRecoveryTests({ test, sdk, owner, other, password, anon, query }) {
  const client = sdk(); await client.auth.signInWithPassword({ email: 'owner@example.invalid', password });
  const token = async () => (await client.auth.getSession()).data.session.access_token;
  const authorize = async () => { const u = await client.auth.getUser(); const s = await client.rpc('cv_owner_status'); assert.equal(u.data.user.id, owner); assert.equal(s.data, true); return owner; };
  const options = { url: 'http://rest:3000', publishableKey: anon, accessToken: token, authorize, active: () => true };
  const repo = createIsolatedLeadRepository(options);
  const operation = () => ({ kind: 'create', confirmed: true, command: { commandId: randomUUID(), fullName: 'Fictional Recovery Buyer', phone: '+971501234567', email: 'recovery@example.invalid', source: 'Fictional recovery test', initialSummary: 'Fictional inquiry', initialFollowUp: { action: 'Discuss fictional needs', dueAt: '2026-10-12T09:30' } } });
  const stores = () => { const data = new Map(); return { data, storage: () => createWebSessionStorage(() => ({ getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) })) }; };
  const create = (repository, storage, extra = {}) => createLeadSaveRecovery({ storage, owner, environment: options.url, repository, active: () => true, digest: async text => createHash('sha256').update(text).digest('hex'), refresh: async () => { await repo.list({ page: 0, search: '' }); }, ...extra });
  const count = async () => (await query('select count(*)::int as n from public.leads'))[0].n;
  const interrupted = () => createIsolatedLeadRepository({ ...options, fetch: async (input, init) => { const r = await fetch(input, init); if (new URL(input).pathname.startsWith('/rpc/cv_') && r.ok) throw new Error('Fictional lost response'); return r; } });
  let saved;
  await test('Recovery real successful create journals then clears after cache refresh', async () => { const store = stores(); saved = await create(repo, store.storage()).save(operation()); assert.equal(store.data.size, 0); assert.equal((await repo.receipt((await query(`select command_id from public.command_receipts where result->>'lead_id'='${saved.leadId}' and command_type='create_lead'`))[0].command_id)).result.lead_id, saved.leadId); });
  await test('Recovery committed create with lost response reconciles after browser refresh without replay', async () => { const store = stores(); const op = operation(); const before = await count(); await assert.rejects(create(interrupted(), store.storage()).save(op), e => e.code === 'uncertain_outcome'); assert.equal(await count(), before + 1); const restored = create(repo, store.storage()); await restored.load(); assert.equal(restored.state().pending.commandId, op.command.commandId); const outcome = await restored.reconcile(); assert.ok(outcome?.followUpId); assert.equal(await count(), before + 1); assert.equal(store.data.size, 0); });
  await test('Recovery committed edit with lost response matches real edit receipt', async () => { const store = stores(); const detail = await repo.detail(saved.leadId); const op = { kind: 'edit', confirmed: true, command: { commandId: randomUUID(), leadId: saved.leadId, expectedVersion: detail.lead.version, changes: { fullName: 'Fictional Recovered Edit', phone: '+447911123456', email: '', source: 'Fictional recovery test' } } }; await assert.rejects(create(interrupted(), store.storage()).save(op), e => e.code === 'uncertain_outcome'); const restored = create(repo, store.storage()); await restored.load(); assert.equal((await restored.reconcile()).leadId, saved.leadId); assert.equal((await repo.detail(saved.leadId)).lead.full_name, op.command.changes.fullName); assert.equal(store.data.size, 0); });
  await test('Recovery request never reached server keeps missing receipt uncertain', async () => { const store = stores(); const before = await count(); const unavailable = createIsolatedLeadRepository({ ...options, fetch: async () => { throw new Error('Fictional disconnected transport'); } }); const recovery = create(unavailable, store.storage()); await assert.rejects(recovery.save(operation()), e => e.code === 'uncertain_outcome'); const restored = create(repo, store.storage()); await restored.load(); assert.equal(await restored.reconcile(), null); assert.equal(restored.state().status, 'uncertain'); assert.equal(await count(), before); assert.equal(store.data.size, 1); });
  await test('Recovery exact user retry replays same UUID and request once on real server', async () => { const store = stores(); const op = operation(); const before = await count(); await assert.rejects(create(interrupted(), store.storage()).save(op)); const retry = create(repo, store.storage()); await retry.save(op); assert.equal(await count(), before + 1); assert.equal(store.data.size, 0); });
  await test('Recovery altered request under retained UUID is blocked before RPC', async () => { const store = stores(); const op = operation(); await assert.rejects(create(interrupted(), store.storage()).save(op)); const before = await count(); await assert.rejects(create(repo, store.storage()).save({ ...op, command: { ...op.command, fullName: 'Fictional changed retry' } })); assert.equal(await count(), before); assert.equal(store.data.size, 1); });
  await test('Recovery RLS denies another authenticated user receipt visibility', async () => { const otherClient = sdk(); await otherClient.auth.signInWithPassword({ email: 'other@example.invalid', password }); const nonowner = createIsolatedLeadRepository({ ...options, accessToken: async () => (await otherClient.auth.getSession()).data.session.access_token, authorize: async () => other }); const rows = await query(`select command_id from public.command_receipts where result->>'lead_id'='${saved.leadId}'`); assert.equal(await nonowner.receipt(rows[0].command_id), null); });
  await test('Recovery mismatched receipt identity cannot fabricate success or clear journal', async () => { const store = stores(); const op = operation(); await assert.rejects(create(interrupted(), store.storage()).save(op)); const malformed = { ...repo, receipt: async id => ({ ...await repo.receipt(id), command_type: 'edit_lead' }) }; const recovery = create(malformed, store.storage()); await recovery.load(); assert.equal(await recovery.reconcile(), null); assert.equal(recovery.state().status, 'blocked'); assert.equal(store.data.size, 1); });
  await test('Recovery hosted write guard prevents even journal creation', async () => { const store = stores(); const hosted = { ...repo, writable: false }; await assert.rejects(create(hosted, store.storage()).save(operation()), e => e.code === 'read_only'); assert.equal(store.data.size, 0); });
  await test('Recovery immutable snapshot matches real receipt after caller mutation during journal write', async () => {
    const store = stores(); const storage = store.storage(); const op = operation(); const originalId = op.command.commandId;
    const originalName = op.command.fullName; const originalAction = op.command.initialFollowUp.action;
    const set = storage.setItem;
    storage.setItem = async (key, value) => { op.command.commandId = randomUUID(); op.command.fullName = 'Changed fictional draft'; op.command.initialFollowUp.action = 'Changed fictional action'; await set(key, value); };
    const before = await count(); await assert.rejects(create(interrupted(), storage).save(op), e => e.code === 'uncertain_outcome');
    const receipt = await repo.receipt(originalId); assert.equal(receipt.request.name, originalName); assert.equal(receipt.request.action, originalAction);
    const restored = create(repo, store.storage()); await restored.load(); assert.equal(restored.state().pending.commandId, originalId);
    assert.equal((await restored.reconcile()).leadId, receipt.result.lead_id); assert.equal(await count(), before + 1); assert.equal(store.data.size, 0);
  });
  await test('Recovery late real receipt cannot publish or refresh after local session invalidation', async () => {
    const store = stores(); await assert.rejects(create(interrupted(), store.storage()).save(operation()));
    let active = true; let refreshes = 0; let staleUpdates = 0;
    const delayed = { ...repo, receipt: async id => { const value = await repo.receipt(id); active = false; return value; } };
    const recovery = create(delayed, store.storage(), { active: () => active, refresh: async () => { refreshes++; } });
    await recovery.load(); recovery.listen(() => { if (!active) staleUpdates++; });
    assert.equal(await recovery.reconcile(), null); assert.equal(staleUpdates, 0); assert.equal(refreshes, 0); assert.equal(store.data.size, 1);
  });
}
