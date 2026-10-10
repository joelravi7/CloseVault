import { PersistedLeadListScreen } from '@/features/leads/persisted-lead-screens';
import { LeadRepositoryProvider } from '@/providers/lead-repository-provider';
export default function Workspace() { return <LeadRepositoryProvider><PersistedLeadListScreen /></LeadRepositoryProvider>; }
