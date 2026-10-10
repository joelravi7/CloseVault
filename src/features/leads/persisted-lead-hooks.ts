import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeadPageRequest, LeadRepository } from '@/data/contracts/lead-repository';
import type { CreateLeadCommand, EditLeadCommand } from '@/data/contracts/database-commands';
import { useAuth } from '@/providers/auth-provider';
import { useLeadRepository } from '@/providers/lead-repository-provider';
import { useSyncExternalStore } from 'react';
import type { RecoveryState } from '@/data/lead-save-recovery';
import { LeadFailure } from '@/data/supabase/lead-repository';

export function useLeadScope() {
  const { state } = useAuth();
  const owner = state.status === 'authenticated' ? state.userId : null;
  return { owner, repository: useLeadRepository() };
}
export function useLeadList(request: LeadPageRequest) {
  const { owner, repository } = useLeadScope();
  return useQuery({ queryKey: ['private-leads', owner, 'list', request], enabled: !!owner && !!repository, queryFn: ({ signal }) => repository!.list(request, signal) });
}
export function useLeadDetail(id?: string) {
  const { owner, repository } = useLeadScope();
  return useQuery({ queryKey: ['private-leads', owner, 'detail', id], enabled: !!id && !!owner && !!repository, queryFn: ({ signal }) => repository!.detail(id!, signal) });
}
export async function refreshLeadQueries(client: ReturnType<typeof useQueryClient>, owner: string): Promise<void> {
  await client.invalidateQueries({ queryKey: ['private-leads', owner] });
}
export type LeadSubmission = { kind: 'create'; command: CreateLeadCommand; confirmed: boolean } | { kind: 'edit'; command: EditLeadCommand; confirmed: boolean };
export function executeLeadSubmission(repository: LeadRepository, submission: LeadSubmission) {
  if (repository.recovery) return repository.recovery.save(submission);
  if (repository.writable && repository.receipt) throw new LeadFailure('unavailable', 'Save recovery is unavailable. Nothing was sent.');
  return submission.kind === 'create' ? repository.createLead(submission.command, submission.confirmed) : repository.editLead(submission.command, submission.confirmed);
}
const noRecovery: RecoveryState = { status: 'ready' };
export function useLeadRecovery() {
  const { repository } = useLeadScope(); const recovery = repository?.recovery;
  const state = useSyncExternalStore(recovery ? listener => recovery.listen(listener) : () => () => undefined, recovery ? () => recovery.state() : () => noRecovery, () => noRecovery);
  return { recovery, state };
}
export function useLeadSave() {
  const { owner, repository } = useLeadScope();
  const queryClient = useQueryClient();
  return useMutation({ retry: false, mutationFn: (submission: LeadSubmission) => {
    if (!repository || !owner) throw new Error('Lead access is unavailable.');
    return executeLeadSubmission(repository, submission);
  }, onSuccess: async () => { if (owner && !repository?.recovery) await refreshLeadQueries(queryClient, owner); } });
}
