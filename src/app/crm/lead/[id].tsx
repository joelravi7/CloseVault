import { useLocalSearchParams } from 'expo-router';
import { PersistedLeadDetailScreen } from '@/features/leads/persisted-lead-screens';
export default function LeadDetail() { const { id } = useLocalSearchParams<{ id: string }>(); return <PersistedLeadDetailScreen id={id} />; }
