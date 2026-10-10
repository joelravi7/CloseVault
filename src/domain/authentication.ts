import { z } from 'zod';

export type AuthState =
  | { status: 'initializing' | 'signed_out' | 'unauthorized' | 'signing_out' }
  | { status: 'authenticated' | 'password_recovery'; userId: string; expiresAt: number }
  | { status: 'verification_unavailable'; message: string };
export interface AuthSession { userId: string; expiresAt: number }
export type AuthEvent = 'session' | 'signed_out' | 'recovery' | 'unavailable';
export class AuthFailure extends Error {
  constructor(public readonly kind: 'invalid_session' | 'unavailable' | 'storage', message = 'Authentication could not be verified.') { super(message); }
}
export interface AuthGateway {
  restore(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<AuthSession>;
  verifyOwner(session: AuthSession): Promise<boolean>;
  signOut(): Promise<void>;
  requestRecovery(email: string): Promise<void>;
  consumeRecovery(url: string): Promise<AuthSession>;
  updatePassword(password: string): Promise<void>;
  subscribe(listener: (event: AuthEvent, session: AuthSession | null) => void): () => void;
}
export const signInSchema = z.object({ email: z.string().trim().pipe(z.email()), password: z.string().min(1) });
export const newPasswordSchema = z.string().min(12, 'Use at least 12 characters.');
export function canAccessPrivate(state: AuthState): boolean { return state.status === 'authenticated'; }
export function authDestination(state: AuthState): '/sign-in' | '/auth-status' | '/reset-password' | '/workspace' {
  if (state.status === 'authenticated') return '/workspace';
  if (state.status === 'password_recovery') return '/reset-password';
  if (state.status === 'signed_out') return '/sign-in';
  return '/auth-status';
}

/** No tokens in render state. Epochs prevent stale verification reopening access. */
export class AuthController {
  private state: AuthState = { status: 'initializing' };
  private epoch = 0;
  private operation: number | null = null;
  private terminal = false;
  private cleanupFailed = false;
  private recoveryPending = false;
  private recoveryVerified = false;
  private unsubscribe?: () => void;
  private readonly listeners = new Set<(state: AuthState) => void>();
  constructor(private readonly gateway: AuthGateway, private readonly clearPrivate: () => void,
    private readonly now: () => number = Date.now) {}
  getState(): AuthState { return this.state; }
  listen(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private publish(state: AuthState): void { this.state = state; for (const listener of this.listeners) listener(state); }
  private get busy(): boolean { return this.operation !== null; }
  private clear(): boolean {
    try { this.clearPrivate(); } catch { this.cleanupFailed = true; }
    return !this.cleanupFailed;
  }
  private hide(): number { const epoch = ++this.epoch; this.publish({ status: 'initializing' }); this.clear(); return epoch; }
  private finish(epoch: number): void { if (this.operation === epoch) this.operation = null; }
  private invalidate(event: 'signed_out' | 'unavailable'): void {
    ++this.epoch; this.operation = null;
    this.terminal = true; this.recoveryPending = false; this.recoveryVerified = false;
    // Publish denial before cache cleanup, including when cleanup throws.
    this.publish({ status: 'signed_out' });
    if (!this.clear() || event === 'unavailable') this.failure(new AuthFailure('storage'), this.epoch);
  }
  private failure(error: unknown, epoch: number): void {
    if (epoch !== this.epoch) return;
    this.clear();
    if (!this.cleanupFailed && error instanceof AuthFailure && error.kind === 'invalid_session') this.publish({ status: 'signed_out' });
    else this.publish({ status: 'verification_unavailable', message: 'Session verification or secure storage is unavailable. Retry safely.' });
  }
  private async authorize(session: AuthSession | null, epoch: number, recovery = false): Promise<void> {
    if (epoch !== this.epoch) return;
    if (this.cleanupFailed) throw new AuthFailure('storage');
    if (!session || session.expiresAt * 1000 <= this.now()) { this.publish({ status: 'signed_out' }); return; }
    const owner = await this.gateway.verifyOwner(session);
    if (epoch !== this.epoch) return;
    if (session.expiresAt * 1000 <= this.now()) { this.publish({ status: 'signed_out' }); return; }
    this.publish(owner ? { status: recovery ? 'password_recovery' : 'authenticated', ...session } : { status: 'unauthorized' });
  }
  async restore(): Promise<void> {
    if (this.busy || this.terminal) return;
    if (this.recoveryPending && !this.recoveryVerified) {
      this.hide();
      this.publish({ status: 'verification_unavailable', message: 'A new valid recovery link is required. Sign out to return to sign-in.' });
      return;
    }
    const recovery = this.recoveryPending;
    const epoch = this.hide();
    try { await this.authorize(await this.gateway.restore(), epoch, recovery); } catch (error) { this.failure(error, epoch); }
  }
  start(): void {
    this.unsubscribe = this.gateway.subscribe((event, session) => {
      if (event === 'signed_out' || event === 'unavailable') { this.invalidate(event); return; }
      if (this.terminal) return;
      if (this.busy || this.state.status === 'signing_out') return;
      if (event === 'recovery') { this.recoveryPending = true; this.recoveryVerified = true; }
      const recovery = this.recoveryPending;
      const epoch = this.hide();
      if (this.recoveryPending && !this.recoveryVerified) {
        this.publish({ status: 'verification_unavailable', message: 'A new valid recovery link is required.' });
        return;
      }
      // Do not run auth API calls synchronously inside the SDK callback.
      void Promise.resolve().then(() => this.authorize(session, epoch, recovery))
        .catch((error: unknown) => this.failure(error, epoch));
    });
    void this.restore();
  }
  stop(): void { ++this.epoch; this.operation = null; this.unsubscribe?.(); this.unsubscribe = undefined; this.listeners.clear(); }
  verificationUnavailable(): void { const epoch = this.hide(); this.failure(new AuthFailure('unavailable'), epoch); }
  expire(): void {
    if ((this.state.status === 'authenticated' || this.state.status === 'password_recovery') && this.state.expiresAt * 1000 <= this.now()) {
      this.invalidate('signed_out');
    }
  }
  async signIn(email: string, password: string): Promise<void> {
    const input = signInSchema.parse({ email, password });
    if (this.busy) throw new Error('An authentication operation is already running.');
    this.recoveryPending = false;
    this.recoveryVerified = false;
    this.terminal = false;
    const epoch = this.hide(); this.operation = epoch;
    try { await this.authorize(await this.gateway.signIn(input.email, input.password), epoch); }
    catch (error) { this.failure(error, epoch); throw new Error('Sign-in failed. Check your details or try again.'); }
    finally { this.finish(epoch); }
  }
  async signOut(): Promise<void> {
    if (this.busy) throw new Error('An authentication operation is already running.');
    const epoch = ++this.epoch; this.operation = epoch; this.terminal = true;
    this.recoveryPending = false;
    this.recoveryVerified = false;
    this.publish({ status: 'signing_out' }); this.clear();
    try { await this.gateway.signOut(); if (epoch === this.epoch) this.publish({ status: 'signed_out' }); }
    catch { if (epoch === this.epoch) this.publish({ status: 'verification_unavailable', message: 'Sign-out did not complete. Private access remains blocked. Retry sign-out.' }); }
    finally { this.finish(epoch); }
  }
  async requestRecovery(email: string): Promise<void> {
    const valid = z.string().trim().pipe(z.email()).parse(email);
    try { await this.gateway.requestRecovery(valid); }
    catch { throw new Error('Recovery request could not be processed. Try again later.'); }
  }
  async consumeRecovery(url: string): Promise<void> {
    if (this.busy) throw new Error('An authentication operation is already running.');
    this.recoveryPending = true;
    this.recoveryVerified = false;
    this.terminal = false;
    const epoch = this.hide(); this.operation = epoch;
    try {
      const session = await this.gateway.consumeRecovery(url);
      if (epoch !== this.epoch) return;
      this.recoveryVerified = true;
      await this.authorize(session, epoch, true);
    }
    catch { if (epoch === this.epoch) this.publish({ status: 'verification_unavailable', message: 'Recovery link is invalid, expired, already used, or cannot be verified.' }); }
    finally { this.finish(epoch); }
  }
  async updatePassword(password: string): Promise<void> {
    newPasswordSchema.parse(password); this.expire();
    if (this.state.status !== 'password_recovery' || this.busy) throw new Error('A verified recovery session is required.');
    const epoch = this.hide(); this.operation = epoch;
    try { await this.gateway.updatePassword(password); }
    catch { if (epoch === this.epoch) this.publish({ status: 'verification_unavailable', message: 'Password update could not be verified. Request a new recovery link.' }); throw new Error('Password update failed.'); }
    finally { this.finish(epoch); }
    if (epoch !== this.epoch) return;
    await this.signOut();
  }
}
