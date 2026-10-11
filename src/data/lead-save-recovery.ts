import { pendingLeadKey, pendingLeadSchema, canonicalJson, receiptRequest, snapshotSaveOperation, recoveredLeadSchema, type PendingLead, type CommandSaveOperation as SaveOperation, type RecoveredLead } from '@/domain/lead-save-recovery';
import type { SessionStorageAdapter } from './supabase/auth-storage';
import type { LeadRepository } from './contracts/lead-repository';
import { LeadFailure } from './supabase/lead-repository';
import { z } from 'zod';

export type RecoveryState = { status: 'loading' | 'ready' | 'saving' | 'checking' | 'uncertain' | 'recovered' | 'rejected' | 'blocked'; pending?: PendingLead; result?: RecoveredLead; message?: string };
export interface LeadSaveRecovery {
  state(): RecoveryState;
  listen(listener: () => void): () => void;
  load(): Promise<void>;
  save(operation: SaveOperation): Promise<RecoveredLead>;
  reconcile(): Promise<RecoveredLead | null>;
}
export interface RecoveryOptions { storage: SessionStorageAdapter; owner: string; environment: string; repository: LeadRepository; active: () => boolean; digest: (value: string) => Promise<string>; refresh: () => Promise<void> }
const receiptSchema = z.object({ command_id: z.uuid(), owner_id: z.uuid(), command_type: z.string(), request: z.json(), result: z.json() });
let journalQueue: Promise<void> = Promise.resolve();
const runningScopes = new Set<string>();
function journalLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = journalQueue.then(operation); journalQueue = next.then(() => undefined, () => undefined); return next;
}
/** One unresolved operation at a time. No payload or credential is persisted. */
export function createLeadSaveRecovery(o: RecoveryOptions): LeadSaveRecovery {
  const scope = o.environment + '\u0000' + o.owner;
  let state: RecoveryState = { status: 'loading' }; let busy = false;
  const listeners = new Set<() => void>();
  const publish = (next: RecoveryState) => { if (!o.active()) return; state = next; for (const l of listeners) { if (!o.active()) break; try { l(); } catch { /* A view subscriber cannot alter command execution. */ } } };
  const guard = () => { if (!o.active()) throw new LeadFailure('unauthorized', 'Private access has ended.'); };
  const blocked = (message: string): never => { throw new LeadFailure('unavailable', message); };
  const getReceipt = (id: string) => { if (!o.repository.receipt) return Promise.reject(new LeadFailure('unavailable', 'Receipt access is unavailable.')); return o.repository.receipt(id); };
  async function read(): Promise<PendingLead | null> {
    o.storage.assertHealthy(); const raw = await o.storage.getItem(pendingLeadKey); guard();
    if (raw === null) return null;
    const entry = pendingLeadSchema.parse(JSON.parse(raw));
    if (entry.owner !== o.owner || entry.environment !== o.environment) blocked('Pending save belongs to a different account or environment. Sign out to clear private recovery state.');
    return entry;
  }
  async function clear(entry: PendingLead): Promise<void> {
    await journalLock(async () => {
      const stored = await read(); if (!stored || canonicalJson(stored) !== canonicalJson(entry)) blocked('Pending save changed. Check its outcome again.');
      guard(); await o.storage.removeItem(pendingLeadKey); guard();
      const remaining = await o.storage.getItem(pendingLeadKey); guard();
      if (remaining !== null) blocked('Recovery cleanup could not be verified.');
    });
  }
  const safelyBlocked = () => publish({ status: 'blocked', pending: state.pending, message: 'Unable to reconcile safely. No new save is permitted. Check again or sign out; sign-out clears local recovery metadata, not the server operation.' });
  const api: LeadSaveRecovery = {
    state: () => state,
    listen: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    load: async () => {
      if (busy) return; busy = true;
      try { guard(); const pending = await read(); if (!pending && state.pending) blocked('Local recovery metadata was lost. The outcome remains unknown.'); publish(pending ? { status: 'uncertain', pending, message: 'A previous save has an unknown outcome. Check the server before creating another submission.' } : { status: 'ready' }); }
      catch { safelyBlocked(); } finally { busy = false; }
    },
    save: async operation => {
      guard();
      if (!o.repository.writable) throw new LeadFailure('read_only', 'Hosted lead writes remain disabled.');
      if (busy || runningScopes.has(scope)) throw new LeadFailure('unavailable', 'A save or recovery check is already running.');
      busy = true; runningScopes.add(scope); let entry: PendingLead | null = null; let transmitted = false; let retained = false;
      try {
        // Validate/hash BEFORE journal write. Invalid form commands never enter the journal.
        operation = snapshotSaveOperation(operation);
        const request = receiptRequest(operation); const digest = await o.digest(canonicalJson(request)); guard();
        const candidate = pendingLeadSchema.parse({ schema: 1, owner: o.owner, environment: o.environment, commandId: operation.command.commandId, kind: operation.kind === 'create' ? 'create_lead' : operation.kind === 'edit' ? 'edit_lead' : 'cancel_follow_up', digest, ...(operation.kind === 'edit' ? { leadId: operation.command.leadId } : operation.kind === 'cancel' ? { leadId: operation.leadId, followUpId: operation.command.followUpId } : {}) });
        entry = await journalLock(async () => {
          const stored = await read(); retained = stored !== null;
          if (!stored && state.pending) blocked('Local recovery metadata was lost. Do not submit again.');
          if (stored && canonicalJson(stored) !== canonicalJson(candidate)) blocked('Resolve the previous save before starting another operation.');
          if (!stored) await o.storage.setItem(pendingLeadKey, JSON.stringify(candidate));
          if (!o.active()) {
            // A storage write may finish after logout cleanup. Remove only our exact marker.
            if (await o.storage.getItem(pendingLeadKey) === JSON.stringify(candidate)) await o.storage.removeItem(pendingLeadKey);
            guard();
          }
          const verified = await read(); if (!verified || canonicalJson(verified) !== canonicalJson(candidate)) blocked('Recovery state was not safely stored. Nothing was sent.');
          return candidate;
        });
        publish({ status: 'saving', pending: entry, message: 'Saving…' }); guard(); transmitted = true;
        const result = operation.kind === 'create' ? await o.repository.createLead(operation.command, operation.confirmed) : operation.kind === 'edit' ? await o.repository.editLead(operation.command, operation.confirmed) : o.repository.cancelFollowUp ? await o.repository.cancelFollowUp(operation.command, operation.leadId) : blocked('Cancellation is unavailable.');
        recoveredLeadSchema.parse({ lead_id: result.leadId, lead_version: result.leadVersion, ...('followUpId' in result ? { follow_up_id: result.followUpId } : {}) });
        if ((operation.kind === 'create' && !('followUpId' in result && result.followUpId)) || (operation.kind === 'edit' && result.leadId !== operation.command.leadId) || (operation.kind === 'cancel' && (result.leadId !== operation.leadId || !('followUpId' in result && result.followUpId) || result.followUpId === operation.command.followUpId))) blocked('The save result could not be verified.');
        guard(); await o.refresh(); guard(); await clear(entry); guard();
        publish({ status: 'recovered', result, message: 'Saved successfully.' }); return result;
      } catch (e) {
        const definite = e instanceof LeadFailure && ['invalid_command', 'version_conflict', 'command_conflict', 'not_found', 'duplicate_confirmation', 'read_only'].includes(e.code);
        if (transmitted && definite && entry) {
          // A previous uncertain attempt may have a receipt: do not erase its identity.
          const receipt = await getReceipt(entry.commandId).catch(() => undefined);
          if (receipt === null && !retained) { try { await clear(entry); publish({ status: 'rejected', message: 'This attempt was definitely rejected. Review the details before a new save.' }); } catch { safelyBlocked(); } }
          else publish({ status: 'uncertain', pending: entry, message: 'A prior attempt may have completed. Check the server outcome.' });
        } else if (entry && transmitted) publish({ status: 'uncertain', pending: entry, message: 'The save outcome is unknown. Check the server or explicitly retry the unchanged request while this form remains open.' });
        else if (!entry && !state.pending && e instanceof z.ZodError) publish({ status: 'rejected', message: 'Invalid lead details. Nothing was sent.' });
        else safelyBlocked();
        throw e instanceof LeadFailure ? e : new LeadFailure(e instanceof z.ZodError && !transmitted ? 'invalid_command' : transmitted ? 'uncertain_outcome' : 'unavailable', transmitted ? 'The save outcome is unknown. Check the server outcome.' : 'Nothing was sent. Check lead details and recovery storage.');
      } finally { busy = false; runningScopes.delete(scope); }
    },
    reconcile: async () => {
      guard(); if (busy || runningScopes.has(scope)) throw new LeadFailure('unavailable', 'A save or recovery check is already running.'); busy = true; runningScopes.add(scope);
      try {
        const entry = await read(); if (!entry) {
          if (state.pending) blocked('Local recovery metadata was lost. The server outcome remains unknown.');
          publish({ status: 'ready' }); return null;
        }
        publish({ status: 'checking', pending: entry, message: 'Checking server outcome…' });
        const raw = await getReceipt(entry.commandId); guard();
        if (raw === null) { publish({ status: 'uncertain', pending: entry, message: 'No receipt is visible yet. This does not prove the save failed. Keep checking; do not create another submission.' }); return null; }
        const receipt = receiptSchema.parse(raw);
        if (receipt.owner_id !== entry.owner || receipt.command_id !== entry.commandId || receipt.command_type !== entry.kind || await o.digest(canonicalJson(receipt.request)) !== entry.digest) blocked('Server receipt does not match the pending operation.');
        if (entry.kind === 'cancel_follow_up') {
          const result = z.object({ original_id: z.uuid(), replacement_id: z.uuid(), lead_version: z.number().int().positive() }).strict().parse(receipt.result);
          if (result.original_id !== entry.followUpId || result.replacement_id === result.original_id || !entry.leadId) blocked('Server cancellation result does not match the pending operation.');
          // The original task remains readable; independently verify its lead association.
          const detail = await o.repository.detail(entry.leadId!); guard();
          if (detail.lead.owner_id !== entry.owner || !detail.followUps.some(v => v.id === result.original_id && v.lead_id === entry.leadId && v.owner_id === entry.owner && v.status === 'cancelled') || !detail.followUps.some(v => v.id === result.replacement_id && v.lead_id === entry.leadId && v.owner_id === entry.owner && v.replaces_follow_up_id === result.original_id)) blocked('Cancellation receipt association could not be verified.');
          const value = { leadId: entry.leadId!, leadVersion: result.lead_version, followUpId: result.replacement_id };
          guard(); await o.refresh(); guard(); await clear(entry); guard(); publish({ status: 'recovered', result: value, message: 'Cancellation and replacement confirmed.' }); return value;
        }
        const result = recoveredLeadSchema.parse(receipt.result);
        if ((entry.kind === 'create_lead' && !result.follow_up_id) || (entry.kind === 'edit_lead' && (result.lead_id !== entry.leadId || result.follow_up_id !== undefined))) blocked('Server result does not match the pending operation.');
        const value = { leadId: result.lead_id, leadVersion: result.lead_version, ...(entry.kind === 'create_lead' ? { followUpId: result.follow_up_id } : {}) };
        guard(); await o.refresh(); guard(); await clear(entry); guard(); publish({ status: 'recovered', result: value, message: 'Recovered successfully.' }); return value;
      } catch { safelyBlocked(); return null; } finally { busy = false; runningScopes.delete(scope); }
    },
  };
  return api;
}
