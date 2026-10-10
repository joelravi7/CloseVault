import { Redirect } from 'expo-router';
import { authDestination } from '@/domain/authentication';
import { useAuth } from '@/providers/auth-provider';

export default function Index() {
  const { state, demo } = useAuth();
  return <Redirect href={demo ? '/today' : authDestination(state)} />;
}
