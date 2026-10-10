import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import type { LeadRepository } from '@/data/contracts/lead-repository';
import { createConfiguredAuth } from '@/data/supabase/auth-gateway';
import { createHostedLeadRepository, LeadFailure } from '@/data/supabase/lead-repository';
import { useAuth } from './auth-provider';

const LeadRepositoryContext = createContext<LeadRepository | null>(null);
export const LeadRepositoryTestProvider = LeadRepositoryContext.Provider;
export function LeadRepositoryProvider({ children }: PropsWithChildren) {
  const { controller, state, demo } = useAuth();
  const ownerId = state.status === 'authenticated' ? state.userId : null;
  const [repository, setRepository] = useState<LeadRepository | null>(null);
  useEffect(() => {
    if (demo || !controller || state.status !== 'authenticated') return;
    let alive = true;
    try {
      const { client, gateway } = createConfiguredAuth();
      const owner = state.userId;
      const unsubscribe = controller.listen(next => { if (next.status !== 'authenticated' || next.userId !== owner) alive = false; });
      const active = () => { const next = controller.getState(); return alive && next.status === 'authenticated' && next.userId === owner; };
      const repo = createHostedLeadRepository(client, async () => {
        const current = controller.getState();
        if (!active() || current.status !== 'authenticated' || !await gateway.verifyOwner(current)) throw new LeadFailure('unauthorized', 'Owner access could not be verified.');
        return owner;
      }, active);
      void Promise.resolve().then(() => { if (alive) setRepository(repo); });
      return () => { alive = false; unsubscribe(); void client.auth.stopAutoRefresh().catch(() => undefined); };
    } catch { /* render a generic unavailable state, never demo fixtures */ }
    return () => { alive = false; };
  }, [controller, demo, state, ownerId]);
  if (demo || state.status !== 'authenticated') return null;
  return <LeadRepositoryContext.Provider value={repository}>{children}</LeadRepositoryContext.Provider>;
}
export function useLeadRepository(): LeadRepository | null { return useContext(LeadRepositoryContext); }
