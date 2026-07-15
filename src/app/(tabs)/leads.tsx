import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, EmptyState, PageHeader, Screen } from '@/components/ui';
import { LeadCard } from '@/components/lead-card';
import { colors, radii, spacing } from '@/constants/theme';
import { useDemoData } from '@/providers/demo-data-provider';

export default function LeadsScreen() {
  const { leads } = useDemoData();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) => [lead.fullName, lead.displayPhone, lead.normalizedPhone, lead.email, lead.source, lead.nextAction].some((value) => value?.toLowerCase().includes(term)));
  }, [leads, query]);
  return (
    <Screen>
      <PageHeader eyebrow="Private contacts" title="Leads" subtitle={`${leads.length} fictional leads across the active pipeline.`} action={<Button label="Add lead" icon="add" onPress={() => router.push('/quick-add')} />} />
      <View style={styles.search}><Ionicons name="search" size={20} color={colors.textMuted} /><TextInput accessibilityLabel="Search leads" placeholder="Search name, phone, email, campaign or next action" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} style={styles.searchInput} /><Text style={styles.count}>{filtered.length}</Text></View>
      {filtered.length ? <View style={styles.grid}>{filtered.map((lead) => <View key={lead.id} style={styles.item}><LeadCard lead={lead} /></View>)}</View> : <EmptyState icon="search-outline" title="No matching leads" detail="Try another name, phone number, source, or next action." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  count: { color: colors.textMuted, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  item: { minWidth: 310, flexBasis: 390, flexGrow: 1 },
});
