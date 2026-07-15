import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import { colors } from '@/constants/theme';
import { DemoDataProvider } from '@/providers/demo-data-provider';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <DemoDataProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: colors.navy }, headerTintColor: colors.surface, headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="lead/[id]" options={{ title: 'Lead profile' }} />
          <Stack.Screen name="quick-add" options={{ title: 'Quick add lead', presentation: 'modal' }} />
          <Stack.Screen name="options" options={{ title: 'Apartment options' }} />
          <Stack.Screen name="calculator" options={{ title: 'Payment calculator' }} />
        </Stack>
      </DemoDataProvider>
    </QueryClientProvider>
  );
}
