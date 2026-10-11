import { act, render, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren, useEffect } from 'react';

import CalendarScreen from '../../app/(tabs)/calendar';
import TodayScreen from '../../app/(tabs)/today';
import { demoActivities, demoFollowUps, demoLeads } from '../../data/demo-fixtures';
import type { FollowUp, Lead } from '../../domain/models';
import { cancelFollowUpNotification, scheduleFollowUpNotification } from '../../services/notifications';
import { DemoDataProvider, type FollowUpResolution, useDemoData } from '../demo-data-provider';

// FU-CANCEL-001: test the existing public provider API, not an invented repository.
// All records are fictional. No real native notification implementation is loaded.
jest.mock('../../services/notifications', () => ({
  cancelFollowUpNotification: jest.fn(),
  scheduleFollowUpNotification: jest.fn(),
}));
jest.mock('../../data/demo-fixtures', () => ({
  demoLeads: [], demoFollowUps: [], demoActivities: [],
  demoMessageTemplates: [], demoSiteVisits: [], unitTypes: [],
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// Replace visual shells only: real screen filtering/counting remains under test.
jest.mock('../../components/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Container = ({ children }: PropsWithChildren) => React.createElement(View, null, children);
  const Label = ({ label }: { label: string }) => React.createElement(Text, null, label);
  const Heading = ({ title, detail }: { title: string; detail?: string }) =>
    React.createElement(View, null, React.createElement(Text, null, title),
      detail ? React.createElement(Text, null, detail) : null);
  return { Screen: Container, Card: Container, Badge: Label, Button: Label,
    PageHeader: Heading, SectionHeader: Heading };
});

const NOW = '2026-10-10T03:30:00.000Z'; // 09:00 Asia/Colombo.
const REPLACEMENT_AT = '2026-10-10T10:00:00+05:30';
const REPLACEMENT_UTC = '2026-10-10T04:30:00.000Z';
const REASON = 'Fictional appointment changed';
const NEXT_ACTION = 'Arrange fictional replacement appointment';
const cancelNotification = jest.mocked(cancelFollowUpNotification);
const scheduleNotification = jest.mocked(scheduleFollowUpNotification);

function seed(status: FollowUp['status'] = 'upcoming', withOther = false): void {
  const lead: Lead = {
    id: 'fictional-lead', fullName: 'Fictional Test Owner', displayPhone: '', normalizedPhone: '',
    source: 'Fictional test', stage: 'connected', temperature: 'developing', priority: 'C',
    probability: 10, bedroomInterest: 2, nextAction: 'Original fictional task',
    nextFollowUpAt: REPLACEMENT_UTC, potentialPropertyValue: 0, score: 10, scoreReasons: [],
  };
  const original: FollowUp = {
    id: 'original', leadId: lead.id, title: lead.nextAction, dueAt: REPLACEMENT_UTC,
    status, priority: 'C', notificationId: 'fictional-original-reminder',
  };
  demoLeads.splice(0, demoLeads.length, lead);
  demoFollowUps.splice(0, demoFollowUps.length, original,
    ...(withOther ? [{ ...original, id: 'other', title: 'Other fictional task',
      notificationId: 'fictional-other-reminder' }] : []));
  demoActivities.splice(0, demoActivities.length);
}

function command(overrides: Partial<FollowUpResolution> = {}): FollowUpResolution {
  return { action: 'cancel', outcome: REASON, nextAction: NEXT_ACTION,
    nextFollowUpAt: REPLACEMENT_AT, ...overrides };
}

function Wrapper({ children }: PropsWithChildren) {
  return createElement(DemoDataProvider, null, children);
}

type Data = ReturnType<typeof useDemoData>;
function snapshot(data: Data) {
  // Only serializable CRM state: no functions or volatile render identities.
  return JSON.parse(JSON.stringify({ leads: data.leads, followUps: data.followUps,
    activities: data.activities })) as { leads: Lead[]; followUps: FollowUp[]; activities: Data['activities'] };
}

async function submit(result: { current: Data }, input = command()): Promise<unknown> {
  let failure: unknown;
  await act(async () => {
    try { await result.current.resolveFollowUp('original', input); }
    catch (error) { failure = error; }
  });
  return failure;
}

function assertReplacement(data: Data, expectedCount: number): void {
  expect(data.followUps).toHaveLength(expectedCount);
  expect(data.followUps.find((item) => item.id === 'original')).toMatchObject({
    status: 'cancelled', outcome: REASON, title: 'Original fictional task',
    dueAt: REPLACEMENT_UTC,
  });
  const replacements = data.followUps.filter((item) => !['original', 'other'].includes(item.id));
  expect(replacements).toHaveLength(1);
  expect(replacements[0]).toMatchObject({ leadId: 'fictional-lead', title: NEXT_ACTION,
    dueAt: REPLACEMENT_UTC, status: 'upcoming' });
  expect(data.leads[0]).toMatchObject({ stage: 'connected', nextAction: NEXT_ACTION,
    nextFollowUpAt: REPLACEMENT_UTC });
}

describe('FU-CANCEL-001 mandatory cancellation replacement', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date(NOW));
    let randomCall = 0;
    jest.spyOn(Math, 'random').mockImplementation(() => 0.123456 + randomCall++ / 100);
    cancelNotification.mockReset().mockResolvedValue(undefined);
    scheduleNotification.mockReset().mockResolvedValue('fictional-replacement-reminder');
    seed();
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('retains cancelled history, creates exactly one task, and updates lead planning', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    expect(await submit(result)).toBeUndefined();
    assertReplacement(result.current, 2);
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0]).toMatchObject({ leadId: 'fictional-lead',
      type: 'follow_up_outcome', summary: REASON, occurredAt: NOW });
    expect(cancelNotification).toHaveBeenCalledWith('fictional-original-reminder');
    expect(scheduleNotification).toHaveBeenCalledTimes(1);
    expect(scheduleNotification).toHaveBeenCalledWith('Fictional', NEXT_ACTION, REPLACEMENT_UTC);
  });

  it('creates a replacement even when another active task exists, preserving that task', async () => {
    seed('upcoming', true);
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    const other = { ...result.current.followUps.find((item) => item.id === 'other') };
    expect(await submit(result)).toBeUndefined();
    assertReplacement(result.current, 3);
    expect(result.current.followUps.find((item) => item.id === 'other')).toEqual(other);
    expect(cancelNotification).not.toHaveBeenCalledWith('fictional-other-reminder');
  });

  const invalidCommands: [string, Partial<FollowUpResolution>][] = [
    ['empty reason', { outcome: '' }],
    ['blank reason', { outcome: '   ' }],
    ['missing action', { nextAction: undefined }],
    ['empty action', { nextAction: '' }],
    ['blank action', { nextAction: '   ' }],
    ['missing date/time', { nextFollowUpAt: undefined }],
    ['empty date/time', { nextFollowUpAt: '' }],
    ['blank date/time', { nextFollowUpAt: '   ' }],
    ['invalid date/time', { nextFollowUpAt: 'not-a-date' }],
    ['date without a scheduled time', { nextFollowUpAt: '2026-10-10' }],
    ['impossible calendar date', { nextFollowUpAt: '2026-02-30T10:00:00+05:30' }],
  ];
  it.each(invalidCommands)('rejects %s without state changes or notification operations', async (_label, overrides) => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    const before = snapshot(result.current);
    const failure = await submit(result, command(overrides));
    // Assert all safety properties together so diagnostics expose partial mutation.
    expect({ rejected: failure instanceof Error, state: snapshot(result.current),
      cancellations: cancelNotification.mock.calls, schedules: scheduleNotification.mock.calls })
      .toEqual({ rejected: true, state: before, cancellations: [], schedules: [] });
  });

  it('rejects a runtime command with an absent cancellation reason', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    const before = snapshot(result.current);
    const input = command();
    Reflect.deleteProperty(input, 'outcome');
    const failure = await submit(result, input);
    expect({ rejected: failure instanceof Error, state: snapshot(result.current),
      cancellations: cancelNotification.mock.calls, schedules: scheduleNotification.mock.calls })
      .toEqual({ rejected: true, state: before, cancellations: [], schedules: [] });
  });

  it.each<FollowUp['status']>(['completed', 'cancelled', 'rescheduled'])('rejects cancellation of a %s task', async (status) => {
    seed(status);
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    const before = snapshot(result.current);
    const failure = await submit(result);
    expect({ rejected: failure instanceof Error, state: snapshot(result.current),
      cancellations: cancelNotification.mock.calls, schedules: scheduleNotification.mock.calls })
      .toEqual({ rejected: true, state: before, cancellations: [], schedules: [] });
  });

  it('cancels the old reminder only after cancelled task, replacement and lead update are observable', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    let atCancellation: ReturnType<typeof snapshot> | undefined;
    cancelNotification.mockImplementation(async () => { atCancellation = snapshot(result.current); });
    expect(await submit(result)).toBeUndefined();
    expect(atCancellation?.followUps.find((item) => item.id === 'original')?.status).toBe('cancelled');
    expect(atCancellation?.followUps.filter((item) => item.id !== 'original')).toHaveLength(1);
    expect(atCancellation?.leads[0].nextAction).toBe(NEXT_ACTION);
  });

  it('schedules the replacement reminder only after the data change is observable', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    let atScheduling: ReturnType<typeof snapshot> | undefined;
    scheduleNotification.mockImplementation(async () => {
      atScheduling = snapshot(result.current);
      return 'fictional-replacement-reminder';
    });
    expect(await submit(result)).toBeUndefined();
    expect(atScheduling?.followUps.find((item) => item.id === 'original')?.status).toBe('cancelled');
    expect(atScheduling?.followUps.filter((item) => item.id !== 'original')).toHaveLength(1);
    expect(atScheduling?.leads[0].nextFollowUpAt).toBe(REPLACEMENT_UTC);
  });

  it('does not lose the committed cancellation/replacement when old reminder cancellation fails', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    cancelNotification.mockRejectedValueOnce(new Error('Fictional native cancellation failure'));
    await submit(result); // No assumption about error UI: inspect the required data outcome.
    assertReplacement(result.current, 2);
  });

  it('keeps the replacement when reminders are unsupported or permission is denied', async () => {
    scheduleNotification.mockResolvedValue(undefined);
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    expect(await submit(result)).toBeUndefined();
    assertReplacement(result.current, 2);
    expect(result.current.followUps.find((item) => item.id !== 'original')?.notificationId).toBeUndefined();
  });

  it('does not duplicate the replacement on a sequential repeated submission', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    expect(await submit(result)).toBeUndefined();
    await submit(result);
    assertReplacement(result.current, 2);
    expect(result.current.activities).toHaveLength(1);
    expect(scheduleNotification).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate the replacement on concurrent submissions through the same rendered API', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    const resolve = result.current.resolveFollowUp;
    await act(async () => {
      await Promise.allSettled([resolve('original', command()), resolve('original', command())]);
    });
    assertReplacement(result.current, 2);
    expect(result.current.activities).toHaveLength(1);
    expect(scheduleNotification).toHaveBeenCalledTimes(1);
  });

  it('retries a notification-failed cancellation without duplicate replacement tasks', async () => {
    const { result } = await renderHook(useDemoData, { wrapper: Wrapper });
    cancelNotification.mockRejectedValueOnce(new Error('Fictional transient failure'));
    await submit(result);
    assertReplacement(result.current, 2);
    await submit(result);
    assertReplacement(result.current, 2);
    expect(result.current.activities).toHaveLength(1);
  });

  it.each([
    ['Today', TodayScreen], ['Calendar', CalendarScreen],
  ])('%s shows the replacement but not the cancelled original', async (_name, Component) => {
    let current: Data | undefined;
    function ObservedScreen() {
      const data = useDemoData();
      useEffect(() => { current = data; }, [data]);
      return createElement(Component);
    }
    const view = await render(createElement(ObservedScreen), { wrapper: Wrapper });
    const result = { get current(): Data {
      if (!current) throw new Error('Provider did not render');
      return current;
    } };
    expect(await submit(result)).toBeUndefined();
    // Assert the real screen after cancellation in the SAME mounted provider.
    expect(view.getByText(NEXT_ACTION)).toBeTruthy();
    expect(view.queryByText('Original fictional task')).toBeNull();
    if (_name === 'Today') expect(view.getByText('1 actions need attention')).toBeTruthy();
  });
});

// Integration requirements NOT represented by mocks:
// - PostgreSQL rollback of lead/task/history writes on transaction failure.
// - Owner-only RLS and durable command idempotency across reload/concurrent clients.
// - Durable notification retry/reconciliation after process termination.
// A rejected scheduling Promise is currently fire-and-forget without a catch or
// observable error/retry API. Testing its recovery requires an approved production
// boundary; do not suppress its unhandled rejection to manufacture a passing test.
