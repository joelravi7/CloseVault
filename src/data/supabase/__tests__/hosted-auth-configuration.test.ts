import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { approvedRecoveryRedirect, isExplicitDemo } from '../auth-config';
import { createConfiguredAuth } from '../auth-gateway';
import type { Database } from '../database.types';

jest.mock('@supabase/supabase-js', () => ({
  ...jest.requireActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js'),
  createClient: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'fictional-accessibility',
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Approved public endpoint, but NEVER a real API key, owner identity or session.
// SDK creation is mocked: these tests cannot send hosted requests.
const url = 'https://uxecsfrnmlbugkuhjfeu.supabase.co';
const fictionalKey = 'sb_publishable_fictional_configuration_test_only';
const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = url;
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = fictionalKey;
  jest.mocked(createClient<Database>).mockReturnValue({} as SupabaseClient<Database>);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
  else Reflect.deleteProperty(globalThis, 'window');
});

it.each([
  [undefined, fictionalKey],
  [url, undefined],
  [url, ''],
  [url, 'sb_secret_fictional_not_a_key'],
  [url, 'fictional-legacy-key'],
  ['http://uxecsfrnmlbugkuhjfeu.supabase.co', fictionalKey],
  [`${url}/rest/v1`, fictionalKey],
  [`${url}?unexpected=value`, fictionalKey],
  ['https://fictional:invalid@uxecsfrnmlbugkuhjfeu.supabase.co', fictionalKey],
])('rejects invalid configuration case %# before SDK creation', (endpoint, key) => {
  if (endpoint === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = endpoint;
  if (key === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
  expect(() => createConfiguredAuth()).toThrow();
  expect(createClient).not.toHaveBeenCalled();
});

it.each(['ios', 'android'] as const)('uses approved endpoint and secure native storage on %s', async (platform) => {
  jest.replaceProperty(Platform, 'OS', platform);
  createConfiguredAuth();
  const [endpoint, key, options] = jest.mocked(createClient<Database>).mock.calls[0];
  expect(endpoint).toBe(url);
  expect(key).toBe(fictionalKey);
  expect(options?.auth).toMatchObject({ storageKey: 'closevault.auth.session', persistSession: true,
    autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce', lock: processLock });
  const storage = options?.auth?.storage;
  expect(storage).toBeDefined();
  await storage!.setItem('fictional.session', 'fictional-session-data');
  expect(SecureStore.isAvailableAsync).toHaveBeenCalled();
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), expect.any(String),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
});

it('uses only tab sessionStorage for configured web sessions', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const sessionStorage = { getItem: jest.fn().mockReturnValue(null), setItem: jest.fn(), removeItem: jest.fn() };
  const localStorage = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage, localStorage } });
  createConfiguredAuth();
  const [endpoint, key, options] = jest.mocked(createClient<Database>).mock.calls[0];
  expect(endpoint).toBe(url);
  expect(key).toBe(fictionalKey);
  const storage = options?.auth?.storage;
  expect(storage).toBeDefined();
  await storage!.setItem('fictional.session', 'fictional-session-data');
  await storage!.getItem('fictional.session');
  await storage!.removeItem('fictional.session');
  expect(sessionStorage.setItem).toHaveBeenCalledWith('fictional.session', 'fictional-session-data');
  expect(sessionStorage.getItem).toHaveBeenCalledWith('fictional.session');
  expect(sessionStorage.removeItem).toHaveBeenCalledWith('fictional.session');
  expect(localStorage.setItem).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

it('hosted development mode is never an implicit demo fallback', () => {
  expect(isExplicitDemo('development', true)).toBe(false);
  expect(isExplicitDemo(undefined, true)).toBe(false);
  expect(isExplicitDemo('demo', false)).toBe(false);
  expect(isExplicitDemo('demo', true)).toBe(true);
});

it('keeps password recovery disabled for the hosted configuration', () => {
  expect(approvedRecoveryRedirect).toBeUndefined();
});
