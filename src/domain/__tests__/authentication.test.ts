import { QueryClient } from '@tanstack/react-query';
import { AuthController, AuthFailure, authDestination, canAccessPrivate, type AuthEvent, type AuthGateway, type AuthSession } from '../authentication';
import { isExplicitDemo, parseAuthConfiguration, parseRecoveryCode } from '../../data/supabase/auth-config';

const session: AuthSession = { userId: '00000000-0000-4000-8000-000000000001', expiresAt: 60 };
function setup() {
  let listener: ((event: AuthEvent, session: AuthSession | null) => void) | undefined;
  const gateway = {
    restore: jest.fn<ReturnType<AuthGateway['restore']>, []>().mockResolvedValue(session),
    signIn: jest.fn<ReturnType<AuthGateway['signIn']>, [string,string]>().mockResolvedValue(session),
    verifyOwner: jest.fn<Promise<boolean>, [AuthSession]>().mockResolvedValue(true),
    signOut: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    requestRecovery: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    consumeRecovery: jest.fn<Promise<AuthSession>, [string]>().mockResolvedValue(session),
    updatePassword: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    subscribe: jest.fn((next: (event: AuthEvent, session: AuthSession | null) => void) => { listener = next; return jest.fn(); }),
  } satisfies AuthGateway;
  const clear = jest.fn(); const controller = new AuthController(gateway, clear, () => 1000);
  return { gateway, clear, controller, emit: (event: AuthEvent, next: AuthSession | null) => listener?.(event,next) };
}
const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
describe('secure authentication state transitions', () => {
  it('hides private routes throughout restoration, then verifies owner', async () => {
    const { controller, gateway } = setup(); expect(canAccessPrivate(controller.getState())).toBe(false);
    await controller.restore(); expect(gateway.verifyOwner).toHaveBeenCalledWith(session);
    expect(controller.getState().status).toBe('authenticated'); expect(authDestination(controller.getState())).toBe('/workspace');
  });
  it('restores an absent session as signed out', async () => {
    const { controller, gateway } = setup(); gateway.restore.mockResolvedValue(null);
    await controller.restore(); expect(authDestination(controller.getState())).toBe('/sign-in'); expect(gateway.verifyOwner).not.toHaveBeenCalled();
  });
  it('successful sign-in still requires owner verification', async () => {
    const { controller, gateway } = setup(); await controller.signIn('fictional@example.invalid','fictional password');
    expect(gateway.signIn).toHaveBeenCalled(); expect(controller.getState().status).toBe('authenticated');
  });
  it('failed login does not authorize', async () => {
    const { controller, gateway } = setup(); gateway.signIn.mockRejectedValue(new AuthFailure('invalid_session'));
    await expect(controller.signIn('fictional@example.invalid','wrong')).rejects.toThrow('Sign-in failed');
    expect(controller.getState().status).toBe('signed_out'); expect(gateway.verifyOwner).not.toHaveBeenCalled();
  });
  it('distinguishes an authenticated nonowner from network verification failure', async () => {
    const { controller, gateway } = setup(); gateway.verifyOwner.mockResolvedValue(false); await controller.restore();
    expect(controller.getState().status).toBe('unauthorized'); expect(canAccessPrivate(controller.getState())).toBe(false);
    gateway.verifyOwner.mockRejectedValue(new AuthFailure('unavailable')); await controller.restore();
    expect(controller.getState().status).toBe('verification_unavailable');
  });
  it('storage failures fail closed rather than imply confirmed unauthorized identity', async () => {
    const { controller, gateway } = setup(); gateway.restore.mockRejectedValue(new AuthFailure('storage')); await controller.restore();
    expect(controller.getState().status).toBe('verification_unavailable'); expect(gateway.verifyOwner).not.toHaveBeenCalled();
  });
  it('rejects expired sessions before owner verification', async () => {
    const { controller, gateway } = setup(); gateway.restore.mockResolvedValue({ ...session, expiresAt: 1 }); await controller.restore();
    expect(controller.getState().status).toBe('signed_out'); expect(gateway.verifyOwner).not.toHaveBeenCalled();
  });
  it('invalid server session verification signs out', async () => {
    const { controller, gateway } = setup(); gateway.verifyOwner.mockRejectedValue(new AuthFailure('invalid_session')); await controller.restore();
    expect(controller.getState().status).toBe('signed_out');
  });
  it('hides private content and clears query cache before waiting for logout', async () => {
    const query = new QueryClient(); const { gateway } = setup(); let finish: (() => void) | undefined;
    gateway.signOut.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const controller = new AuthController(gateway, () => query.clear(), () => 1000);
    await controller.restore(); query.setQueryData(['private'], { label: 'fictional' });
    const logout = controller.signOut(); expect(controller.getState().status).toBe('signing_out');
    expect(query.getQueryData(['private'])).toBeUndefined(); expect(canAccessPrivate(controller.getState())).toBe(false);
    finish?.(); await logout; expect(authDestination(controller.getState())).toBe('/sign-in');
  });
  it('logout errors never reopen private access', async () => {
    const { controller, gateway } = setup(); await controller.restore(); gateway.signOut.mockRejectedValue(new Error('fixture network failure'));
    await controller.signOut(); expect(controller.getState().status).toBe('verification_unavailable');
  });
  it('late restoration cannot reopen access after logout', async () => {
    const { controller, gateway } = setup(); let finish: ((value: AuthSession) => void) | undefined;
    gateway.restore.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const restore = controller.restore(); await controller.signOut(); finish?.(session); await restore;
    expect(controller.getState().status).toBe('signed_out');
  });
  it('auth events hide immediately, reverify and handle sign-out navigation', async () => {
    const { controller, emit } = setup(); controller.start(); await flush();
    emit('session',session); expect(controller.getState().status).toBe('initializing'); await flush();
    expect(controller.getState().status).toBe('authenticated'); emit('signed_out',null);
    expect(authDestination(controller.getState())).toBe('/sign-in'); controller.stop();
  });
  it('storage fault events remain unavailable, not signed out', async () => {
    const { controller, emit } = setup(); controller.start(); await flush(); emit('unavailable',null);
    expect(controller.getState().status).toBe('verification_unavailable'); controller.stop();
  });
  it('expiration clears access and private caches deterministically', async () => {
    const { gateway, clear } = setup(); let now=1000; const controller = new AuthController(gateway,clear,()=>now);
    await controller.restore(); now=60_000; controller.expire(); expect(controller.getState().status).toBe('signed_out'); expect(clear).toHaveBeenCalled();
  });
  it('recovery-request failures return only a generic error', async () => {
    const { controller, gateway } = setup(); gateway.requestRecovery.mockRejectedValue(new Error('sensitive fixture diagnostics'));
    await expect(controller.requestRecovery('fictional@example.invalid')).rejects.toThrow('Recovery request could not be processed');
  });
  it('invalid recovery callbacks cannot unlock CRM or password reset', async () => {
    const { controller, gateway } = setup(); gateway.consumeRecovery.mockRejectedValue(new AuthFailure('invalid_session'));
    await controller.consumeRecovery('invalid'); expect(controller.getState().status).toBe('verification_unavailable');
    await expect(controller.updatePassword('fictional new password')).rejects.toThrow('verified recovery'); expect(gateway.updatePassword).not.toHaveBeenCalled();
  });
  it('verified owner recovery cannot access CRM and signs out after password update', async () => {
    const { controller, gateway } = setup(); await controller.consumeRecovery('fixture');
    expect(authDestination(controller.getState())).toBe('/reset-password'); expect(canAccessPrivate(controller.getState())).toBe(false);
    await controller.updatePassword('fictional new password'); expect(gateway.updatePassword).toHaveBeenCalled(); expect(gateway.signOut).toHaveBeenCalled();
    expect(controller.getState().status).toBe('signed_out');
  });
  it('nonowner recovery is rejected before password update', async () => {
    const { controller, gateway } = setup(); gateway.verifyOwner.mockResolvedValue(false); await controller.consumeRecovery('fixture');
    expect(controller.getState().status).toBe('unauthorized'); await expect(controller.updatePassword('fictional new password')).rejects.toThrow();
  });
  it('ordinary signed-in owner cannot use the recovery-only password operation', async () => {
    const { controller } = setup(); await controller.restore(); await expect(controller.updatePassword('fictional new password')).rejects.toThrow();
  });
  it('recovery verification retry never promotes the session to ordinary CRM access', async () => {
    const { controller, gateway } = setup(); gateway.verifyOwner.mockRejectedValueOnce(new AuthFailure('unavailable'));
    await controller.consumeRecovery('fixture'); expect(controller.getState().status).toBe('verification_unavailable');
    await controller.restore(); expect(controller.getState().status).toBe('password_recovery'); expect(canAccessPrivate(controller.getState())).toBe(false);
  });
  it('foreground restoration cannot supersede an in-flight sign-out', async () => {
    const { controller, gateway } = setup(); await controller.restore(); let finish: (()=>void) | undefined;
    gateway.signOut.mockImplementation(()=>new Promise<void>((resolve)=>{finish=resolve;}));const logout=controller.signOut();
    await controller.restore();expect(controller.getState().status).toBe('signing_out');finish?.();await logout;expect(controller.getState().status).toBe('signed_out');
  });
  it('malformed callback plus retry cannot authorize password reset from a cached owner session', async () => {
    const { controller, gateway } = setup(); await controller.restore(); gateway.consumeRecovery.mockRejectedValue(new AuthFailure('invalid_session'));
    await controller.consumeRecovery('invalid'); gateway.restore.mockClear(); await controller.restore();
    expect(gateway.restore).not.toHaveBeenCalled(); expect(controller.getState().status).toBe('verification_unavailable');
    await expect(controller.updatePassword('fictional new password')).rejects.toThrow('verified recovery');expect(gateway.updatePassword).not.toHaveBeenCalled();
  });
  it('ordinary session events cannot elevate a failed recovery exchange', async () => {
    const { controller, gateway, emit } = setup(); controller.start(); await flush();gateway.consumeRecovery.mockRejectedValue(new AuthFailure('invalid_session'));
    await controller.consumeRecovery('invalid');emit('session',session);await flush();expect(controller.getState().status).toBe('verification_unavailable');
    emit('signed_out',null);await controller.signIn('fictional@example.invalid','fictional password');expect(controller.getState().status).toBe('authenticated');controller.stop();
  });
});
describe('configuration and strict recovery boundary', () => {
  it.each([[undefined,undefined],['https://fixture.invalid','sb_secret_fixture'],['http://fixture.invalid','sb_publishable_fixture'],['https://user:pass@fixture.invalid','sb_publishable_fixture']])('rejects missing/unsafe configuration %s', (url,key) => { expect(()=>parseAuthConfiguration(url,key)).toThrow(); });
  it('accepts publishable-only HTTPS configuration',()=>{ expect(parseAuthConfiguration('https://fixture.invalid','sb_publishable_fixture').url).toBe('https://fixture.invalid'); });
  it('demo mode requires explicit development opt-in',()=>{ expect(isExplicitDemo('development',true)).toBe(false); expect(isExplicitDemo('demo',false)).toBe(false); expect(isExplicitDemo('demo',true)).toBe(true); });
  it.each(['https://other.invalid/reset-password?code=fixture','https://fixture.invalid/reset-password?code=a&code=b','https://fixture.invalid/reset-password#access_token=fixture','https://fixture.invalid/reset-password?error=fixture','not-a-url'])('rejects malformed or mismatched callback %s',(url)=>{ expect(()=>parseRecoveryCode(url,'https://fixture.invalid/reset-password')).toThrow(); });
  it('requires approved redirect configuration',()=>{ expect(()=>parseRecoveryCode('https://fixture.invalid/reset-password?code=fixture',undefined)).toThrow(); });
  it.each(['https://fixture.invalid/reset-password','closevault://reset-password'])('accepts exact PKCE code callback for supplied redirect %s',(redirect)=>{ expect(parseRecoveryCode(`${redirect}?code=fixture`,redirect)).toBe('fixture'); });
});
