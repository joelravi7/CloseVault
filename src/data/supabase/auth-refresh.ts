interface RefreshClient {
  auth: { startAutoRefresh(): Promise<void>; stopAutoRefresh(): Promise<void> };
}
interface RefreshState { owner: symbol; queue: Promise<void> }
const key = Symbol.for('closevault.auth-refresh.v1');
const registry = globalThis as typeof globalThis & { [key]?: WeakMap<object, RefreshState> };
const states = registry[key] ?? (registry[key] = new WeakMap<object, RefreshState>());

/** Serialize refresh work across provider remounts sharing one SDK client. */
export function claimAuthRefresh(client: RefreshClient, onFailure: () => void): { setActive(active: boolean): void; release(): void } {
  const owner = Symbol('refresh-owner');
  const state = states.get(client) ?? { owner, queue: Promise.resolve() };
  state.owner = owner; states.set(client, state);
  let released = false;
  const enqueue = (enabled: boolean): void => {
    state.queue = state.queue.then(async () => {
      if (state.owner !== owner) return;
      if (enabled && !released) await client.auth.startAutoRefresh();
      else await client.auth.stopAutoRefresh();
    }).catch(() => {
      if (state.owner === owner && !released) onFailure();
    }).catch(() => undefined);
  };
  return {
    setActive: (active) => { if (!released) enqueue(active); },
    release: () => { if (!released) { released = true; enqueue(false); } },
  };
}
