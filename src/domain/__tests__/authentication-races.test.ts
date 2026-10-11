import { AuthController, AuthFailure, canAccessPrivate, type AuthEvent, type AuthGateway, type AuthSession } from '../authentication';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
const session: AuthSession = { userId: '00000000-0000-4000-8000-000000000001', expiresAt: 60 };
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
function setup() {
  let listener!: (event: AuthEvent, value: AuthSession | null) => void;
  const gateway = {
    restore: jest.fn<Promise<AuthSession | null>, []>().mockResolvedValue(null),
    signIn: jest.fn<Promise<AuthSession>, [string, string]>().mockResolvedValue(session),
    verifyOwner: jest.fn<Promise<boolean>, [AuthSession]>().mockResolvedValue(true),
    signOut: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    consumeRecovery: jest.fn<Promise<AuthSession>, [string]>().mockResolvedValue(session),
    updatePassword: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    requestRecovery: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    subscribe: (next: typeof listener) => { listener = next; return jest.fn(); },
  } satisfies AuthGateway;
  const clear = jest.fn();
  const controller = new AuthController(gateway, clear, () => 1000);
  controller.start();
  return { controller, gateway, clear, emit: (event: AuthEvent, value: AuthSession | null = null) => listener(event, value) };
}

describe('terminal authentication events and stale operations', () => {
  it('A: signed-out during sign-in verification closes immediately and rejects late success', async () => {
    const { controller, gateway, clear, emit } = setup(); await flush();
    const pending = deferred<boolean>(); gateway.verifyOwner.mockReturnValueOnce(pending.promise);
    const login = controller.signIn('fictional@example.invalid', 'fictional password'); await flush();
    clear.mockClear(); emit('signed_out');
    expect(controller.getState().status).toBe('signed_out'); expect(canAccessPrivate(controller.getState())).toBe(false); expect(clear).toHaveBeenCalled();
    pending.resolve(true); await login; expect(controller.getState().status).toBe('signed_out'); controller.stop();
  });
  it('B: terminal event invalidates restoration while owner verification is pending', async () => {
    const { controller, gateway, emit } = setup(); await flush(); const pending = deferred<boolean>();
    gateway.restore.mockResolvedValue(session); gateway.verifyOwner.mockReturnValueOnce(pending.promise);
    const restoring = controller.restore(); await flush(); emit('signed_out'); pending.resolve(true); await restoring;
    expect(controller.getState().status).toBe('signed_out'); expect(canAccessPrivate(controller.getState())).toBe(false); controller.stop();
  });
  it.each(['exchange', 'verification'] as const)('C: recovery %s cannot authorize after sign-out', async (phase) => {
    const { controller, gateway, emit } = setup(); await flush(); const exchange = deferred<AuthSession>(); const verification = deferred<boolean>();
    if (phase === 'exchange') gateway.consumeRecovery.mockReturnValueOnce(exchange.promise); else gateway.verifyOwner.mockReturnValueOnce(verification.promise);
    const recovery = controller.consumeRecovery('fixture'); await flush(); emit('signed_out');
    expect(controller.getState().status).toBe('signed_out'); exchange.resolve(session); verification.resolve(true); await recovery;
    expect(controller.getState().status).toBe('signed_out'); await expect(controller.updatePassword('fictional new password')).rejects.toThrow('verified recovery'); controller.stop();
  });
  it('D: repeated sign-out is safe, clears state and never restores a pending login', async () => {
    const { controller, gateway, emit } = setup(); await flush(); const pending = deferred<boolean>(); gateway.verifyOwner.mockReturnValueOnce(pending.promise);
    const login = controller.signIn('fictional@example.invalid', 'fictional password'); await flush();
    expect(() => { emit('signed_out'); emit('signed_out'); emit('signed_out'); }).not.toThrow();
    expect(controller.getState().status).toBe('signed_out'); pending.resolve(true); await login; expect(canAccessPrivate(controller.getState())).toBe(false); controller.stop();
  });
  it('E: late rejection cannot overwrite terminal authoritative state', async () => {
    const { controller, gateway, emit } = setup(); await flush(); const pending = deferred<boolean>(); gateway.verifyOwner.mockReturnValueOnce(pending.promise);
    const login = controller.signIn('fictional@example.invalid', 'fictional password').catch(() => undefined); await flush(); emit('signed_out');
    pending.reject(new AuthFailure('unavailable')); await login; expect(controller.getState().status).toBe('signed_out'); controller.stop();
  });
  it('F: a new sign-in succeeds while the invalidated old verification remains pending', async () => {
    const { controller, gateway, emit } = setup(); await flush(); const old = deferred<boolean>(); gateway.verifyOwner.mockReturnValueOnce(old.promise);
    const first = controller.signIn('fictional@example.invalid', 'fictional password'); await flush(); emit('signed_out');
    await controller.signIn('fictional@example.invalid', 'new fictional password'); expect(controller.getState().status).toBe('authenticated');
    old.resolve(false); await first; expect(controller.getState().status).toBe('authenticated'); controller.stop();
  });
  it('F: stale finally cannot release the busy guard belonging to a newer operation', async () => {
    const { controller, gateway, emit } = setup(); await flush(); const old = deferred<boolean>(); const next = deferred<boolean>();
    gateway.verifyOwner.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const first = controller.signIn('fictional@example.invalid', 'fictional password'); await flush(); emit('signed_out');
    const second = controller.signIn('fictional@example.invalid', 'new fictional password'); await flush(); old.resolve(true); await first;
    await expect(controller.signIn('fictional@example.invalid', 'third fictional password')).rejects.toThrow('already running');
    next.resolve(true); await second; expect(controller.getState().status).toBe('authenticated'); controller.stop();
  });
  it.each(['storage', 'unavailable'] as const)('G: %s logout failure keeps access denied', async (kind) => {
    const { controller, gateway } = setup(); await flush(); await controller.signIn('fictional@example.invalid', 'fictional password');
    gateway.signOut.mockRejectedValueOnce(new AuthFailure(kind)); await controller.signOut();
    expect(controller.getState().status).toBe('verification_unavailable'); expect(canAccessPrivate(controller.getState())).toBe(false); controller.stop();
  });
  it('storage fault events invalidate an in-flight authorization synchronously', async () => {
    const { controller, gateway, emit } = setup(); await flush(); const pending = deferred<boolean>(); gateway.verifyOwner.mockReturnValueOnce(pending.promise);
    const login = controller.signIn('fictional@example.invalid', 'fictional password'); await flush(); emit('unavailable');
    expect(controller.getState().status).toBe('verification_unavailable'); pending.resolve(true); await login; expect(canAccessPrivate(controller.getState())).toBe(false); controller.stop();
  });
  it.each(['success', 'failure'] as const)('late password-update %s cannot alter or log out a newer session', async (result) => {
    const { controller, gateway, emit } = setup(); await flush(); await controller.consumeRecovery('fixture'); const pending = deferred<void>(); gateway.updatePassword.mockReturnValueOnce(pending.promise);
    const update = controller.updatePassword('fictional new password').catch(() => undefined); await flush(); emit('signed_out');
    await controller.signIn('fictional@example.invalid', 'new fictional password');
    if (result === 'success') pending.resolve(undefined); else pending.reject(new AuthFailure('unavailable'));
    await update; expect(controller.getState().status).toBe('authenticated'); expect(gateway.signOut).not.toHaveBeenCalled(); controller.stop();
  });
  it('cleanup callback failure never makes terminal event handling throw or retain access', async () => {
    const { controller, clear, emit } = setup(); await flush(); clear.mockImplementationOnce(() => { throw new Error('fixture cleanup failed'); });
    expect(() => emit('signed_out')).not.toThrow(); expect(canAccessPrivate(controller.getState())).toBe(false); controller.stop();
  });
});
