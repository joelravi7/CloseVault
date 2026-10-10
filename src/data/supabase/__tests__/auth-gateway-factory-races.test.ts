import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createConfiguredAuth } from '../auth-gateway';
import type { Database } from '../database.types';

jest.mock('@supabase/supabase-js', () => ({ ...jest.requireActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js'), createClient: jest.fn() }));
jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'fixture', isAvailableAsync: jest.fn().mockResolvedValue(true), getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null), setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }), deleteItemAsync: jest.fn(async (key: string) => { values.delete(key); }) };
});
const session = { user: { id: '00000000-0000-4000-8000-000000000001' }, expires_at: 2_000_000_000 } as Session;
function sdk() {
  let callback!: (event: string, session: Session | null) => void;
  const auth = { getSession: jest.fn().mockResolvedValue({ data: { session }, error: null }), signInWithPassword: jest.fn().mockResolvedValue({ data: { session }, error: null }), onAuthStateChange: jest.fn((listener) => { callback = listener; return { data: { subscription: { unsubscribe: jest.fn() } } }; }) };
  return { client: { auth } as unknown as SupabaseClient<Database>, auth, emit: () => callback('SIGNED_OUT', null) };
}
it('configured factory remount shares denial and cleanup ordering despite distinct storage adapters', async () => {
  const oldUrl = process.env.EXPO_PUBLIC_SUPABASE_URL; const oldKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://fixture.invalid'; process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional_test_only';
  try {
    const old = sdk(); const next = sdk(); jest.mocked(createClient<Database>).mockReturnValueOnce(old.client).mockReturnValueOnce(next.client);
    let finish!: () => void; old.auth.signInWithPassword.mockImplementationOnce(async () => { await new Promise<void>((resolve) => { finish = resolve; }); return { data: { session }, error: null }; });
    const first = createConfiguredAuth(); const unsubscribe = first.gateway.subscribe(jest.fn()); const login = first.gateway.signIn('fictional@example.invalid', 'fictional password').catch(() => undefined);
    for (let index = 0; index < 20; index++) await Promise.resolve(); old.emit(); unsubscribe();
    const second = createConfiguredAuth(); expect(await second.gateway.restore()).toBeNull(); expect(next.auth.getSession).not.toHaveBeenCalled();
    const newLogin = second.gateway.signIn('fictional@example.invalid', 'fictional password'); for (let index = 0; index < 20; index++) await Promise.resolve(); expect(next.auth.signInWithPassword).not.toHaveBeenCalled();
    finish(); await login; expect(await newLogin).toMatchObject({ userId: session.user.id }); expect(await second.gateway.restore()).toMatchObject({ userId: session.user.id });
  } finally {
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL; else process.env.EXPO_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
