import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { createHostedLeadRepository, createIsolatedLeadRepository, leadError } from '../lead-repository';
import type { CreateLeadCommand } from '@/data/contracts/database-commands';
const owner = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const commandId = '00000000-0000-4000-8000-000000000003';
const fixture = { id, owner_id: owner, full_name: 'Fictional Buyer', phone: '0771234567', email: 'SHARED@example.invalid', source: 'Fictional referral', stage: 'new', primary_follow_up_id: null, closure_reason: null, closed_at: null, archived_at: null, version: 1, created_at: '2026-10-12T00:00:00Z', updated_at: '2026-10-12T00:00:00Z' };
const command: CreateLeadCommand = { commandId, fullName: 'Fictional Buyer', phone: '+971501234567', email: 'test@example.invalid', source: 'Fictional referral', initialSummary: 'Fictional requirements', initialFollowUp: { action: 'Discuss requirements', dueAt: '2026-10-12T09:30' } };
const reply = (value: unknown, status = 200, count = Array.isArray(value) ? value.length : 1) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'content-range': `0-${count - 1}/${count}` } });
function setup(handler: (url: URL, init?: RequestInit) => Response | Promise<Response> = () => reply([])) {
  const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new URL(String(input)), init));
  let active = true;
  const authorize = jest.fn(async () => owner);
  const writable = createIsolatedLeadRepository({ url: 'http://localhost:3000', publishableKey: 'fictional-test-public-key', accessToken: async () => 'fictional-test-token', authorize, active: () => active, fetch: fetcher });
  const client = createClient<Database>('https://uxecsfrnmlbugkuhjfeu.supabase.co', 'sb_publishable_fictional_test_key', { accessToken: async () => 'fictional-test-token', global: { fetch: fetcher } });
  const hosted = createHostedLeadRepository(client, authorize, () => active);
  return { writable, hosted, fetcher, authorize, deny: () => { active = false; } };
}
describe('Supabase lead repository (mock transport, not database atomicity proof)', () => {
  test('maps owner rows and database pagination/search/filter/order', async () => {
    const s = setup(() => reply([fixture], 200, 26));
    expect(await s.hosted.list({ page: 1, search: 'example.invalid', stage: 'new', source: 'Fictional referral' })).toEqual({ leads: [fixture], total: 26 });
    const url = new URL(String(s.fetcher.mock.calls[0][0]));
    expect(url.searchParams.get('owner_id')).toBe(`eq.${owner}`); expect(url.searchParams.get('offset')).toBe('25'); expect(url.searchParams.get('limit')).toBe('25'); expect(url.searchParams.get('order')).toBe('created_at.desc,id.desc'); expect(url.searchParams.get('stage')).toBe('eq.new'); expect(url.searchParams.get('or')).toContain('email.ilike."%example.invalid%"');
  });
  test('empty result is genuinely empty, never fixtures', async () => expect(await setup().hosted.list({ page: 0, search: '' })).toEqual({ leads: [], total: 0 }));
  test('short capped duplicate pages continue at actual returned offset', async () => { const other = { ...fixture, id: commandId, phone: '+971501234567' }; const s = setup(url => reply(Number(url.searchParams.get('offset')) === 0 ? [other] : [fixture], 200, 2)); expect(await s.writable.duplicates('+94771234567', '')).toEqual([fixture]); expect(new URL(String(s.fetcher.mock.calls[1][0])).searchParams.get('offset')).toBe('1'); });
  test('missing exact count cannot certify absence of duplicates', async () => { const s = setup(() => new Response('[]', { headers: { 'content-type': 'application/json' } })); await expect(s.writable.createLead(command)).rejects.toMatchObject({ code: 'unavailable' }); expect(s.fetcher.mock.calls.every(c => !String(c[0]).includes('/rpc/'))).toBe(true); });
  test('empty capped page before total exhausted fails closed', async () => { const s = setup(() => reply([], 200, 2)); await expect(s.writable.duplicates(command.phone!, '')).rejects.toMatchObject({ code: 'unavailable' }); });
  test('changing duplicate scan count fails closed', async () => { let calls = 0; const s = setup(() => reply([{ ...fixture, id: calls === 0 ? id : commandId }], 200, ++calls === 1 ? 2 : 3)); await expect(s.writable.duplicates(command.phone!, '')).rejects.toMatchObject({ code: 'unavailable' }); });
  test('repeated rows across scan pages fail closed', async () => { const s = setup(() => reply([fixture], 200, 2)); await expect(s.writable.duplicates(command.phone!, '')).rejects.toMatchObject({ code: 'unavailable' }); });
  test('short list response cannot skip hidden records on next numbered page', async () => { const s = setup(() => reply([fixture], 200, 26)); await expect(s.hosted.list({ page: 0, search: '' })).rejects.toMatchObject({ code: 'unavailable' }); });
  test('hosted create/edit rejected before transport or authorization', async () => {
    const s = setup(); expect(s.hosted.writable).toBe(false);
    await expect(s.hosted.createLead(command, true)).rejects.toMatchObject({ code: 'read_only' });
    await expect(s.hosted.editLead({ commandId, leadId: id, expectedVersion: 1, changes: {} })).rejects.toMatchObject({ code: 'read_only' });
    expect(s.fetcher).not.toHaveBeenCalled(); expect(s.authorize).not.toHaveBeenCalled();
  });
  test.each(['https://uxecsfrnmlbugkuhjfeu.supabase.co', 'http://example.invalid', 'http://localhost.evil.invalid', 'http://user:password@localhost:3000'])('isolated factory denies non-isolated target %s', url => expect(() => createIsolatedLeadRepository({ url, publishableKey: 'fictional', accessToken: async () => 'fictional', authorize: async () => owner, active: () => true })).toThrow());
  test('invalid creation has no RPC/query side effects', async () => { const s = setup(); await expect(s.writable.createLead({ ...command, phone: '' })).rejects.toMatchObject({ code: 'invalid_command' }); expect(s.fetcher).not.toHaveBeenCalled(); });
  test('invalid edit cannot expose stages', async () => { const s = setup(); await expect(s.writable.editLead({ commandId, leadId: id, expectedVersion: 1, changes: { fullName: 'Fictional', phone: '' } })).rejects.toMatchObject({ code: 'invalid_command' }); expect(s.fetcher).not.toHaveBeenCalled(); });
  test('RPC payload uses supported fields, canonical contacts, UTC and stable retry UUID', async () => {
    const payloads: unknown[] = [];
    const s = setup((_url, init) => { payloads.push(JSON.parse(String(init?.body))); return reply({ lead_id: id, lead_version: 2, follow_up_id: commandId }); });
    await s.writable.createLead(command, true); await s.writable.createLead(command, true);
    expect(payloads[0]).toEqual({ p_command_id: commandId, p_full_name: command.fullName, p_phone: command.phone, p_email: command.email, p_source: command.source, p_initial_summary: command.initialSummary, p_initial_action: command.initialFollowUp?.action, p_initial_due_at: '2026-10-12T04:00:00.000Z' }); expect(payloads[1]).toEqual(payloads[0]);
  });
  test('edit maps full_name and version, never direct writes', async () => {
    const s = setup(() => reply({ lead_id: id, lead_version: 2 }));
    await s.writable.editLead({ commandId, leadId: id, expectedVersion: 1, changes: { fullName: 'Fictional Edit', phone: '0771234567', email: '', source: 'Referral' } }, true);
    expect(JSON.parse(String(s.fetcher.mock.calls[0][1]?.body))).toEqual({ p_command_id: commandId, p_lead_id: id, p_expected_version: 1, p_changes: { full_name: 'Fictional Edit', phone: '+94771234567', email: null, source: 'Referral' } }); expect(String(s.fetcher.mock.calls[0][0])).toContain('/rpc/cv_edit_lead');
  });
  test('duplicate matching covers legacy canonical phones and case-insensitive email and excludes current row', async () => {
    const s = setup(() => reply([fixture]));
    expect(await s.writable.duplicates('+94771234567', '')).toEqual([fixture]); expect(await s.writable.duplicates('+971501234567', ' shared@EXAMPLE.INVALID ')).toEqual([fixture]); expect(await s.writable.duplicates('+94771234567', '', id)).toEqual([]);
  });
  test('duplicate warnings require confirmation without rejecting legitimate shared contacts', async () => {
    const s = setup(url => url.pathname.includes('/rpc/') ? reply({ lead_id: id, lead_version: 2, follow_up_id: null }) : reply([{ ...fixture, phone: command.phone }]));
    await expect(s.writable.createLead(command)).rejects.toMatchObject({ code: 'duplicate_confirmation' }); expect(s.fetcher.mock.calls.every(c => !String(c[0]).includes('/rpc/'))).toBe(true); await expect(s.writable.createLead(command, true)).resolves.toMatchObject({ leadId: id });
  });
  test('version conflicts sanitize internal server errors', async () => { const s = setup(() => reply({ code: '40001', message: 'CV_VERSION_CONFLICT', details: 'private sql' }, 500)); await expect(s.writable.createLead(command, true)).rejects.toMatchObject({ code: 'version_conflict' }); });
  test('unrecognized server and transport failure preserve uncertain outcome', async () => { const s = setup(() => { throw new Error('sensitive connection details'); }); await expect(s.writable.createLead(command, true)).rejects.toMatchObject({ code: 'uncertain_outcome' }); expect(leadError(new Error('sensitive')).message).not.toContain('sensitive'); });
  test('invalid/nonowner authorization causes no data requests', async () => { const s = setup(); s.authorize.mockRejectedValue(new Error('private')); await expect(s.hosted.list({ page: 0, search: '' })).rejects.toMatchObject({ code: 'unavailable' }); expect(s.fetcher).not.toHaveBeenCalled(); });
  test('signed-out state causes no requests', async () => { const s = setup(); s.deny(); await expect(s.hosted.list({ page: 0, search: '' })).rejects.toMatchObject({ code: 'unauthorized' }); expect(s.fetcher).not.toHaveBeenCalled(); });
  test('late private responses after logout are rejected instead of becoming cache data', async () => { let release!: () => void; const wait = new Promise<void>(r => { release = r; }); const s = setup(async () => { await wait; return reply([fixture]); }); const pending = s.hosted.list({ page: 0, search: '' }); await Promise.resolve(); await Promise.resolve(); s.deny(); release(); await expect(pending).rejects.toMatchObject({ code: 'unauthorized' }); });
  test('wrong-owner rows fail closed', async () => { const s = setup(() => reply([{ ...fixture, owner_id: commandId }])); await expect(s.hosted.list({ page: 0, search: '' })).rejects.toMatchObject({ code: 'unauthorized' }); });
  test('detail reads supported history without inventing missing contact fields', async () => { const s = setup(url => reply(url.pathname.endsWith('/leads') ? { ...fixture, phone: null, source: null } : [])); const detail = await s.hosted.detail(id); expect(detail.lead.phone).toBeNull(); expect(detail.followUps).toEqual([]); expect(detail.activities).toEqual([]); });
  test('missing lead produces safe not-found state', async () => { const s = setup(() => reply(null)); await expect(s.hosted.detail(id)).rejects.toMatchObject({ code: 'not_found' }); });
});
