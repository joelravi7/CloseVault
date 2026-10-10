import { Platform } from 'react-native';

export async function configureNotifications() {
  if (Platform.OS === 'web') return;
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Follow-up reminders', importance: Notifications.AndroidImportance.DEFAULT });
}

export async function requestNotificationPermission() {
  if (Platform.OS === 'web') return 'unsupported' as const;
  const Notifications = await import('expo-notifications');
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted' as const;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted ? 'granted' as const : 'denied' as const;
}

export async function scheduleFollowUpNotification(firstName: string, title: string, dueAt: string) {
  if (Platform.OS === 'web' || new Date(dueAt).getTime() <= Date.now()) return undefined;
  const Notifications = await import('expo-notifications');
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') return undefined;
  return Notifications.scheduleNotificationAsync({
    content: { title: 'CloseVault follow-up', body: `Follow up with ${firstName} – ${title}`, data: { kind: 'follow_up' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(dueAt) },
  });
}

export async function cancelFollowUpNotification(id?: string) {
  if (!id || Platform.OS === 'web') return;
  const Notifications = await import('expo-notifications');
  await Notifications.cancelScheduledNotificationAsync(id);
}
