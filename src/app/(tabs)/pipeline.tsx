import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { LeadCard } from '@/components/lead-card';
import { Badge, Card, PageHeader, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import type { LeadStage } from '@/domain/models';
import { useDemoData } from '@/providers/demo-data-provider';

const columns: { stage: LeadStage; label: string }[] = [
  { stage: 'new', label: 'New' },
  { stage: 'documents_sent', label: 'Documents sent' },
  { stage: 'site_visit_planned', label: 'Site visit' },
  { stage: 'negotiation', label: 'Negotiation' },
  { stage: 'long_term_follow_up', label: 'Long-term' },
];

export default function PipelineScreen() {
  const { leads } = useDemoData();
  return (
    <Screen scroll={false}>
      <PageHeader eyebrow="Stage view" title="Pipeline" subtitle="Lead movement is confirmed and recorded in stage history when the live database is connected." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.board}>
        {columns.map((column) => {
          const matches = leads.filter((lead) => lead.stage === column.stage);
          return <View key={column.stage} style={styles.column}><View style={styles.columnHeader}><Text style={styles.columnTitle}>{column.label}</Text><Badge label={`${matches.length}`} tone="gold" /></View><View style={styles.stack}>{matches.map((lead) => <LeadCard key={lead.id} lead={lead} compact />)}{matches.length === 0 ? <Card><Text style={styles.empty}>No leads in this stage</Text></Card> : null}</View></View>;
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.lg, paddingBottom: 90 },
  column: { width: 300, gap: spacing.md },
  columnHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  columnTitle: { color: colors.navy, fontWeight: '800', fontSize: 14 },
  stack: { gap: spacing.md },
  empty: { color: colors.textMuted, textAlign: 'center', fontSize: 12 },
});
