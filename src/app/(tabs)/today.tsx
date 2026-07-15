import Ionicons from '@expo/vector-icons/Ionicons';
import { format, isToday, isBefore } from 'date-fns';
import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Badge, Button, Card, PageHeader, Screen, SectionHeader } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { commission, formatLkr } from '@/domain/business-rules';
import { useDemoData } from '@/providers/demo-data-provider';

export default function TodayScreen() {
  const { width } = useWindowDimensions();
  const { leads, followUps, siteVisits, completeFollowUp, getLead } = useDemoData();
  const openFollowUps = followUps.filter((item) => item.status !== 'completed');
  const dueToday = openFollowUps.filter((item) => isToday(new Date(item.dueAt)));
  const overdue = openFollowUps.filter((item) => isBefore(new Date(item.dueAt), new Date()));
  const newLeads = leads.filter((lead) => lead.stage === 'new');
  const hotLeads = leads.filter((lead) => lead.temperature === 'hot');
  const commissionTotals = leads.reduce(
    (sum, lead) => {
      const value = commission(lead.potentialPropertyValue, 2, lead.probability);
      return { pipeline: sum.pipeline + lead.potentialPropertyValue, potential: sum.potential + value.potential, weighted: sum.weighted + value.weighted };
    },
    { pipeline: 0, potential: 0, weighted: 0 },
  );
  const compact = width < 720;

  return (
    <Screen>
      <PageHeader
        eyebrow={format(new Date(), 'EEEE, dd MMMM')}
        title="Good morning"
        subtitle="Here is the shortest path through today’s conversations and opportunities."
        action={<Button label={compact ? 'Add' : 'Quick add lead'} icon="add" onPress={() => router.push('/quick-add')} />}
      />

      <View style={[styles.stats, compact && styles.statsCompact]}>
        <SummaryCard icon="person-add-outline" label="New, not contacted" value={newLeads.length} tone="info" />
        <SummaryCard icon="time-outline" label="Due today" value={dueToday.length} tone="warning" />
        <SummaryCard icon="alert-circle-outline" label="Overdue" value={overdue.length} tone="danger" />
        <SummaryCard icon="flame-outline" label="Hot leads" value={hotLeads.length} tone="success" />
      </View>

      <View style={[styles.columns, !compact && styles.columnsWide]}>
        <View style={styles.primaryColumn}>
          <View>
            <SectionHeader title="Contact first" detail={`${dueToday.length + overdue.length} actions need attention`} />
            <View style={styles.stack}>
              {[...openFollowUps].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 5).map((followUp) => {
                const lead = getLead(followUp.leadId);
                if (!lead) return null;
                const isOverdue = isBefore(new Date(followUp.dueAt), new Date());
                return (
                  <Card key={followUp.id} style={styles.taskCard}>
                    <Pressable style={styles.taskMain} onPress={() => router.push(`/lead/${lead.id}`)}>
                      <View style={[styles.taskIcon, isOverdue ? styles.taskIconDanger : styles.taskIconGold]}>
                        <Ionicons name={isOverdue ? 'alert' : 'call-outline'} size={19} color={isOverdue ? colors.danger : colors.warning} />
                      </View>
                      <View style={styles.taskCopy}>
                        <View style={styles.inline}><Text style={styles.taskName}>{lead.fullName}</Text><Badge label={lead.priority} tone={lead.priority === 'A' ? 'danger' : 'info'} /></View>
                        <Text style={styles.taskTitle}>{followUp.title}</Text>
                        <Text style={[styles.taskTime, isOverdue && styles.overdueText]}>{isOverdue ? 'Overdue · ' : ''}{format(new Date(followUp.dueAt), 'h:mm a')}</Text>
                      </View>
                    </Pressable>
                    <View style={styles.taskActions}>
                      <Pressable accessibilityLabel={`Call ${lead.fullName}`} style={styles.iconButton} onPress={() => Linking.openURL(`tel:${lead.normalizedPhone}`)}><Ionicons name="call" size={18} color={colors.navy} /></Pressable>
                      <Pressable accessibilityLabel={`Open WhatsApp for ${lead.fullName}`} style={styles.iconButton} onPress={() => Linking.openURL(`https://wa.me/${lead.normalizedPhone.slice(1)}`)}><Ionicons name="logo-whatsapp" size={19} color={colors.success} /></Pressable>
                      <Button label="Complete" variant="secondary" onPress={() => completeFollowUp(followUp.id)} />
                    </View>
                  </Card>
                );
              })}
            </View>
          </View>

          <View>
            <SectionHeader title="Site visits" detail="Today" />
            {siteVisits.map((visit) => {
              const lead = getLead(visit.leadId);
              return (
                <Card key={visit.id} style={styles.visitCard}>
                  <View style={styles.calendarTile}><Text style={styles.calendarDay}>{format(new Date(visit.scheduledAt), 'dd')}</Text><Text style={styles.calendarMonth}>{format(new Date(visit.scheduledAt), 'MMM')}</Text></View>
                  <View style={styles.taskCopy}><Text style={styles.taskName}>{lead?.fullName}</Text><Text style={styles.taskTitle}>{format(new Date(visit.scheduledAt), 'h:mm a')} · {visit.meetingPoint}</Text><Badge label={visit.status} tone="success" /></View>
                  {lead ? <Button label="Briefing" variant="secondary" onPress={() => router.push(`/lead/${lead.id}`)} /> : null}
                </Card>
              );
            })}
          </View>
        </View>

        <View style={styles.sideColumn}>
          <Card style={styles.opportunityCard}>
            <SectionHeader title="Opportunity" detail="Open pipeline" />
            <MoneyRow label="Pipeline value" value={commissionTotals.pipeline} />
            <MoneyRow label="Potential commission" value={commissionTotals.potential} />
            <MoneyRow label="Weighted commission" value={commissionTotals.weighted} emphasis />
            <View style={styles.divider} />
            <MoneyRow label="Qualified" value={0} />
            <MoneyRow label="Received" value={0} />
            <Text style={styles.disclaimer}>Demo values use the configurable default 2% rate. Reservations are not counted as completed sales.</Text>
          </Card>
          <Card>
            <SectionHeader title="Attention signal" detail="Rule-based" />
            <View style={styles.signal}><Ionicons name="sparkles-outline" size={20} color={colors.gold} /><Text style={styles.signalText}>Naveen’s payment-plan follow-up is overdue and represents the highest weighted opportunity.</Text></View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: number; tone: 'info' | 'warning' | 'danger' | 'success' }) {
  return <Card style={styles.summaryCard}><View style={[styles.summaryIcon, styles[`summary_${tone}`]]}><Ionicons name={icon} size={20} color={colors[tone]} /></View><View><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View></Card>;
}

function MoneyRow({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return <View style={styles.moneyRow}><Text style={styles.moneyLabel}>{label}</Text><Text style={[styles.moneyValue, emphasis && styles.moneyEmphasis]}>{formatLkr(value)}</Text></View>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.md },
  statsCompact: { flexWrap: 'wrap' },
  summaryCard: { minWidth: 150, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  summaryIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  summary_info: { backgroundColor: colors.infoSoft }, summary_warning: { backgroundColor: colors.warningSoft }, summary_danger: { backgroundColor: colors.dangerSoft }, summary_success: { backgroundColor: colors.successSoft },
  summaryValue: { color: colors.navy, fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: colors.textMuted, fontSize: 11 },
  columns: { gap: spacing.xl },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  primaryColumn: { flex: 1.7, gap: spacing.xl },
  sideColumn: { flex: 1, gap: spacing.lg },
  stack: { gap: spacing.md },
  taskCard: { padding: spacing.md, gap: spacing.md },
  taskMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  taskIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  taskIconDanger: { backgroundColor: colors.dangerSoft },
  taskIconGold: { backgroundColor: colors.warningSoft },
  taskCopy: { flex: 1, gap: 3 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  taskName: { color: colors.navy, fontSize: 15, fontWeight: '800' },
  taskTitle: { color: colors.text, fontSize: 13 },
  taskTime: { color: colors.textMuted, fontSize: 12 },
  overdueText: { color: colors.danger, fontWeight: '700' },
  taskActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  iconButton: { width: 44, height: 44, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  visitCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  calendarTile: { width: 50, height: 56, borderRadius: 10, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  calendarDay: { color: colors.surface, fontSize: 18, fontWeight: '900' },
  calendarMonth: { color: colors.gold, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  opportunityCard: { backgroundColor: colors.navy, borderColor: colors.navy },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  moneyLabel: { color: '#B5C1CC', fontSize: 13 },
  moneyValue: { color: colors.surface, fontWeight: '700', fontSize: 13 },
  moneyEmphasis: { color: colors.gold, fontSize: 16, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.navySoft, marginVertical: spacing.sm },
  disclaimer: { color: '#91A2B2', fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  signal: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  signalText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 20 },
});
