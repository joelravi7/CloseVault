import { fireEvent, render } from '@testing-library/react-native';
import { createElement } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import FollowUpActionScreen from '../../app/follow-up-action';
import type { Lead } from '../../domain/models';
import { useDemoData } from '../demo-data-provider';

jest.mock('../demo-data-provider', () => ({ useDemoData: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() },
  useLocalSearchParams: () => ({ followUpId: 'original' }) }));
jest.mock('../../components/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  const Container = ({ children }: import('react').PropsWithChildren) => React.createElement(View, null, children);
  const Button = ({ label, ...props }: import('react-native').PressableProps & { label: string }) =>
    React.createElement(Pressable, { ...props, accessibilityRole: 'button' }, React.createElement(Text, null, label));
  return { Screen: Container, Card: Container, Button, EmptyState: () => null };
});

const lead: Lead = { id: 'fictional', fullName: 'Fictional Test', normalizedPhone: '', displayPhone: '',
  source: 'Test', stage: 'connected', temperature: 'developing', priority: 'C', probability: 10,
  bedroomInterest: 2, nextAction: 'Original', score: 10, scoreReasons: [], potentialPropertyValue: 0 };
const resolve = jest.fn<Promise<void>, Parameters<ReturnType<typeof useDemoData>['resolveFollowUp']>>();

describe('FU-CANCEL-001 screen command acknowledgement', () => {
  beforeEach(() => {
    jest.mocked(router.replace).mockClear();
    resolve.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(useDemoData).mockReturnValue({ leads: [lead],
      followUps: [{ id: 'original', leadId: lead.id, title: 'Original', status: 'upcoming',
        priority: 'C', dueAt: '2026-10-10T04:30:00.000Z' }],
      activities: [], siteVisits: [], unitTypes: [], templates: [], getLead: () => lead,
      addLead: jest.fn(() => lead), addActivity: jest.fn(), addFollowUp: jest.fn(),
      resolveFollowUp: resolve, recordCallOutcome: jest.fn(), recordWhatsAppSent: jest.fn(),
      saveTemplate: jest.fn(), duplicateTemplate: jest.fn(), archiveTemplate: jest.fn(),
      cancellationReminderErrors: {}, retryCancellationReminders: jest.fn(),
    });
  });
  afterEach(() => jest.restoreAllMocks());

  async function saveCancellation() {
    const view = await render(createElement(FollowUpActionScreen));
    await fireEvent.press(view.getByText('Cancel'));
    await fireEvent.changeText(view.getByPlaceholderText('What happened?'), 'Fictional cancellation reason');
    await fireEvent.press(view.getByRole('button', { name: 'Save outcome' }));
    return view;
  }

  it('stays on the screen and displays the failure when the command rejects', async () => {
    resolve.mockRejectedValue(new Error('Follow-up changed; review and try again.'));
    await saveCancellation();
    expect(resolve).toHaveBeenCalledWith('original', expect.objectContaining({ action: 'cancel' }));
    expect(router.replace).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Cannot update', 'Follow-up changed; review and try again.');
  });

  it('navigates after a successful command acknowledgement', async () => {
    resolve.mockResolvedValue(undefined);
    await saveCancellation();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/today');
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
