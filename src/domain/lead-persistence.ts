import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { z } from 'zod';
import { parseCancellationDate } from './follow-up-cancellation';
import { normalizeSriLankanPhone } from './business-rules';
import type { LeadStage } from './models';

export const persistedLeadStages = ['new', 'connected', 'requirement_identified', 'documents_sent', 'serious_interest', 'site_visit_planned', 'site_visit_completed', 'unit_shortlisted', 'negotiation', 'reservation_expected', 'reserved', 'spa_in_progress', 'sale_completed', 'long_term_follow_up', 'lost'] as const satisfies readonly LeadStage[];
export function normalizeMobile(value: string): string | undefined {
  const input = value.trim().replace(/^00/, '+');
  if (!/^[+\d\s().-]+$/.test(input)) return undefined;
  const local = input.startsWith('+') ? undefined : normalizeSriLankanPhone(input);
  const phone = parsePhoneNumberFromString(local ?? input, { defaultCountry: 'LK', extract: false });
  if (!phone?.isValid() || !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(phone.getType() ?? '')) return undefined;
  return phone.number;
}
const mobile = z.string().trim().refine(v => normalizeMobile(v) !== undefined, 'Enter a valid mobile number. International numbers need a country code.').transform(v => normalizeMobile(v)!);
const email = z.string().trim().transform(v => v.toLowerCase()).refine(v => !v || z.email().safeParse(v).success, 'Enter a valid email address.');
export const editLeadFormSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required.'),
  phone: mobile, email, source: z.string().trim().min(1, 'Lead source is required.'),
}).strict();
export const createLeadFormSchema = editLeadFormSchema.extend({
  inquiry: z.string().trim().min(1, 'Inquiry summary is required.'),
  nextAction: z.string().trim().min(3, 'Describe a meaningful next action (at least three characters).'),
  followUpAt: z.string().trim().refine(v => parseCancellationDate(v) !== undefined, 'Enter a valid date and time in Asia/Colombo.').transform(v => parseCancellationDate(v)!),
});
export type CreateLeadForm = z.input<typeof createLeadFormSchema>;
export type EditLeadForm = z.input<typeof editLeadFormSchema>;
export function formatColombo(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
