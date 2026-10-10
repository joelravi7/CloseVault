import { z } from 'zod';
import { AuthFailure } from '@/domain/authentication';

export interface SessionStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  assertHealthy(): void;
}
export interface SecureStorageDriver {
  available(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
const manifestSchema = z.object({ generation: z.string().regex(/^[a-z0-9-]+$/), count: z.number().int().min(1).max(256) });
/** Secure chunks accommodate native keychain payload limits; pointer commits last. */
export function createSecureSessionStorage(driver: SecureStorageDriver): SessionStorageAdapter {
  let fault = false; let serial = 0; let queue: Promise<unknown> = Promise.resolve();
  const fail = (): never => { fault = true; throw new AuthFailure('storage', 'Secure session storage is unavailable.'); };
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(async () => { try { if (!(await driver.available())) return fail(); return await operation(); } catch { return fail(); } });
    queue = result.catch(() => undefined); return result;
  };
  const readManifest = async (key: string) => { const raw = await driver.get(key); return raw === null ? null : manifestSchema.parse(JSON.parse(raw)); };
  const chunkKey = (key: string, generation: string, index: number): string => `${key}.${generation}.${index}`;
  return {
    assertHealthy() { if (fault) fail(); },
    getItem: (key) => run(async () => {
      const manifest = await readManifest(key); if (!manifest) return null;
      const chunks = await Promise.all(Array.from({ length: manifest.count }, (_, i) => driver.get(chunkKey(key, manifest.generation, i))));
      if (chunks.some((chunk) => chunk === null)) return fail();
      return chunks.join('');
    }),
    setItem: (key, value) => run(async () => {
      const old = await readManifest(key); const points = Array.from(value);
      const count = Math.max(1, Math.ceil(points.length / 400)); if (count > 256) return fail();
      const generation = `${Date.now().toString(36)}-${(++serial).toString(36)}`;
      const keys: string[] = [];
      try {
        for (let i = 0; i < count; i++) { const name = chunkKey(key, generation, i); keys.push(name); await driver.set(name, points.slice(i * 400, (i + 1) * 400).join('')); }
        await driver.set(key, JSON.stringify({ generation, count }));
      } catch {
        // Invalidate the old pointer too: never restore an older session after a
        // failed token write. Fail closed if secure cleanup itself is unavailable.
        await driver.remove(key);
        for (const name of keys) await driver.remove(name);
        return fail();
      }
      if (old) for (let i = 0; i < old.count; i++) await driver.remove(chunkKey(key, old.generation, i));
    }),
    removeItem: (key) => run(async () => {
      const old = await readManifest(key); await driver.remove(key);
      if (old) for (let i = 0; i < old.count; i++) await driver.remove(chunkKey(key, old.generation, i));
    }),
  };
}
export function createWebSessionStorage(getStorage: () => Storage): SessionStorageAdapter {
  let fault = false;
  const run = <T>(operation: () => T): Promise<T> => { try { return Promise.resolve(operation()); } catch { fault = true; return Promise.reject(new AuthFailure('storage')); } };
  return {
    assertHealthy() { if (fault) throw new AuthFailure('storage'); },
    getItem: (key) => run(() => getStorage().getItem(key)),
    setItem: (key, value) => run(() => getStorage().setItem(key, value)),
    removeItem: (key) => run(() => getStorage().removeItem(key)),
  };
}
