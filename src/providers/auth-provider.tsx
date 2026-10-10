import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { isExplicitDemo } from '@/data/supabase/auth-config';
import { createConfiguredAuth } from '@/data/supabase/auth-gateway';
import { AuthController, type AuthState } from '@/domain/authentication';

interface AuthContextValue { state: AuthState; demo: boolean; controller: AuthController | null }
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [demo] = useState(() => isExplicitDemo(process.env.EXPO_PUBLIC_APP_ENV, __DEV__));
  const [auth, setAuth] = useState<{ state: AuthState; controller: AuthController | null }>({ state: { status: 'initializing' }, controller: null });
  useEffect(() => {
    if (demo) return;
    let alive = true;
    let active = true;
    const disposers: (() => void)[] = [];
    const cleanup = () => {
      for (const dispose of disposers.splice(0).reverse()) {
        try { dispose(); } catch { /* cleanup must not reopen access or reject */ }
      }
    };
    try {
      const { gateway, client } = createConfiguredAuth();
      const controller = new AuthController(gateway, () => {
        void queryClient.cancelQueries().catch(() => undefined); queryClient.clear();
      });
      disposers.push(() => controller.stop());
      const unlisten = controller.listen((next) => { if (alive && active) setAuth({ state: next, controller }); });
      disposers.push(unlisten);
      // Serialize SDK timer operations, including cleanup after an in-flight start.
      // The SDK methods return promises; never leave their rejections unhandled.
      let refreshQueue = Promise.resolve();
      const manageRefresh = (enabled: boolean) => {
        refreshQueue = refreshQueue.then(async () => {
          if (enabled && alive && active) await client.auth.startAutoRefresh();
          else await client.auth.stopAutoRefresh();
        }).catch(() => { if (alive && active) controller.verificationUnavailable(); });
      };
      disposers.push(() => manageRefresh(false));
      controller.start();
      const timer = setInterval(() => controller.expire(), 1000);
      disposers.push(() => clearInterval(timer));
      const refresh = () => { manageRefresh(true); void controller.restore(); };
      manageRefresh(true);
      const appState = AppState.addEventListener('change', (next) => {
        if (next === 'active') refresh(); else manageRefresh(false);
      });
      disposers.push(() => appState.remove());
      const onFocus = () => refresh();
      if (Platform.OS === 'web') {
        window.addEventListener('focus', onFocus);
        disposers.push(() => window.removeEventListener('focus', onFocus));
      }
      // Never copy callback contents into auth context, logs or query caches.
      const consume = (url: string | null) => {
        if (!url || !alive || !active) return;
        if (url.includes('reset-password')) {
          if (Platform.OS === 'web') window.history.replaceState(null, '', window.location.pathname);
          void controller.consumeRecovery(url).catch(() => { /* controller exposes only generic errors */ });
        }
      };
      void Linking.getInitialURL().then(consume).catch(() => undefined);
      const links = Linking.addEventListener('url', ({ url }) => consume(url));
      disposers.push(() => links.remove());
    } catch {
      active = false; cleanup();
      void Promise.resolve().then(() => { if (alive) setAuth({ controller: null, state: { status: 'verification_unavailable', message: 'Authentication configuration or secure storage is unavailable. No demo fallback is enabled.' } }); });
    }
    return () => { alive = false; active = false; cleanup(); };
  }, [demo, queryClient]);
  return <AuthContext.Provider value={{ ...auth, demo }}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider is required.'); return value;
}
