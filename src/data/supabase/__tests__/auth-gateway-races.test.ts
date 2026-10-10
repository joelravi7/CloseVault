import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createAuthGateway } from '../auth-gateway';
import type { Database } from '../database.types';
import type { SessionStorageAdapter } from '../auth-storage';

jest.mock('expo-secure-store', () => ({}));
const session = { user: { id: '00000000-0000-4000-8000-000000000001' }, expires_at: 2_000_000_000 } as Session;
const identity = { userId: session.user.id, expiresAt: session.expires_at! };
const marker = 'closevault.auth.logout-pending';
const sessionKey = 'closevault.auth.session';
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let index = 0; index < 30; index++) await Promise.resolve(); }
function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: jest.fn(async (key: string) => values.get(key) ?? null), setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }), removeItem: jest.fn(async (key: string) => { values.delete(key); }), assertHealthy: jest.fn() } satisfies SessionStorageAdapter;
  const callbacks = new Set<(event: string, session: Session | null) => void>();
  const emit = (event: string) => { for (const callback of callbacks) callback(event, event === 'SIGNED_OUT' ? null : session); };
  const auth = {
    getSession: jest.fn().mockResolvedValue({ data: { session }, error: null }),
    getUser: jest.fn().mockResolvedValue({ data: { user: session.user }, error: null }),
    signInWithPassword: jest.fn(async () => { values.set(sessionKey, 'fictional new session'); emit('SIGNED_IN'); return { data: { session }, error: null }; }),
    signOut: jest.fn(async () => { emit('SIGNED_OUT'); return { error: null }; }),
    resetPasswordForEmail: jest.fn(), exchangeCodeForSession: jest.fn(), updateUser: jest.fn(),
    onAuthStateChange: jest.fn((callback: (event: string, session: Session | null) => void) => { callbacks.add(callback); return { data: { subscription: { unsubscribe: () => callbacks.delete(callback) } } }; }),
  };
  const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
  const gateway = createAuthGateway({ auth, rpc } as unknown as SupabaseClient<Database>, storage, 'https://fixture.invalid/reset-password');
  const listener = jest.fn(); gateway.subscribe(listener);
  return { gateway, auth, rpc, storage, values, emit, listener, client: { auth, rpc } as unknown as SupabaseClient<Database> };
}
describe('gateway terminal-event fencing, mocked SDK only', () => {
  it('terminal denial reaches subscribers on another gateway for the same store', async () => {
    const { emit, storage, client } = setup(); const second = createAuthGateway(client, storage); const listener = jest.fn(); second.subscribe(listener);
    emit('SIGNED_OUT'); expect(listener).toHaveBeenCalledWith('signed_out', null); expect(await second.restore()).toBeNull();
  });
  it('pending cached-session read cannot return a session after terminal invalidation', async () => {
    const { gateway, auth, emit } = setup(); const pending = deferred<void>(); auth.getSession.mockImplementationOnce(async () => { await pending.promise; return { data: { session }, error: null }; });
    const restoring = gateway.restore().catch((error: unknown) => error); await flush(); emit('SIGNED_OUT'); pending.resolve(); expect(await restoring).toMatchObject({ kind: 'invalid_session' });
  });
  it('late recovery SDK exchange cannot clear denial or authorize recovery', async () => {
    const { gateway, auth, emit, values } = setup(); const pending = deferred<void>();
    auth.exchangeCodeForSession.mockImplementationOnce(async () => { await pending.promise; values.set(sessionKey, 'fictional stale recovery'); emit('PASSWORD_RECOVERY'); return { data: { session }, error: null }; });
    const recovery = gateway.consumeRecovery('https://fixture.invalid/reset-password?code=fixture').catch((error: unknown) => error); await flush(); emit('SIGNED_OUT'); pending.resolve();
    expect(await recovery).toMatchObject({ kind: 'invalid_session' }); await flush(); expect(await gateway.restore()).toBeNull(); expect(values.get(marker)).toBe('pending');
  });
  it('terminal event during marker removal cannot clear denial permanently', async () => {
    const { gateway, storage, values, emit } = setup(); const pending = deferred<void>();
    storage.removeItem.mockImplementationOnce(async (key) => { await pending.promise; values.delete(key); });
    const login = gateway.signIn('fictional@example.invalid', 'fictional password').catch((error: unknown) => error); await flush(); emit('SIGNED_OUT'); pending.resolve();
    expect(await login).toMatchObject({ kind: 'invalid_session' }); await flush(); expect(values.get(marker)).toBe('pending'); expect(await gateway.restore()).toBeNull();
  });
  it('SDK-reported storage health failure blocks a recreated gateway as well', async () => {
    const { gateway, storage, client } = setup(); storage.assertHealthy.mockImplementationOnce(() => { throw new Error('fixture SDK storage fault'); });
    await expect(gateway.restore()).rejects.toThrow(); storage.assertHealthy.mockImplementation(() => undefined);
    await expect(createAuthGateway(client, storage).signIn('fictional@example.invalid', 'fictional password')).rejects.toMatchObject({ kind: 'storage' });
  });
  it('a recreated gateway sharing the session store cannot restore while old terminal cleanup is pending', async () => {
    const { gateway, auth, emit, storage, client } = setup(); const pending = deferred<void>();
    auth.signInWithPassword.mockImplementationOnce(async () => { await pending.promise; return { data: { session }, error: null }; });
    const login = gateway.signIn('fictional@example.invalid', 'fictional password').catch(() => undefined); await flush(); emit('SIGNED_OUT');
    const recreated = createAuthGateway(client, storage); expect(await recreated.restore()).toBeNull();
    pending.resolve(); await login;
  });
  it('late SDK sign-in cannot clear terminal denial or authorize cached restoration', async () => {
    const { gateway, auth, emit, values, listener } = setup(); const pending = deferred<void>();
    auth.signInWithPassword.mockImplementationOnce(async () => { await pending.promise; values.set(sessionKey, 'fictional stale session'); emit('SIGNED_IN'); return { data: { session }, error: null }; });
    const login = gateway.signIn('fictional@example.invalid', 'fictional password').catch((error: unknown) => error); await flush(); emit('SIGNED_OUT');
    pending.resolve(); expect(await login).toMatchObject({ kind: 'invalid_session' }); await flush();
    expect(values.get(marker)).toBe('pending'); expect(await gateway.restore()).toBeNull(); expect(listener).not.toHaveBeenCalledWith('session', identity);
  });
  it.each(['getUser', 'rpc'] as const)('terminal event invalidates pending %s verification', async (phase) => {
    const { gateway, auth, rpc, emit } = setup(); const pending = deferred<void>();
    if (phase === 'getUser') auth.getUser.mockImplementationOnce(async () => { await pending.promise; return { data: { user: session.user }, error: null }; });
    else rpc.mockImplementationOnce(async () => { await pending.promise; return { data: true, error: null }; });
    const verification = gateway.verifyOwner(identity).catch((error: unknown) => error); await flush(); emit('SIGNED_OUT'); pending.resolve();
    expect(await verification).toMatchObject({ kind: 'invalid_session' }); if (phase === 'getUser') expect(rpc).not.toHaveBeenCalled();
  });
  it('new sign-in waits for old logout cleanup and retains the new session', async () => {
    const { gateway, auth, storage, values } = setup(); const cleanup = deferred<void>();
    storage.removeItem.mockImplementationOnce(async (key) => { await cleanup.promise; values.delete(key); });
    const logout = gateway.signOut(); await flush(); const login = gateway.signIn('fictional@example.invalid', 'fictional password'); await flush();
    expect(auth.signInWithPassword).not.toHaveBeenCalled(); cleanup.resolve(); await logout; expect(await login).toEqual(identity);
    expect(values.get(sessionKey)).toBe('fictional new session'); expect(values.has(marker)).toBe(false); expect(await gateway.verifyOwner(identity)).toBe(true);
  });
  it('terminal marker failure is caught and sticky: later sign-in cannot reopen access', async () => {
    const { gateway, storage, emit, listener } = setup(); storage.setItem.mockRejectedValueOnce(new Error('fixture storage fault'));
    expect(() => emit('SIGNED_OUT')).not.toThrow(); await flush(); expect(listener).toHaveBeenCalledWith('unavailable', null);
    await expect(gateway.signIn('fictional@example.invalid', 'fictional password')).rejects.toThrow(); await expect(gateway.restore()).rejects.toThrow();
  });
  it('cleanup failure cannot erase a newer session because it blocks queued authentication', async () => {
    const { gateway, storage, auth } = setup(); storage.removeItem.mockRejectedValueOnce(new Error('fixture cleanup fault'));
    await expect(gateway.signOut()).rejects.toThrow(); await expect(gateway.signIn('fictional@example.invalid', 'fictional password')).rejects.toThrow(); expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
