/** Future persistence boundary; not connected to DemoDataProvider or Supabase. */
export interface CommandIdentity { commandId: string }
export interface VersionedLeadCommand extends CommandIdentity {
  leadId: string;
  expectedVersion: number;
}
export interface CreateLeadCommand extends CommandIdentity {
  fullName: string;
  phone?: string;
  email?: string;
  source?: string;
  initialSummary?: string;
  initialFollowUp?: { action: string; dueAt: string };
}
export interface EditLeadCommand extends VersionedLeadCommand {
  changes: { fullName?: string; phone?: string | null; email?: string | null; source?: string | null };
}
export interface CreateActivityCommand extends VersionedLeadCommand {
  kind: string;
  summary: string;
  occurredAt: string;
  // No inferred successful contact, stage or planning changes.
}
export interface CreateFollowUpCommand extends VersionedLeadCommand {
  action: string;
  dueAt: string;
  // Primary-task selection remains an explicit decision before implementation.
}
export interface CancelFollowUpCommand extends CommandIdentity {
  followUpId: string;
  expectedVersion: number;
  reason: string;
  replacement: { action: string; dueAt: string };
}
export interface CloseLeadLostCommand extends VersionedLeadCommand { reason: string }
export interface CreateLeadResult { leadId: string; leadVersion: number; followUpId: string | null }
export interface CancelFollowUpResult { originalId: string; replacementId: string; leadVersion: number }
export type DatabaseCommandErrorCode =
  | 'unauthorized' | 'invalid_command' | 'not_found' | 'version_conflict'
  | 'command_conflict' | 'terminal_follow_up' | 'inactive_lead'
  | 'unavailable' | 'uncertain_outcome' | 'not_implemented';

/** Only these operations have SQL implementations in Phase 4A. */
export interface FoundationCommandRepository {
  createLead(command: CreateLeadCommand): Promise<CreateLeadResult>;
  editLead(command: EditLeadCommand): Promise<{ leadId: string; leadVersion: number }>;
  cancelFollowUp(command: CancelFollowUpCommand): Promise<CancelFollowUpResult>;
}
/** Review contracts only: no executable adapter/RPC is supplied for these yet. */
export interface PendingCommandContracts {
  createActivity: CreateActivityCommand;
  createFollowUp: CreateFollowUpCommand;
  closeLeadLost: CloseLeadLostCommand;
}
