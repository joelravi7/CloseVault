import React, { type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createClient } from '@supabase/supabase-js';
import { LeadRepositoryProvider, useLeadRepository } from '../lead-repository-provider';
import { createConfiguredAuth } from '@/data/supabase/auth-gateway';
import type { AuthState } from '@/domain/authentication';
import type { Database } from '@/data/supabase/database.types';

jest.mock('@/data/supabase/auth-gateway', () => ({ createConfiguredAuth: jest.fn() }));
const owner = '00000000-0000-4000-8000-000000000001';
let mockState: AuthState = { status: 'authenticated', userId: owner, expiresAt: 9999999999 };
let mockDemo = false;
const mockListeners = new Set<(state: AuthState) => void>();
const mockController = { getState: () => mockState, listen: (listener: (state: AuthState) => void) => { mockListeners.add(listener); return () => { mockListeners.delete(listener); }; } };
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ state: mockState, demo: mockDemo, controller: mockController }) }));
const verify = jest.fn(async () => true);
const transport = jest.fn(async () => new Response('[]', { headers: { 'content-type': 'application/json', 'content-range': '*/0' } }));
beforeEach(() => {
  mockState = { status: 'authenticated', userId: owner, expiresAt: 9999999999 }; mockDemo = false; mockListeners.clear(); verify.mockReset().mockResolvedValue(true); transport.mockClear();
  const client = createClient<Database>('https://uxecsfrnmlbugkuhjfeu.supabase.co', 'sb_publishable_fictional', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport } });
  // Provider only uses verifyOwner plus SDK reads; the mock never opens a session.
  jest.mocked(createConfiguredAuth).mockReturnValue({ client, gateway: { verifyOwner: verify } } as unknown as ReturnType<typeof createConfiguredAuth>);
});
const wrapper = ({ children }: PropsWithChildren) => React.createElement(LeadRepositoryProvider, null, children);
test('application repository verifies owner through existing gateway and is always read-only', async () => { const hook = await renderHook(useLeadRepository, { wrapper }); await waitFor(() => expect(hook.result.current).not.toBeNull()); const repo = hook.result.current!; expect(repo.writable).toBe(false); await repo.list({ page: 0, search: '' }); expect(verify).toHaveBeenCalledWith(mockState); expect(transport).toHaveBeenCalledTimes(1); await hook.unmount(); });
test('failed owner verification denies data reads', async () => { verify.mockResolvedValue(false); const hook = await renderHook(useLeadRepository, { wrapper }); await waitFor(() => expect(hook.result.current).not.toBeNull()); await expect(hook.result.current!.list({ page: 0, search: '' })).rejects.toMatchObject({ code: 'unauthorized' }); expect(transport).not.toHaveBeenCalled(); await hook.unmount(); });
test('terminal access loss invalidates captured repository even after same-owner reauthorization', async () => { const hook = await renderHook(useLeadRepository, { wrapper }); await waitFor(() => expect(hook.result.current).not.toBeNull()); const old = hook.result.current!; await act(async () => { mockState = { status: 'signed_out' }; for (const listener of mockListeners) listener(mockState); mockState = { status: 'authenticated', userId: owner, expiresAt: 9999999999 }; }); await expect(old.list({ page: 0, search: '' })).rejects.toMatchObject({ code: 'unauthorized' }); expect(transport).not.toHaveBeenCalled(); await hook.unmount(); });
test('demo mode never configures a hosted CRM repository', async () => { mockDemo = true; jest.mocked(createConfiguredAuth).mockClear(); const hook = await renderHook(useLeadRepository, { wrapper }); expect(hook.result.current).toBeNull(); expect(createConfiguredAuth).not.toHaveBeenCalled(); await hook.unmount(); });

test('repository cleanup does not stop the shared AuthProvider refresh lifecycle', async () => {
  const configured = createConfiguredAuth();
  const stop = jest.spyOn(configured.client.auth, 'stopAutoRefresh');
  const hook = await renderHook(useLeadRepository, { wrapper });
  await waitFor(() => expect(hook.result.current).not.toBeNull());
  await hook.unmount();
  expect(stop).not.toHaveBeenCalled();
  expect(mockListeners.size).toBe(0);
  stop.mockRestore();
});
