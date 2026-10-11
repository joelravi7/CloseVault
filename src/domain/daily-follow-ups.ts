import { z } from 'zod';
import { parseCancellationDate } from './follow-up-cancellation';

export const activeFollowUpStatuses = ['upcoming', 'due', 'overdue', 'waiting_for_client'] as const;
export type FollowUpBucket = 'today' | 'overdue' | 'upcoming';
export function colomboDayWindow(at: string): { start: string; end: string } {
  const instant = new Date(at);
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid reference instant.');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const start = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00+05:30`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}
export const cancelCommandSchema = z.object({
  commandId: z.uuid(), followUpId: z.uuid(), expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1, 'Cancellation reason is required.'),
  replacement: z.object({ action: z.string().trim().min(3, 'Describe a meaningful replacement action (at least three characters).'),
    dueAt: z.string().trim().refine(v => parseCancellationDate(v) !== undefined, 'Enter a valid replacement date/time in Asia/Colombo.').transform(v => parseCancellationDate(v)!),
  }).strict(),
}).strict();
