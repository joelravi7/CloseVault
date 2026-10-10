import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { colors } from '@/constants/theme';
import { DemoDataProvider } from '@/providers/demo-data-provider';
import { SecurityProvider } from '@/providers/security-provider';
import { configureNotifications } from '@/services/notifications';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  useEffect(() => { void configureNotifications(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SecurityProvider><DemoDataProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: colors.navy }, headerTintColor: colors.surface, headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="lead/[id]" options={{ title: 'Lead profile' }} />
          <Stack.Screen name="quick-add" options={{ title: 'Quick add lead', presentation: 'modal' }} />
          <Stack.Screen name="activity" options={{ title: 'Add activity', presentation: 'modal' }} />
          <Stack.Screen name="follow-up" options={{ title: 'Schedule follow-up', presentation: 'modal' }} />
          <Stack.Screen name="follow-up-action" options={{ title: 'Resolve follow-up', presentation: 'modal' }} />
          <Stack.Screen name="call-outcome" options={{ title: 'Call outcome', presentation: 'modal' }} />
          <Stack.Screen name="whatsapp" options={{ title: 'WhatsApp preview', presentation: 'modal' }} />
          <Stack.Screen name="templates" options={{ title: 'Message templates' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings & security' }} />
          <Stack.Screen name="options" options={{ title: 'Apartment options' }} />
          <Stack.Screen name="calculator" options={{ title: 'Payment calculator' }} />
        </Stack>
      </DemoDataProvider></SecurityProvider>
    </QueryClientProvider>
  );
}
