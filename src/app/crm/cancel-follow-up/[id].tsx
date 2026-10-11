import { useLocalSearchParams } from 'expo-router';
import { CancelFollowUpScreen } from '@/features/leads/daily-follow-up-screens';
export default function CancellationRoute() {
  const { id, leadId } = useLocalSearchParams<{ id: string; leadId?: string }>();
  return <CancelFollowUpScreen key={`${leadId}:${id}`} id={id} leadId={leadId} />;
}
