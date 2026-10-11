import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren, StrictMode } from 'react';

import { demoActivities, demoFollowUps, demoLeads } from '../../data/demo-fixtures';
import { parseCancellationDate } from '../../domain/follow-up-cancellation';
import { cancelFollowUpNotification, scheduleFollowUpNotification } from '../../services/notifications';
import { DemoDataProvider, useDemoData } from '../demo-data-provider';

jest.mock('../../services/notifications', () => ({
  cancelFollowUpNotification: jest.fn(), scheduleFollowUpNotification: jest.fn(),
}));
jest.mock('../../data/demo-fixtures', () => ({
  demoLeads: [], demoFollowUps: [], demoActivities: [],
  demoMessageTemplates: [], demoSiteVisits: [], unitTypes: [],
}));

function Wrapper({ children }: PropsWithChildren) { return createElement(DemoDataProvider, null, children); }
const cancel = jest.mocked(cancelFollowUpNotification);
const schedule = jest.mocked(scheduleFollowUpNotification);
const input = { action: 'cancel' as const, outcome: 'Fictional reason',
  nextAction: 'Fictional replacement', nextFollowUpAt: '2026-10-10T10:00' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('FU-CANCEL-001 reminder recovery and date boundary', () => {
  beforeEach(() => {
    cancel.mockReset().mockResolvedValue(undefined);
    schedule.mockReset().mockResolvedValue('fictional-new-notification');
    demoLeads.splice(0, demoLeads.length, { id: 'fictional', fullName: 'Fictional Test',
      displayPhone: '', normalizedPhone: '', source: 'Test', stage: 'connected',
      temperature: 'developing', priority: 'C', probability: 10, bedroomInterest: 2,
      nextAction: 'Original', score: 10, scoreReasons: [], potentialPropertyValue: 0 });
    demoFollowUps.splice(0, demoFollowUps.length, { id: 'original', leadId: 'fictional',
      title: 'Original', dueAt: '2026-10-10T04:30:00.000Z', status: 'upcoming',
      priority: 'C', notificationId: 'fictional-old-notification' });
    demoActivities.splice(0, demoActivities.length);
  });

  it('reports scheduling rejection and retries only scheduling without another CRM mutation', async () => {
    schedule.mockRejectedValueOnce(new Error('Fictional scheduling failure'));
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    await act(async () => { await result.current.resolveFollowUp('original', input); });
    expect(result.current.followUps).toHaveLength(2);
    expect(result.current.cancellationReminderErrors.original).toEqual([
      'Replacement reminder scheduling failed. Retry required.',
    ]);
    await act(async () => { result.current.retryCancellationReminders('original'); });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(result.current.followUps).toHaveLength(2);
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.cancellationReminderErrors.original).toEqual([]);
    expect(result.current.followUps.find((item) => item.id !== 'original')?.notificationId)
      .toBe('fictional-new-notification');
  });

  it('reports cancellation rejection and retries only cancellation without rescheduling', async () => {
    cancel.mockRejectedValueOnce(new Error('Fictional cancellation failure'));
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    await act(async () => { await result.current.resolveFollowUp('original', input); });
    expect(result.current.cancellationReminderErrors.original).toEqual([
      'Original reminder cancellation failed. Retry required.',
    ]);
    await act(async () => { result.current.retryCancellationReminders('original'); });
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(result.current.followUps).toHaveLength(2);
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.cancellationReminderErrors.original).toEqual([]);
  });

  it('does not cancel a closed lead or perform notification operations', async () => {
    demoLeads[0] = { ...demoLeads[0], stage: 'lost', priority: 'closed', temperature: 'closed' };
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.resolveFollowUp('original', input)).rejects.toThrow('Only active leads');
    });
    expect(result.current.followUps).toHaveLength(1);
    expect(result.current.activities).toHaveLength(0);
    expect(cancel).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('interprets unzoned wall time in Colombo and permits past-due scheduling', () => {
    expect(parseCancellationDate('2026-10-10T10:00')).toBe('2026-10-10T04:30:00.000Z');
    expect(parseCancellationDate('2020-01-01T00:00')).toBe('2019-12-31T18:30:00.000Z');
  });

  it('accepts leap day, rejects non-leap day and invalid time or offset', () => {
    expect(parseCancellationDate('2024-02-29T10:00')).toBe('2024-02-29T04:30:00.000Z');
    for (const invalid of ['2026-02-29T10:00', '2026-10-10T24:00',
      '2026-10-10T10:60', '2026-10-10T10:00:60Z', '2026-10-10T10:00+14:30'])
      expect(parseCancellationDate(invalid)).toBeUndefined();
  });

  it('cleans up a late B reminder after A → B → C, preserving exactly two replacements', async () => {
    const pending = deferred<string | undefined>();
    schedule.mockImplementationOnce(() => pending.promise);
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    await act(async () => { await result.current.resolveFollowUp('original', input); });
    const b = result.current.followUps.find((item) => item.id !== 'original')!;
    await act(async () => { await result.current.resolveFollowUp(b.id, { ...input, nextAction: 'Fictional C' }); });
    const c = result.current.followUps.find((item) => !['original', b.id].includes(item.id))!;
    expect(c.notificationId).toBe('fictional-new-notification'); // C resolves before B.
    await act(async () => { pending.resolve('fictional-obsolete-B'); });
    expect(cancel).toHaveBeenCalledWith('fictional-obsolete-B');
    expect(result.current.followUps.find((item) => item.id === b.id)).toMatchObject({ status: 'cancelled' });
    expect(result.current.followUps.find((item) => item.id === b.id)?.notificationId).toBeUndefined();
    expect(result.current.followUps.find((item) => item.id === c.id)).toMatchObject({ status: 'upcoming', notificationId: 'fictional-new-notification' });
    expect(result.current.followUps).toHaveLength(3);
    expect(result.current.activities).toHaveLength(2);
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('retains failed obsolete-reminder cleanup and retries its exact ID without CRM duplication', async () => {
    const pending = deferred<string | undefined>();
    schedule.mockImplementationOnce(() => pending.promise);
    cancel.mockImplementation(async (id) => {
      if (id === 'fictional-obsolete') throw new Error('Fictional cleanup failure');
    });
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    await act(async () => { await result.current.resolveFollowUp('original', input); });
    const b = result.current.followUps.find((item) => item.id !== 'original')!;
    await act(async () => { await result.current.resolveFollowUp(b.id, input); });
    await act(async () => { pending.resolve('fictional-obsolete'); });
    expect(result.current.cancellationReminderErrors.original?.length).toBeGreaterThan(0);
    expect(result.current.followUps.find((item) => item.id === b.id)?.notificationId).toBeUndefined();
    const before = { followUps: result.current.followUps, activities: result.current.activities };
    cancel.mockResolvedValue(undefined);
    await act(async () => { result.current.retryCancellationReminders('original'); });
    expect(cancel).toHaveBeenLastCalledWith('fictional-obsolete');
    expect(result.current.cancellationReminderErrors.original).toEqual([]);
    expect(result.current.followUps).toEqual(before.followUps);
    expect(result.current.activities).toEqual(before.activities);
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('cleans up scheduling that completes after the replacement becomes completed', async () => {
    const pending = deferred<string | undefined>();
    schedule.mockImplementationOnce(() => pending.promise);
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    await act(async () => { await result.current.resolveFollowUp('original', input); });
    const b = result.current.followUps.find((item) => item.id !== 'original')!;
    await act(async () => { await result.current.resolveFollowUp(b.id, { action: 'complete', outcome: 'Fictional completion' }); });
    await act(async () => { pending.resolve('fictional-late-completed'); });
    expect(cancel).toHaveBeenCalledWith('fictional-late-completed');
    expect(result.current.followUps.find((item) => item.id === b.id)?.status).toBe('completed');
    expect(result.current.followUps.find((item) => item.id === b.id)?.notificationId).toBeUndefined();
  });

  it('does not schedule twice under Strict Mode and repeated renders', async () => {
    const pending = deferred<string | undefined>();
    schedule.mockImplementationOnce(() => pending.promise);
    const { result, rerender } = await renderHook(useDemoData, {
      wrapper: ({ children }: PropsWithChildren) => createElement(StrictMode, null, createElement(Wrapper, null, children)),
    });
    await act(async () => { await result.current.resolveFollowUp('original', input); });
    await rerender(undefined);
    await act(async () => { pending.resolve('fictional-strict-reminder'); });
    await rerender(undefined);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(result.current.followUps).toHaveLength(2);
    expect(result.current.activities).toHaveLength(1);
  });

  it('catches a deferred scheduling rejection and keeps CRM success', async () => {
    const pending = deferred<string | undefined>();
    schedule.mockImplementationOnce(() => pending.promise);
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    await act(async () => { await expect(result.current.resolveFollowUp('original', input)).resolves.toBeUndefined(); });
    await act(async () => { pending.reject(new Error('Fictional late rejection')); });
    expect(result.current.cancellationReminderErrors.original?.length).toBeGreaterThan(0);
    expect(result.current.followUps).toHaveLength(2);
  });

  it('reports a competing queued lead closure as a rejection, not cancellation success', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    let failure: unknown;
    await act(async () => {
      // Same public API render; the closure must be authoritative before cancellation.
      await result.current.recordCallOutcome({ leadId: 'fictional', outcome: 'Not interested', summary: 'Fictional closure' });
      try { await result.current.resolveFollowUp('original', input); } catch (error) { failure = error; }
    });
    expect(failure).toBeInstanceOf(Error);
    expect(result.current.followUps).toHaveLength(1);
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('acknowledges applied cancellation and rejects terminal and invalid requests', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.resolveFollowUp('original', { ...input, outcome: '' })).rejects.toThrow();
      await expect(result.current.resolveFollowUp('original', input)).resolves.toBeUndefined();
      // No render flush is needed to observe the authoritative terminal-state guard.
      await expect(result.current.resolveFollowUp('original', input)).rejects.toThrow('already terminal');
    });
    expect(result.current.followUps.find((item) => item.id === 'original')?.status).toBe('cancelled');
    await act(async () => { await expect(result.current.resolveFollowUp('original', input)).rejects.toThrow(); });
    expect(result.current.followUps).toHaveLength(2);
  });
});
