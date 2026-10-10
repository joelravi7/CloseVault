import { z } from 'zod';
import type { CreateLeadCommand, EditLeadCommand } from '@/data/contracts/database-commands';
import { createLeadFormSchema, editLeadFormSchema } from './lead-persistence';

export const pendingLeadKey = 'closevault.crm.pending-lead.v1';
export const pendingLeadSchema = z.object({ schema: z.literal(1), owner: z.uuid(), environment: z.string().min(1).max(300), commandId: z.uuid(), kind: z.enum(['create_lead', 'edit_lead']), digest: z.string().regex(/^[a-f0-9]{64}$/), leadId: z.uuid().optional() }).strict();
export type PendingLead = z.infer<typeof pendingLeadSchema>;
export type SaveOperation = { kind: 'create'; command: CreateLeadCommand; confirmed: boolean } | { kind: 'edit'; command: EditLeadCommand; confirmed: boolean };
/** Detach all supported request fields before the first await; never persist this payload. */
export function snapshotSaveOperation(operation: SaveOperation): SaveOperation {
  if (operation.kind === 'create') {
    const c = operation.command;
    return Object.freeze({ kind: 'create', confirmed: operation.confirmed, command: Object.freeze({ commandId: c.commandId, fullName: c.fullName, phone: c.phone, email: c.email, source: c.source, initialSummary: c.initialSummary, initialFollowUp: c.initialFollowUp ? Object.freeze({ action: c.initialFollowUp.action, dueAt: c.initialFollowUp.dueAt }) : undefined }) });
  }
  const c = operation.command;
  return Object.freeze({ kind: 'edit', confirmed: operation.confirmed, command: Object.freeze({ commandId: c.commandId, leadId: c.leadId, expectedVersion: c.expectedVersion, changes: Object.freeze({ fullName: c.changes.fullName, phone: c.changes.phone, email: c.changes.email, source: c.changes.source }) }) });
}
export interface RecoveredLead { leadId: string; leadVersion: number; followUpId?: string | null }
export const recoveredLeadSchema = z.object({ lead_id: z.uuid(), lead_version: z.number().int().positive(), follow_up_id: z.uuid().nullable().optional() }).strict();
/** Deterministic JSON for matching jsonb objects regardless of PostgreSQL key ordering. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
  const result = JSON.stringify(value); if (result === undefined) throw new Error('Invalid recovery value.'); return result;
}
/** Matches the existing RPC's pre-trim receipt request, after adapter validation. */
export function receiptRequest(operation: SaveOperation): Record<string, unknown> {
  z.uuid().parse(operation.command.commandId);
  if (operation.kind === 'create') {
    const c = operation.command;
    const f = createLeadFormSchema.parse({ fullName: c.fullName, phone: c.phone, email: c.email ?? '', source: c.source, inquiry: c.initialSummary, nextAction: c.initialFollowUp?.action, followUpAt: c.initialFollowUp?.dueAt });
    return { name: f.fullName, phone: f.phone, email: f.email, source: f.source, summary: f.inquiry, action: f.nextAction, due: f.followUpAt.replace(/\.(\d{3})Z$/, '.$1000Z') };
  }
  const c = operation.command; const f = editLeadFormSchema.parse(c.changes);
  return { lead: z.uuid().parse(c.leadId), version: z.number().int().positive().parse(c.expectedVersion), changes: { full_name: f.fullName, phone: f.phone, email: f.email || null, source: f.source } };
}
