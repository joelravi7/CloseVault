import { useLocalSearchParams } from 'expo-router';
import { PersistedLeadEditScreen } from '@/features/leads/persisted-lead-screens';
export default function LeadEdit() { const { id } = useLocalSearchParams<{ id: string }>(); return <PersistedLeadEditScreen id={id} />; }
