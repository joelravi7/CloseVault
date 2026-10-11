import { z } from 'zod';

import type { Activity, FollowUp, Lead } from './models';

export function isActionableFollowUp(item: FollowUp): boolean {
  return ['upcoming', 'due', 'overdue', 'waiting_for_client'].includes(item.status);
}

// Unzoned CRM input denotes Colombo wall time, never the device timezone.
export function parseCancellationDate(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, , zone] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1] ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59) return undefined;
  if (zone && zone !== 'Z') {
    const h = Number(zone.slice(1, 3)), min = Number(zone.slice(4));
    if (h > 14 || min > 59 || (h === 14 && min !== 0)) return undefined;
  }
  const date = new Date(`${value}${zone ? '' : '+05:30'}`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export const cancellationSchema = z.object({
  action: z.literal('cancel'),
  outcome: z.string().trim().min(1, 'Cancellation reason is required.'),
  nextAction: z.string().trim().min(1, 'Replacement next action is required.'),
  nextFollowUpAt: z.string().trim().refine((value) => parseCancellationDate(value) !== undefined,
    'Enter a valid replacement date and time.').transform((value) => parseCancellationDate(value)!),
});

export interface CancellationState { leads: Lead[]; followUps: FollowUp[]; activities: Activity[] }
export function requireCancellable(state: CancellationState, id: string): { original: FollowUp; lead: Lead } {
  const original = state.followUps.find((item) => item.id === id);
  if (!original) throw new Error('Follow-up not found.');
  const lead = state.leads.find((item) => item.id === original.leadId);
  if (!lead) throw new Error('Lead not found.');
  if (lead.stage === 'lost' || lead.temperature === 'closed' || lead.priority === 'closed')
    throw new Error('Only active leads can have a follow-up cancelled with replacement.');
  if (!isActionableFollowUp(original)) throw new Error('This follow-up is already terminal.');
  return { original, lead };
}

export function applyCancellation<T extends CancellationState>(
  state: T, id: string, replacement: FollowUp, activity: Activity, reason: string,
): T {
  const { lead } = requireCancellable(state, id); // Revalidate at application time.
  return { ...state,
    followUps: [replacement, ...state.followUps.map((item) => item.id === id
      ? { ...item, status: 'cancelled' as const, outcome: reason, completedAt: activity.occurredAt } : item)],
    leads: state.leads.map((item) => item.id === lead.id
      ? { ...item, nextAction: replacement.title, nextFollowUpAt: replacement.dueAt } : item),
    activities: [activity, ...state.activities],
  };
}
