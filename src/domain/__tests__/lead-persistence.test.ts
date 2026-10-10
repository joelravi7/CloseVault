import { createLeadFormSchema, editLeadFormSchema, formatColombo, normalizeMobile, persistedLeadStages } from '../lead-persistence';
// Fictional syntax-only test contacts; no messages or calls are made.
const valid = { fullName: 'Fictional Buyer', phone: '0771234567', email: ' TEST@EXAMPLE.INVALID ', source: 'Fictional referral', inquiry: 'Two bedrooms; fictional budget', nextAction: 'Discuss requirements', followUpAt: '2026-10-12T09:30' };
describe('Phase 7A approved application policies', () => {
  test.each([['0771234567', '+94771234567'], ['+94 77 123 4567', '+94771234567'], ['0094771234567', '+94771234567'], ['94771234567', '+94771234567'], ['+971501234567', '+971501234567'], ['+447911123456', '+447911123456']])('normalizes international mobile %s', (input, output) => expect(normalizeMobile(input)).toBe(output));
  test.each(['', '123', '+999123456789', '+442012345678', 'call +94771234567', '+94771234567 ext 2'])('rejects invalid/non-mobile input %s', input => expect(normalizeMobile(input)).toBeUndefined());
  test('normalizes creation contacts and Colombo input to UTC', () => expect(createLeadFormSchema.parse(valid)).toEqual({ ...valid, phone: '+94771234567', email: 'test@example.invalid', followUpAt: '2026-10-12T04:00:00.000Z' }));
  test.each(['fullName', 'phone', 'source', 'inquiry', 'nextAction', 'followUpAt'] as const)('requires %s', field => expect(createLeadFormSchema.safeParse({ ...valid, [field]: '   ' }).success).toBe(false));
  test.each(['2026-02-30T09:30', '2026-10-12', '2026-10-12T25:30', 'invalid', '2026-10-12T09:30+15:00'])('rejects invalid date %s', followUpAt => expect(createLeadFormSchema.safeParse({ ...valid, followUpAt }).success).toBe(false));
  test('email optional but validated', () => { expect(createLeadFormSchema.safeParse({ ...valid, email: '' }).success).toBe(true); expect(createLeadFormSchema.safeParse({ ...valid, email: 'invalid' }).success).toBe(false); });
  test('edit cannot clear mobile or expose unsupported controls', () => { const contact = { fullName: valid.fullName, phone: valid.phone, email: '', source: valid.source }; expect(editLeadFormSchema.safeParse(contact).success).toBe(true); expect(editLeadFormSchema.safeParse({ ...contact, phone: '' }).success).toBe(false); expect(editLeadFormSchema.safeParse({ ...contact, stage: 'lost' }).success).toBe(false); });
  test('keeps all fifteen approved stages', () => expect(persistedLeadStages).toHaveLength(15));
  test('renders Colombo independent of device timezone', () => expect(formatColombo('2026-10-12T04:00:00Z')).toContain('09:30'));
});
