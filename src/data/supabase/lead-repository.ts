import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createLeadFormSchema, editLeadFormSchema, normalizeMobile, persistedLeadStages } from '@/domain/lead-persistence';
import { activeFollowUpStatuses, cancelCommandSchema, colomboDayWindow } from '@/domain/daily-follow-ups';
import type { CreateLeadCommand, EditLeadCommand } from '../contracts/database-commands';
import type { LeadRepository, PersistedLead } from '../contracts/lead-repository';
import type { Database } from './database.types';

export class LeadFailure extends Error {
  constructor(public readonly code: 'invalid_command' | 'unauthorized' | 'unavailable' | 'uncertain_outcome' | 'version_conflict' | 'command_conflict' | 'not_found' | 'read_only' | 'duplicate_confirmation', message: string) { super(message); }
}
export function leadError(error: unknown, mutation = false): LeadFailure {
  if (error instanceof LeadFailure) return error;
  const parsed = z.object({ code: z.string(), message: z.string() }).safeParse(error);
  if (parsed.success) {
    const { code, message } = parsed.data;
    if (code === '42501' || code.startsWith('PGRST30')) return new LeadFailure('unauthorized', 'Your access could not be verified. Sign in again.');
    if (code === '40001' && message === 'CV_VERSION_CONFLICT') return new LeadFailure('version_conflict', 'This lead changed elsewhere. Reload it before editing.');
    if (message === 'CV_COMMAND_CONFLICT') return new LeadFailure('command_conflict', 'This command was already used with different details. Reload before continuing.');
    if (code === 'P0002') return new LeadFailure('not_found', 'This lead is unavailable.');
    if (code === '22023' || code === '22007') return new LeadFailure('invalid_command', 'The command was rejected. Check the lead details.');
  }
  return new LeadFailure(mutation ? 'uncertain_outcome' : 'unavailable', mutation ? 'The save result is unknown. Retry the unchanged command; do not create a second submission.' : 'Lead data is unavailable. Please retry.');
}
const uuid = z.uuid();
const result = z.object({ lead_id: uuid, lead_version: z.number().int().positive(), follow_up_id: uuid.nullable().optional() });
const row = z.object({ id: uuid, owner_id: uuid, full_name: z.string(), phone: z.string().nullable(), email: z.string().nullable(), source: z.string().nullable(), stage: z.enum(persistedLeadStages), primary_follow_up_id: uuid.nullable(), closure_reason: z.string().nullable(), closed_at: z.string().nullable(), archived_at: z.string().nullable(), version: z.number().int().positive(), created_at: z.string(), updated_at: z.string() });
const followRow = z.object({ id: uuid, owner_id: uuid, lead_id: uuid, title: z.string(), due_at: z.string(), status: z.enum(['upcoming', 'due', 'overdue', 'waiting_for_client', 'completed', 'cancelled', 'rescheduled']), outcome: z.string().nullable(), terminal_at: z.string().nullable(), cancellation_cause: z.string().nullable(), replaces_follow_up_id: uuid.nullable(), version: z.number().int().positive(), created_at: z.string(), updated_at: z.string() });
const activityRow = z.object({ id: uuid, owner_id: uuid, lead_id: uuid, command_id: uuid, kind: z.string(), summary: z.string(), occurred_at: z.string(), created_at: z.string(), details: z.json() });
// Escape PostgREST grammar and LIKE wildcards; arbitrary input never becomes a filter expression.
function literal(value: string): string { return value.trim().replace(/[\\%_"]/g, '\\$&'); }
type Authorization = () => Promise<string>;
function repository(client: SupabaseClient<Database>, authorize: Authorization, active: () => boolean, writable: boolean): LeadRepository {
  const guard = () => { if (!active()) throw new LeadFailure('unauthorized', 'Private access has ended.'); };
  async function run<T>(operation: (owner: string) => Promise<T>, mutation = false): Promise<T> {
    guard();
    try { const owner = uuid.parse(await authorize()); guard(); const value = await operation(owner); guard(); return value; }
    catch (error) { throw leadError(error, mutation); }
  }
  const readRows = (data: unknown, owner: string): PersistedLead[] => z.array(row).parse(data).map(item => { if (item.owner_id !== owner) throw new LeadFailure('unauthorized', 'Private access could not be verified.'); return item; });
  function scanEnd(count: number | null, offset: number, length: number, expected?: number): boolean {
    if (count === null || !Number.isSafeInteger(count) || count < 0 || (expected !== undefined && count !== expected) || (length === 0 && offset < count) || offset + length > count)
      throw new LeadFailure('unavailable', 'The complete dataset could not be verified. Retry before saving.');
    return offset + length === count;
  }
  const api: LeadRepository = {
    writable,
    followUps: (request, signal) => run(async owner => {
      z.object({ page: z.number().int().nonnegative(), bucket: z.enum(['today', 'overdue', 'upcoming']), at: z.iso.datetime() }).strict().parse(request);
      const window = colomboDayWindow(request.at);
      let query = client.from('follow_ups').select('*,lead:leads!follow_ups_lead_id_owner_id_fkey!inner(*)', { count: 'exact' })
        .eq('owner_id', owner).eq('lead.owner_id', owner).neq('lead.stage', 'lost').is('lead.archived_at', null)
        .in('status', [...activeFollowUpStatuses]).order('due_at', { ascending: true }).order('id', { ascending: true });
      if (request.bucket === 'today') query = query.gte('due_at', window.start).lt('due_at', window.end);
      else if (request.bucket === 'overdue') query = query.lt('due_at', window.start);
      else query = query.gte('due_at', window.end);
      query = query.range(request.page * 25, request.page * 25 + 24);
      if (signal) query = query.abortSignal(signal);
      const { data, error, count } = await query; if (error) throw error;
      const entries = z.array(followRow.extend({ lead: row })).parse(data);
      if (entries.some(v => v.owner_id !== owner || v.lead.owner_id !== owner || v.lead.id !== v.lead_id || v.lead.stage === 'lost' || v.lead.archived_at !== null || !(activeFollowUpStatuses as readonly string[]).includes(v.status) || !Number.isFinite(new Date(v.due_at).getTime()))) throw new LeadFailure('unauthorized', 'Private follow-up scope could not be verified.');
      if (count === null || entries.length !== Math.min(25, Math.max(0, count - request.page * 25))) throw new LeadFailure('unavailable', 'The requested follow-up page was incomplete. Please retry.');
      return { items: entries.map(({ lead, ...followUp }) => ({ lead, followUp })), total: count };
    }),
    cancelFollowUp: async (command, leadId) => {
      guard(); if (!writable) throw new LeadFailure('read_only', 'Hosted follow-up writes are not authorized.');
      const parsed = cancelCommandSchema.safeParse(command);
      if (!parsed.success || !uuid.safeParse(leadId).success) throw new LeadFailure('invalid_command', 'Complete the cancellation reason and replacement action/date.');
      const c = parsed.data;
      return run(async owner => {
        // Receipt replay is left to the atomic RPC, even when the original is now terminal.
        const { data: original, error: readError } = await client.from('follow_ups').select('id,owner_id,lead_id').eq('owner_id', owner).eq('id', c.followUpId).maybeSingle();
        if (readError) throw readError;
        if (!original || original.owner_id !== owner || original.lead_id !== leadId) throw new LeadFailure('not_found', 'This follow-up is unavailable for this lead.');
        guard(); // Session may have ended while the association read was in flight.
        const { data, error } = await client.rpc('cv_cancel_follow_up', { p_command_id: c.commandId, p_follow_up_id: c.followUpId, p_expected_version: c.expectedVersion, p_reason: c.reason, p_next_action: c.replacement.action, p_due_at: c.replacement.dueAt });
        if (error) throw error;
        const value = z.object({ original_id: uuid, replacement_id: uuid, lead_version: z.number().int().positive() }).strict().parse(data);
        if (value.original_id !== c.followUpId || value.replacement_id === c.followUpId) throw new LeadFailure('uncertain_outcome', 'Cancellation outcome could not be verified. Check the server receipt.');
        return { leadId, leadVersion: value.lead_version, followUpId: value.replacement_id };
      }, true);
    },
    receipt: commandId => run(async owner => {
      uuid.parse(commandId);
      const { data, error } = await client.from('command_receipts').select('command_id,owner_id,command_type,request,result').eq('owner_id', owner).eq('command_id', commandId).maybeSingle();
      if (error) throw error; return data;
    }),
    list: (request, signal) => run(async owner => {
      z.object({ page: z.number().int().nonnegative(), search: z.string(), stage: z.enum(persistedLeadStages).optional(), source: z.string().optional() }).parse(request);
      let query = client.from('leads').select('*', { count: 'exact' }).eq('owner_id', owner).order('created_at', { ascending: false }).order('id', { ascending: false });
      const search = literal(request.search);
      if (search) query = query.or(`full_name.ilike."%${search}%",phone.ilike."%${search}%",email.ilike."%${search}%"`);
      if (request.stage) query = query.eq('stage', request.stage);
      if (request.source?.trim()) query = query.eq('source', request.source.trim());
      query = query.range(request.page * 25, request.page * 25 + 24);
      if (signal) query = query.abortSignal(signal);
      const { data, error, count } = await query; if (error) throw error;
      const leads = readRows(data, owner);
      if (count === null || leads.length !== Math.min(25, Math.max(0, count - request.page * 25))) throw new LeadFailure('unavailable', 'The requested page was incomplete. Please retry.');
      return { leads, total: count };
    }),
    detail: (id, signal) => run(async owner => {
      uuid.parse(id);
      const leadQuery = client.from('leads').select('*').eq('owner_id', owner).eq('id', id);
      if (signal) leadQuery.abortSignal(signal);
      const { data, error } = await leadQuery.maybeSingle(); if (error) throw error; if (!data) throw new LeadFailure('not_found', 'This lead is unavailable.');
      const followQuery = client.from('follow_ups').select('*', { count: 'exact' }).eq('owner_id', owner).eq('lead_id', id).order('due_at', { ascending: false }).order('id', { ascending: false });
      const activityQuery = client.from('activities').select('*', { count: 'exact' }).eq('owner_id', owner).eq('lead_id', id).order('occurred_at', { ascending: false }).order('id', { ascending: false });
      // Fetch history in bounded database pages, not a silently truncated default response.
      const followUps: NonNullable<Awaited<typeof followQuery>['data']> = [];
      const activities: NonNullable<Awaited<typeof activityQuery>['data']> = [];
      let followCount: number | undefined; let activityCount: number | undefined;
      for (let offset = 0; ;) {
        if (signal) followQuery.abortSignal(signal);
        const response = await followQuery.range(offset, offset + 249); if (response.error) throw response.error;
        const end = scanEnd(response.count, offset, response.data.length, followCount); followCount = response.count!;
        followUps.push(...z.array(followRow).parse(response.data)); if (end) break; offset += response.data.length; guard();
      }
      for (let offset = 0; ;) {
        if (signal) activityQuery.abortSignal(signal);
        const response = await activityQuery.range(offset, offset + 249); if (response.error) throw response.error;
        const end = scanEnd(response.count, offset, response.data.length, activityCount); activityCount = response.count!;
        activities.push(...z.array(activityRow).parse(response.data)); if (end) break; offset += response.data.length; guard();
      }
      if ([...followUps, ...activities].some(v => v.owner_id !== owner || v.lead_id !== id)) throw new LeadFailure('unauthorized', 'Private access could not be verified.');
      return { lead: readRows([data], owner)[0], followUps, activities };
    }),
    duplicates: (phone, email, excludeId) => run(async owner => {
      const canonical = normalizeMobile(phone); if (!canonical) throw new LeadFailure('invalid_command', 'Enter a valid mobile number.');
      if (excludeId) uuid.parse(excludeId);
      // Legacy rows may not be canonical. Scan all authorized contact rows in bounded pages.
      // This intentionally does not depend on the list's current search/page/filter.
      const matches: PersistedLead[] = [];
      const seen = new Set<string>(); let expectedCount: number | undefined;
      for (let offset = 0; ;) {
        const { data, error, count } = await client.from('leads').select('*', { count: 'exact' }).eq('owner_id', owner).order('id').range(offset, offset + 249);
        if (error) throw error; const rows = readRows(data, owner);
        const end = scanEnd(count, offset, rows.length, expectedCount); expectedCount = count!;
        for (const item of rows) { if (seen.has(item.id)) throw new LeadFailure('unavailable', 'The contact dataset changed during verification. Please retry.'); seen.add(item.id); }
        matches.push(...rows.filter(v => v.id !== excludeId && ((v.phone && normalizeMobile(v.phone) === canonical) || (email.trim() && v.email?.trim().toLowerCase() === email.trim().toLowerCase()))));
        if (end) return matches; offset += rows.length; guard();
      }
    }),
    createLead: async (command: CreateLeadCommand, confirmed = false) => {
      guard(); if (!writable) throw new LeadFailure('read_only', 'Hosted lead writes are not authorized in Phase 7A.');
      const parsed = createLeadFormSchema.safeParse({ fullName: command.fullName, phone: command.phone, email: command.email ?? '', source: command.source, inquiry: command.initialSummary, nextAction: command.initialFollowUp?.action, followUpAt: command.initialFollowUp?.dueAt });
      if (!parsed.success || !uuid.safeParse(command.commandId).success) throw new LeadFailure('invalid_command', 'Complete all required lead fields.');
      const fields = parsed.data;
      if (!confirmed && (await api.duplicates(fields.phone, fields.email)).length) throw new LeadFailure('duplicate_confirmation', 'Review matching leads and explicitly confirm saving a separate lead.');
      return run(async () => {
        const { data, error } = await client.rpc('cv_create_lead', { p_command_id: command.commandId, p_full_name: fields.fullName, p_phone: fields.phone, p_email: fields.email, p_source: fields.source, p_initial_summary: fields.inquiry, p_initial_action: fields.nextAction, p_initial_due_at: fields.followUpAt });
        if (error) throw error; const value = result.parse(data); return { leadId: value.lead_id, leadVersion: value.lead_version, followUpId: value.follow_up_id ?? null };
      }, true);
    },
    editLead: async (command: EditLeadCommand, confirmed = false) => {
      guard(); if (!writable) throw new LeadFailure('read_only', 'Hosted lead writes are not authorized in Phase 7A.');
      const parsed = editLeadFormSchema.safeParse(command.changes);
      if (!parsed.success || !uuid.safeParse(command.commandId).success || !uuid.safeParse(command.leadId).success || !z.number().int().positive().safeParse(command.expectedVersion).success) throw new LeadFailure('invalid_command', 'Complete the supported lead fields before saving.');
      if (!confirmed && (await api.duplicates(parsed.data.phone, parsed.data.email, command.leadId)).length) throw new LeadFailure('duplicate_confirmation', 'Review matching leads and explicitly confirm saving.');
      return run(async () => {
        const fields = parsed.data;
        const { data, error } = await client.rpc('cv_edit_lead', { p_command_id: command.commandId, p_lead_id: command.leadId, p_expected_version: command.expectedVersion, p_changes: { full_name: fields.fullName, phone: fields.phone, email: fields.email || null, source: fields.source } });
        if (error) throw error; const value = result.parse(data); return { leadId: value.lead_id, leadVersion: value.lead_version };
      }, true);
    },
  };
  return api;
}
/** All configured application clients are read-only, irrespective of environment labels. */
export function createHostedLeadRepository(client: SupabaseClient<Database>, authorize: Authorization, active: () => boolean): LeadRepository {
  return repository(client, authorize, active, false);
}
/** Mutation factory is exclusively for disposable loopback/internal Docker tests. No hosted URL is accepted. */
export function createIsolatedLeadRepository(options: { url: string; publishableKey: string; accessToken: () => Promise<string>; authorize: Authorization; active: () => boolean; fetch?: typeof fetch }): LeadRepository {
  const target = new URL(options.url);
  const allowed = (url: URL) => url.protocol === 'http:' && (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || (url.hostname === 'rest' && url.port === '3000')) && !url.username && !url.password;
  if (!allowed(target) || target.pathname !== '/') throw new LeadFailure('read_only', 'Only isolated local test targets allow mutations.');
  const transport = options.fetch ?? fetch;
  const client = createClient<Database>(options.url, options.publishableKey, { accessToken: options.accessToken, global: { fetch: async (input, init) => {
    const url = new URL(String(input)); if (!allowed(url) || url.origin !== target.origin) throw new LeadFailure('read_only', 'A non-local request was blocked.');
    const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 20_000);
    // The isolated runner exposes PostgREST directly, without Supabase's gateway prefix.
    if (target.hostname === 'rest') url.pathname = url.pathname.replace(/^\/rest\/v1\//, '/');
    try { return await transport(url.toString(), { ...init, signal: abort.signal, redirect: 'error' }); } finally { clearTimeout(timer); }
  } } });
  return repository(client, options.authorize, options.active, true);
}
