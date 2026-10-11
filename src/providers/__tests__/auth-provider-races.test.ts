import { act, render } from '@testing-library/react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createElement, useEffect, type PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
import RootLayout from '../../app/_layout';
import { createConfiguredAuth } from '../../data/supabase/auth-gateway';
import { authDestination, type AuthController, type AuthEvent, type AuthGateway, type AuthSession } from '../../domain/authentication';
import { useAuth } from '../auth-provider';
import { DemoDataProvider } from '../demo-data-provider';

jest.mock('../../data/supabase/auth-gateway', () => ({ createConfiguredAuth: jest.fn() }));
jest.mock('expo-linking', () => ({ getInitialURL: jest.fn().mockResolvedValue(null), addEventListener: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('../demo-data-provider', () => ({ DemoDataProvider: jest.fn(({ children }: PropsWithChildren) => children) }));
jest.mock('../security-provider', () => ({ SecurityProvider: ({ children }: PropsWithChildren) => children }));
jest.mock('../../services/notifications', () => ({ configureNotifications: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  const Stack = ({ children }: PropsWithChildren) => React.createElement(Native.View, null, children, React.createElement(MockBoundaryProbe));
  Stack.Protected = function Protected({ guard, children }: PropsWithChildren<{ guard: boolean }>) { return guard ? children : null; };
  Stack.Screen = function Screen({ name }: { name: string }) { return React.createElement(Native.Text, null, `route:${name}`); };
  return { Stack };
});
let controller: AuthController | null = null;
let query: QueryClient;
function MockBoundaryProbe() {
  const auth = useAuth(); const currentQuery = useQueryClient();
  useEffect(() => { controller = auth.controller; query = currentQuery; }, [auth.controller, currentQuery]);
  return createElement(View, null, createElement(Text, null, `destination:${authDestination(auth.state)}`));
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
const session: AuthSession = { userId: '00000000-0000-4000-8000-000000000001', expiresAt: 2_000_000_000 };
function setup() {
  let listener!: (event: AuthEvent, session: AuthSession | null) => void;
  const gateway = { restore: jest.fn().mockResolvedValue(session), signIn: jest.fn().mockResolvedValue(session), verifyOwner: jest.fn().mockResolvedValue(true), signOut: jest.fn().mockResolvedValue(undefined), requestRecovery: jest.fn(), consumeRecovery: jest.fn().mockResolvedValue(session), updatePassword: jest.fn(), subscribe: jest.fn((callback) => { listener = callback; return jest.fn(); }) } satisfies AuthGateway;
  const client = { auth: { startAutoRefresh: jest.fn().mockResolvedValue(undefined), stopAutoRefresh: jest.fn().mockResolvedValue(undefined) } };
  jest.mocked(createConfiguredAuth).mockReturnValue({ gateway, client } as unknown as ReturnType<typeof createConfiguredAuth>);
  return { gateway, emit: () => listener('signed_out', null) };
}
const originalLabel = process.env.EXPO_PUBLIC_APP_ENV;
describe('actual provider and layout race boundary (router mechanics mocked)', () => {
  beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Date, 'now').mockReturnValue(1000); process.env.EXPO_PUBLIC_APP_ENV = 'development'; controller = null; });
  afterEach(() => { jest.restoreAllMocks(); if (originalLabel === undefined) delete process.env.EXPO_PUBLIC_APP_ENV; else process.env.EXPO_PUBLIC_APP_ENV = originalLabel; });
  it('terminal sign-out clears cache, removes workspace and late login cannot reopen it; new login works', async () => {
    const { gateway, emit } = setup(); const pending = deferred<boolean>(); const view = await render(createElement(RootLayout));
    expect(view.getByText('route:workspace')).toBeTruthy(); gateway.verifyOwner.mockReturnValueOnce(pending.promise);
    let login!: Promise<void>; await act(async () => { login = controller!.signIn('fictional@example.invalid', 'fictional password'); });
    query.setQueryData(['private'], { label: 'fictional' }); await act(async () => { emit(); });
    expect(query.getQueryData(['private'])).toBeUndefined(); expect(view.queryByText('route:workspace')).toBeNull(); expect(view.getByText('route:sign-in')).toBeTruthy();
    await act(async () => { pending.resolve(true); await login; }); expect(view.getByText('destination:/sign-in')).toBeTruthy(); expect(view.queryByText('route:workspace')).toBeNull();
    await act(async () => { await controller!.signIn('fictional@example.invalid', 'fictional password'); }); expect(view.getByText('route:workspace')).toBeTruthy(); expect(DemoDataProvider).not.toHaveBeenCalled();
  });
  it('late initial restoration cannot mount workspace after terminal event', async () => {
    const { gateway, emit } = setup(); const pending = deferred<boolean>(); gateway.verifyOwner.mockReturnValueOnce(pending.promise);
    const view = await render(createElement(RootLayout)); await act(async () => { emit(); pending.resolve(true); });
    expect(view.queryByText('route:workspace')).toBeNull(); expect(view.getByText('destination:/sign-in')).toBeTruthy(); expect(DemoDataProvider).not.toHaveBeenCalled();
  });
  it('late recovery exchange cannot reopen password-recovery authorization', async () => {
    const { gateway, emit } = setup(); const pending = deferred<AuthSession>(); gateway.consumeRecovery.mockReturnValueOnce(pending.promise); const view = await render(createElement(RootLayout));
    let recovery!: Promise<void>; await act(async () => { recovery = controller!.consumeRecovery('fictional injected callback'); });
    await act(async () => { emit(); pending.resolve(session); await recovery; }); expect(view.getByText('destination:/sign-in')).toBeTruthy(); expect(view.queryByText('route:workspace')).toBeNull();
    await expect(controller!.updatePassword('fictional new password')).rejects.toThrow('verified recovery'); expect(gateway.updatePassword).not.toHaveBeenCalled();
  });
});
