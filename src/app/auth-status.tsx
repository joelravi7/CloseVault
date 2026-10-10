import { Redirect } from 'expo-router';
import { AuthScreen } from '@/features/auth/auth-screen';
import { authDestination } from '@/domain/authentication';
import { useAuth } from '@/providers/auth-provider';
export default function AuthStatus() {
  const { state } = useAuth(); const destination = authDestination(state);
  return destination !== '/auth-status' ? <Redirect href={destination} /> : <AuthScreen kind="status" />;
}
