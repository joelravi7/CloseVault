import { createAuthGateway } from '../auth-gateway';
import { createWebSessionStorage } from '../auth-storage';
import { pendingLeadKey } from '@/domain/lead-save-recovery';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
function setup() {
  const values = new Map<string,string>([[pendingLeadKey, 'Fictional metadata'], ['closevault.auth.session', 'Fictional session']]);
  const storage = createWebSessionStorage(() => ({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string,v: string) => { values.set(k,v); }, removeItem: (k: string) => { values.delete(k); } } as Storage));
  let emit!: (event: string, session: null) => void;
  const auth = { signOut: jest.fn(async () => ({ error: null })), onAuthStateChange: jest.fn(callback => { emit = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; }) };
  const gateway = createAuthGateway({ auth } as unknown as SupabaseClient<Database>, storage);
  return { values, storage, gateway, emit: () => emit('SIGNED_OUT', null), auth };
}
test('explicit security sign-out clears pending metadata and session even if server logout fails', async () => { const s = setup(); s.auth.signOut.mockRejectedValueOnce(new Error('Fictional network outage')); await expect(s.gateway.signOut()).rejects.toThrow(); expect(s.values.has(pendingLeadKey)).toBe(false); expect(s.values.has('closevault.auth.session')).toBe(false); expect(s.values.has('closevault.auth.logout-pending')).toBe(true); });
test('pending cleanup failure never prevents attempted session cleanup or reopens access', async () => { const s = setup(); const remove = s.storage.removeItem; jest.spyOn(s.storage, 'removeItem').mockImplementation(async key => { if (key === pendingLeadKey) throw new Error('Fictional storage failure'); return remove(key); }); await expect(s.gateway.signOut()).rejects.toThrow(); expect(s.values.has('closevault.auth.session')).toBe(false); await expect(s.gateway.restore()).rejects.toThrow(); });
test('terminal SDK sign-out schedules private journal cleanup without unhandled rejection', async () => { const s = setup(); const unlisten = s.gateway.subscribe(jest.fn()); s.emit(); for (let i=0;i<40;i++) await Promise.resolve(); expect(s.values.has(pendingLeadKey)).toBe(false); expect(s.values.has('closevault.auth.session')).toBe(false); expect(await s.gateway.restore()).toBeNull(); unlisten(); });
