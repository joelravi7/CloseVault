import type { CreateLeadCommand, CreateLeadResult, EditLeadCommand } from './database-commands';
import type { Tables } from '../supabase/database.types';
import type { persistedLeadStages } from '@/domain/lead-persistence';
import type { LeadSaveRecovery } from '../lead-save-recovery';

export type PersistedLead = Tables<'leads'>;
export interface LeadPageRequest { page: number; search: string; stage?: typeof persistedLeadStages[number]; source?: string }
export interface LeadPage { leads: PersistedLead[]; total: number }
export interface LeadDetail { lead: PersistedLead; followUps: Tables<'follow_ups'>[]; activities: Tables<'activities'>[] }
export interface LeadRepository {
  readonly writable: boolean;
  readonly recovery?: LeadSaveRecovery;
  receipt?(commandId: string): Promise<unknown | null>;
  list(request: LeadPageRequest, signal?: AbortSignal): Promise<LeadPage>;
  detail(id: string, signal?: AbortSignal): Promise<LeadDetail>;
  duplicates(phone: string, email: string, excludeId?: string): Promise<PersistedLead[]>;
  createLead(command: CreateLeadCommand, duplicatesConfirmed?: boolean): Promise<CreateLeadResult>;
  editLead(command: EditLeadCommand, duplicatesConfirmed?: boolean): Promise<{ leadId: string; leadVersion: number }>;
}
