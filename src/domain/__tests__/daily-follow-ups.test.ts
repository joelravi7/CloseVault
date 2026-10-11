import { cancelCommandSchema, colomboDayWindow } from '../daily-follow-ups';
import { receiptRequest, snapshotSaveOperation, type CommandSaveOperation } from '../lead-save-recovery';
const command = { commandId: '00000000-0000-4000-8000-000000000003', followUpId: '00000000-0000-4000-8000-000000000004', expectedVersion: 1, reason: ' Fictional change ', replacement: { action: ' Review requirements ', dueAt: '2026-10-12T09:30' } };
test.each([
  ['2026-10-11T18:29:59.999Z', '2026-10-10T18:30:00.000Z', '2026-10-11T18:30:00.000Z'],
  ['2026-10-11T18:30:00.000Z', '2026-10-11T18:30:00.000Z', '2026-10-12T18:30:00.000Z'],
  ['2026-12-31T20:00:00.000Z', '2026-12-31T18:30:00.000Z', '2027-01-01T18:30:00.000Z'],
])('Colombo business-day boundary %s', (at,start,end) => expect(colomboDayWindow(at)).toEqual({start,end}));
test('invalid reference instant is rejected', () => expect(() => colomboDayWindow('invalid')).toThrow());
test.each([
  { ...command, reason: ' \t\n' }, { ...command, replacement: { ...command.replacement, action: ' ' } },
  { ...command, replacement: { ...command.replacement, dueAt: '' } }, { ...command, replacement: { ...command.replacement, dueAt: '2026-02-30T09:30' } },
  { ...command, expectedVersion: 0 },
])('invalid cancellation command never validates', value => expect(cancelCommandSchema.safeParse(value).success).toBe(false));
test('canonical cancellation receipt request and immutable detached snapshot agree', () => {
  const original: CommandSaveOperation = { kind: 'cancel', command: { ...command, replacement: { ...command.replacement } }, leadId: '00000000-0000-4000-8000-000000000002', confirmed: true };
  const snapshot = snapshotSaveOperation(original); original.command.reason = 'Changed';
  expect(receiptRequest(snapshot)).toEqual({ task: command.followUpId, version: 1, reason: 'Fictional change', action: 'Review requirements', due: '2026-10-12T04:00:00.000000Z' });
  expect(Object.isFrozen(snapshot.command)).toBe(true);
});
test('unconfirmed cancellation cannot be journaled', () => expect(() => receiptRequest({ kind: 'cancel', command, leadId: '00000000-0000-4000-8000-000000000002', confirmed: false })).toThrow());
