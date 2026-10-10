import { Redirect, Stack } from 'expo-router';
import { authDestination } from '@/domain/authentication';
import { useAuth } from '@/providers/auth-provider';
import { LeadRepositoryProvider } from '@/providers/lead-repository-provider';
export default function CrmLayout() {
  const { state, demo } = useAuth();
  if (demo || state.status !== 'authenticated') return <Redirect href={authDestination(state)} />;
  return <LeadRepositoryProvider><Stack screenOptions={{ headerShown: false }} /></LeadRepositoryProvider>;
}
