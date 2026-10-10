import { createClient, processLock, type Session, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { z } from 'zod';
import { pendingLeadKey } from '@/domain/lead-save-recovery';

import { AuthFailure, type AuthGateway, type AuthSession } from '@/domain/authentication';
import { parseAuthConfiguration, parseRecoveryCode, approvedRecoveryRedirect } from './auth-config';
import { createSecureSessionStorage, createWebSessionStorage, type SessionStorageAdapter } from './auth-storage';
import type { Database } from './database.types';

const sessionSchema = z.object({ userId: z.uuid(), expiresAt: z.number().positive() });
function identity(session: Session | null): AuthSession | null {
  return session ? sessionSchema.parse({ userId: session.user.id, expiresAt: session.expires_at }) : null;
}
function reject(error: { status?: number; code?: string } | null): void {
  if (error) throw new AuthFailure(error.status === 401 || error.status === 403 ||
    ['bad_jwt','session_not_found','refresh_token_not_found','refresh_token_already_used','user_not_found'].includes(error.code ?? '') ? 'invalid_session' : 'unavailable');
}
const logoutMarker = 'closevault.auth.logout-pending';
interface AuthRuntime {
  generation: number;
  denied: boolean;
  storageFailed: boolean;
  loggingOut: boolean;
  mutations: Promise<void>;
  listeners: Set<Parameters<AuthGateway['subscribe']>[0]>;
}
function createRuntime(): AuthRuntime {
  return { generation: 0, denied: false, storageFailed: false, loggingOut: false, mutations: Promise.resolve(), listeners: new Set() };
}
const storeRuntimes = new WeakMap<SessionStorageAdapter, AuthRuntime>();
function runtimeForStore(storage: SessionStorageAdapter): AuthRuntime {
  const existing = storeRuntimes.get(storage); if (existing) return existing;
  const runtime = createRuntime(); storeRuntimes.set(storage, runtime); return runtime;
}
// The app has one configured auth namespace. Keep its denial/cleanup ordering
// across provider remounts even though each factory call creates a new adapter.
const configuredRuntime = createRuntime();

export function createAuthGateway(client: SupabaseClient<Database>, storage: SessionStorageAdapter,
  recoveryRedirect: string | undefined = approvedRecoveryRedirect, runtime: AuthRuntime = runtimeForStore(storage)): AuthGateway {
  const notify: Parameters<AuthGateway['subscribe']>[0] = (event, session) => {
    for (const listener of runtime.listeners) { try { listener(event, session); } catch { /* Subscribers cannot reject SDK callbacks. */ } }
  };
  const healthy = (): void => {
    if (runtime.storageFailed) throw new AuthFailure('storage');
    try { storage.assertHealthy(); }
    catch { runtime.storageFailed = true; runtime.denied = true; ++runtime.generation; notify('unavailable', null); throw new AuthFailure('storage'); }
  };
  const secure = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); }
    catch { runtime.storageFailed = true; runtime.denied = true; ++runtime.generation; notify('unavailable', null); throw new AuthFailure('storage'); }
  };
  const current = (expected: number, requireSession = false): void => {
    healthy();
    if (expected !== runtime.generation || (requireSession && runtime.denied)) throw new AuthFailure('invalid_session');
  };
  // Serialize SDK writes AND our marker/token cleanup, not just SDK auth calls.
  // A later explicit login waits until all earlier cleanup has completed.
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = runtime.mutations.then(operation);
    runtime.mutations = result.then(() => undefined, () => undefined);
    return result;
  };
  const checked = async <T>(operation: () => Promise<T>): Promise<T> => {
    healthy(); const result = await operation(); healthy(); return result;
  };
  const accept = async (session: Session | null, expected: number): Promise<AuthSession> => {
    current(expected);
    const value = identity(session); if (!value) throw new AuthFailure('invalid_session');
    await secure(() => storage.removeItem(logoutMarker));
    current(expected); runtime.denied = false; return value;
  };
  return {
    restore: () => checked(async () => {
      const expected = runtime.generation;
      if (runtime.denied || await secure(() => storage.getItem(logoutMarker))) return null;
      current(expected, true);
      const { data, error } = await client.auth.getSession(); current(expected, true); reject(error); return identity(data.session);
    }),
    signIn: (email, password) => {
      const expected = ++runtime.generation; runtime.denied = true;
      return enqueue(() => checked(async () => {
        current(expected);
        const { data, error } = await client.auth.signInWithPassword({ email, password }); current(expected);
        if (error?.code === 'invalid_credentials' || error?.code === 'email_not_confirmed') throw new AuthFailure('invalid_session');
        reject(error); return accept(data.session, expected);
      }));
    },
    verifyOwner: (session) => checked(async () => {
      const expected = runtime.generation; current(expected, true);
      if (await secure(() => storage.getItem(logoutMarker))) throw new AuthFailure('invalid_session');
      current(expected, true);
      const { data, error } = await client.auth.getUser(); current(expected, true); reject(error);
      if (!data.user || data.user.id !== session.userId) throw new AuthFailure('invalid_session');
      const response = await client.rpc('cv_owner_status');
      current(expected, true);
      reject(response.error);
      if (typeof response.data !== 'boolean') throw new AuthFailure('unavailable');
      return response.data;
    }),
    signOut: () => {
      ++runtime.generation; runtime.denied = true;
      return enqueue(() => checked(async () => {
        // Persist denial before revocation; failed logout must not restore cache.
        try {
          await secure(() => storage.setItem(logoutMarker, 'pending'));
          runtime.loggingOut = true;
          const { error } = await client.auth.signOut({ scope: 'local' }); reject(error);
        }
        finally {
          runtime.loggingOut = false;
          try { await secure(() => storage.removeItem(pendingLeadKey)); }
          finally { await secure(() => storage.removeItem('closevault.auth.session')); }
        }
        // Keep marker until explicit successful sign-in, even after success.
      }));
    },
    requestRecovery: (email) => checked(async () => {
      if (!recoveryRedirect) throw new AuthFailure('unavailable');
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirect }); reject(error);
    }),
    consumeRecovery: (url) => {
      const expected = ++runtime.generation; runtime.denied = true;
      return enqueue(() => checked(async () => {
        current(expected);
        const code = parseRecoveryCode(url, recoveryRedirect);
        let recovery = false;
        const subscription = client.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') recovery = true; });
        try {
          const { data, error } = await client.auth.exchangeCodeForSession(code); current(expected); reject(error);
          // SDK awaits PASSWORD_RECOVERY after matching its stored PKCE verifier.
          if (!recovery) { await secure(() => storage.setItem(logoutMarker, 'pending')); throw new AuthFailure('invalid_session'); }
          return accept(data.session, expected);
        } finally { subscription.data.subscription.unsubscribe(); }
      }));
    },
    updatePassword: (password) => {
      const expected = runtime.generation;
      return enqueue(() => checked(async () => { current(expected, true); const { error } = await client.auth.updateUser({ password }); current(expected, true); reject(error); }));
    },
    subscribe: (listener) => {
      runtime.listeners.add(listener);
      const { data } = client.auth.onAuthStateChange((event, session) => {
        try {
          if (event === 'SIGNED_OUT') {
            runtime.denied = true;
            if (!runtime.loggingOut) {
              ++runtime.generation;
              // Only storage operations in this queue; no recursive SDK logout.
              // Any stale SDK write finishes before cleanup; new login runs after it.
              void enqueue(async () => {
                await secure(() => storage.setItem(logoutMarker, 'pending'));
                try { await secure(() => storage.removeItem(pendingLeadKey)); }
                finally { await secure(() => storage.removeItem('closevault.auth.session')); }
              }).catch(() => { /* secure() already publishes fail-closed storage failure. */ });
            }
            notify('signed_out', null); return;
          }
          healthy();
          if (runtime.denied) return;
          if (event === 'PASSWORD_RECOVERY') listener('recovery', identity(session));
          else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') listener('session', identity(session));
        } catch { runtime.storageFailed = true; runtime.denied = true; ++runtime.generation; notify('unavailable', null); }
      });
      return () => { runtime.listeners.delete(listener); data.subscription.unsubscribe(); };
    },
  };
}

/** Factory only: no network/client creation at module import or in tests. */
export function createConfiguredAuth(): { gateway: AuthGateway; client: SupabaseClient<Database>; storage: SessionStorageAdapter; environment: string } {
  const config = parseAuthConfiguration(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const storage = Platform.OS === 'web' ? createWebSessionStorage(() => window.sessionStorage) : createSecureSessionStorage({
    available: () => SecureStore.isAvailableAsync(),
    get: (key) => SecureStore.getItemAsync(key),
    set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    remove: (key) => SecureStore.deleteItemAsync(key),
  });
  const client = createClient<Database>(config.url, config.publishableKey, {
    auth: { storage, storageKey: 'closevault.auth.session', persistSession: true,
      autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce', lock: processLock },
    global: { fetch: async (input, init) => {
      const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 20_000);
      try { return await fetch(input, { ...init, signal: abort.signal }); } finally { clearTimeout(timer); }
    } },
  });
  return { gateway: createAuthGateway(client, storage, approvedRecoveryRedirect, configuredRuntime), client, storage, environment: new URL(config.url).origin };
}
