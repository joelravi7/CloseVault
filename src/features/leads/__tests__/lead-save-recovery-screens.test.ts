import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { PersistedLeadFormScreen, PersistedLeadListScreen, PersistedLeadDetailScreen, PersistedLeadEditScreen } from '../persisted-lead-screens';
import { executeLeadSubmission } from '../persisted-lead-hooks';
import { LeadRepositoryTestProvider } from '@/providers/lead-repository-provider';
import { createLeadSaveRecovery } from '@/data/lead-save-recovery';
import { createWebSessionStorage } from '@/data/supabase/auth-storage';
import { LeadFailure } from '@/data/supabase/lead-repository';
import type { LeadRepository } from '@/data/contracts/lead-repository';
import { receiptRequest, pendingLeadKey, type SaveOperation } from '@/domain/lead-save-recovery';
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000003' }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ state: { status: 'authenticated', userId: '00000000-0000-4000-8000-000000000001' }, controller: { signOut: jest.fn() }, demo: false }) }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View }));
const owner = '00000000-0000-4000-8000-000000000001', id = '00000000-0000-4000-8000-000000000002', commandId = '00000000-0000-4000-8000-000000000003', task = '00000000-0000-4000-8000-000000000004';
const op: SaveOperation = { kind: 'create', confirmed: false, command: { commandId, fullName: 'Fictional Buyer', phone: '+971501234567', email: '', source: 'Fictional', initialSummary: 'Fictional inquiry', initialFollowUp: { action: 'Discuss needs', dueAt: '2026-10-12T09:30' } } };
const { createHash } = jest.requireActual<{ createHash(a: string): { update(v: string): { digest(e: string): string } } }>('node:crypto');
const clients: QueryClient[] = [];
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { await cleanup(); for (const q of clients.splice(0)) q.clear(); });
function setup() {
  const values = new Map<string,string>(); const storage = createWebSessionStorage(() => ({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string,v: string) => { values.set(k,v); }, removeItem: (k: string) => { values.delete(k); } } as Storage));
  const raw: LeadRepository = { writable: true, list: jest.fn(async () => ({ leads: [], total: 0 })), detail: jest.fn(), duplicates: jest.fn(async () => []), createLead: jest.fn(async () => ({ leadId: id, leadVersion: 2, followUpId: task })), editLead: jest.fn(), receipt: jest.fn(async () => null) };
  const refresh = jest.fn(async () => undefined); const options = { storage, owner, environment: 'https://fictional.invalid', repository: raw, active: () => true, digest: async (v: string) => createHash('sha256').update(v).digest('hex'), refresh };
  const recovery = createLeadSaveRecovery(options); return { raw, values, refresh, options, repo: { ...raw, recovery } };
}
async function mount(component: React.ReactElement, repository: LeadRepository) { const q = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } }); clients.push(q); await render(React.createElement(QueryClientProvider, { client: q }, React.createElement(LeadRepositoryTestProvider, { value: repository }, component))); }
test('refresh-restored unresolved command remains visible and blocks a blank new form without auto replay', async () => { const s = setup(); jest.mocked(s.raw.createLead).mockRejectedValue(new LeadFailure('uncertain_outcome', 'Unknown save.')); await expect(s.repo.recovery.save(op)).rejects.toThrow(); const restored = createLeadSaveRecovery(s.options); await restored.load(); await mount(React.createElement(PersistedLeadFormScreen), { ...s.raw, recovery: restored }); expect(screen.getByText(/previous save has an unknown outcome/)).toBeTruthy(); expect(screen.getByRole('button', { name: 'Save lead' })).toBeDisabled(); expect(s.raw.createLead).toHaveBeenCalledTimes(1); });
test('explicit absent receipt check explains uncertainty and never replays from list', async () => { const s = setup(); jest.mocked(s.raw.createLead).mockRejectedValue(new LeadFailure('uncertain_outcome', 'Unknown save.')); await expect(s.repo.recovery.save(op)).rejects.toThrow(); await mount(React.createElement(PersistedLeadListScreen), s.repo); await fireEvent.press(screen.getByRole('button', { name: 'Check server outcome' })); await waitFor(() => expect(screen.getByText(/does not prove the save failed/)).toBeTruthy()); expect(s.raw.createLead).toHaveBeenCalledTimes(1); expect(router.replace).not.toHaveBeenCalled(); });
test('matching receipt check refreshes and navigates only after clearing metadata', async () => { const s = setup(); jest.mocked(s.raw.createLead).mockRejectedValue(new LeadFailure('uncertain_outcome', 'Unknown save.')); await expect(s.repo.recovery.save(op)).rejects.toThrow(); jest.mocked(s.raw.receipt!).mockResolvedValue({ owner_id: owner, command_id: commandId, command_type: 'create_lead', request: receiptRequest(op), result: { lead_id: id, lead_version: 2, follow_up_id: task } }); await mount(React.createElement(PersistedLeadListScreen), s.repo); await fireEvent.press(screen.getByRole('button', { name: 'Check server outcome' })); await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/crm/lead/[id]', params: { id } })); expect(s.values.has(pendingLeadKey)).toBe(false); expect(s.refresh).toHaveBeenCalledTimes(1); });
test('actual form journaled retry uses same UUID and payload after an uncertain response', async () => { const s = setup(); await s.repo.recovery.load(); jest.mocked(s.raw.createLead).mockRejectedValueOnce(new LeadFailure('uncertain_outcome', 'Unknown save.')); await mount(React.createElement(PersistedLeadFormScreen), s.repo); for (const [label,value] of [['Full name','Fictional Buyer'],['Mobile number','+971501234567'],['Lead source','Fictional'],['Inquiry summary (include budget, bedrooms and residence preferences)','Fictional inquiry'],['Next action','Discuss needs'],['Follow-up date/time — Asia/Colombo (YYYY-MM-DDTHH:mm)','2026-10-12T09:30']]) await fireEvent.changeText(screen.getByLabelText(label),value); await fireEvent.press(screen.getByRole('button', { name: 'Save lead' })); await waitFor(() => expect(screen.getByText(/Recovery metadata is retained/)).toBeTruthy()); await fireEvent.press(screen.getByRole('button', { name: 'Retry unchanged command' })); await waitFor(() => expect(s.raw.createLead).toHaveBeenCalledTimes(2)); expect(jest.mocked(s.raw.createLead).mock.calls[0]).toEqual(jest.mocked(s.raw.createLead).mock.calls[1]); await waitFor(() => expect(s.values.size).toBe(0)); });
test('application submission rejects a mutation-capable real repository without its recovery coordinator', () => { const s = setup(); expect(() => executeLeadSubmission(s.raw, op)).toThrow('Save recovery is unavailable. Nothing was sent.'); expect(s.raw.createLead).not.toHaveBeenCalled(); });
test('definite first rejection permits explicit draft review without resubmitting', async () => { const s = setup(); await s.repo.recovery.load(); jest.mocked(s.raw.createLead).mockRejectedValue(new LeadFailure('invalid_command','Rejected.')); await mount(React.createElement(PersistedLeadFormScreen), s.repo); for (const [label,value] of [['Full name','Fictional Buyer'],['Mobile number','+971501234567'],['Lead source','Fictional'],['Inquiry summary (include budget, bedrooms and residence preferences)','Fictional inquiry'],['Next action','Discuss needs'],['Follow-up date/time — Asia/Colombo (YYYY-MM-DDTHH:mm)','2026-10-12T09:30']]) await fireEvent.changeText(screen.getByLabelText(label),value); await fireEvent.press(screen.getByRole('button', { name: 'Save lead' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Review draft after rejection' })).toBeTruthy()); await fireEvent.press(screen.getByRole('button', { name: 'Review draft after rejection' })); expect(screen.getByLabelText('Full name')).toHaveProp('editable',true); expect(s.raw.createLead).toHaveBeenCalledTimes(1); expect(s.values.size).toBe(0); });
test.each([
  ['detail', 'loading', PersistedLeadDetailScreen], ['detail', 'error', PersistedLeadDetailScreen],
  ['edit', 'loading', PersistedLeadEditScreen], ['edit', 'error', PersistedLeadEditScreen],
] as const)('%s %s keeps unresolved recovery visible after restoration', async (_name, state, Component) => {
  const s = setup(); jest.mocked(s.raw.createLead).mockRejectedValue(new LeadFailure('uncertain_outcome', 'Unknown save.'));
  await expect(s.repo.recovery.save(op)).rejects.toThrow(); const restored = createLeadSaveRecovery(s.options); await restored.load();
  if (state === 'loading') jest.mocked(s.raw.detail).mockImplementation(() => new Promise(() => {}));
  else jest.mocked(s.raw.detail).mockRejectedValue(new LeadFailure('not_found', 'This lead is unavailable.'));
  await mount(React.createElement(Component, { id }), { ...s.raw, recovery: restored });
  if (state === 'error') await waitFor(() => expect(screen.getByText('This lead is unavailable.')).toBeTruthy());
  else expect(screen.getByLabelText('Loading lead')).toBeTruthy();
  expect(screen.getByText(/previous save has an unknown outcome/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check server outcome' })).toBeTruthy();
  expect(s.values.has(pendingLeadKey)).toBe(true); expect(s.raw.createLead).toHaveBeenCalledTimes(1);
});
