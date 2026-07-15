import Ionicons from '@expo/vector-icons/Ionicons';
import { format } from 'date-fns';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, PriorityBadge, Screen, SectionHeader, TemperatureBadge, textStyles } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { commission, formatLkr } from '@/domain/business-rules';
import { useDemoData } from '@/providers/demo-data-provider';

export default function LeadProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getLead, activities, followUps } = useDemoData();
  const lead = getLead(id);
  if (!lead) return <Screen><EmptyState title="Lead not found" detail="This fictional demo lead may have been removed from the current session." /></Screen>;
  const leadActivities = activities.filter((item) => item.leadId === lead.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const leadFollowUps = followUps.filter((item) => item.leadId === lead.id && item.status !== 'completed');
  const values = commission(lead.potentialPropertyValue, 2, lead.probability);
  return (
    <Screen>
      <Stack.Screen options={{ headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Back to leads" onPress={() => router.replace('/leads')} style={styles.backButton}><Ionicons name="chevron-back" size={22} color={colors.surface} /><Text style={styles.backText}>Leads</Text></Pressable> }} />
      <View style={styles.hero}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{lead.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</Text></View>
        <View style={styles.heroCopy}><Text style={styles.name}>{lead.fullName}</Text><Text style={styles.phone}>{lead.displayPhone} · {lead.source}</Text><View style={styles.badges}><PriorityBadge priority={lead.priority} /><TemperatureBadge temperature={lead.temperature} /><Badge label={lead.stage} tone="gold" /></View></View>
        <View style={styles.score}><Text style={styles.scoreValue}>{lead.score}</Text><Text style={styles.scoreLabel}>Lead score</Text></View>
      </View>

      <View style={styles.actions}>
        <Button label="Call" icon="call" onPress={() => Linking.openURL(`tel:${lead.normalizedPhone}`)} />
        <Button label="WhatsApp" icon="logo-whatsapp" variant="secondary" onPress={() => Linking.openURL(`https://wa.me/${lead.normalizedPhone.slice(1)}`)} />
        <Button label="Add activity" icon="add-circle-outline" variant="secondary" onPress={() => {}} />
        <Button label="Follow-up" icon="alarm-outline" variant="secondary" onPress={() => {}} />
      </View>

      <View style={styles.summaryGrid}>
        <Card style={styles.summary}><Text style={styles.caption}>Probability</Text><Text style={styles.summaryValue}>{lead.probability}%</Text></Card>
        <Card style={styles.summary}><Text style={styles.caption}>Potential commission</Text><Text style={styles.summaryValue}>{formatLkr(values.potential)}</Text></Card>
        <Card style={styles.summary}><Text style={styles.caption}>Weighted commission</Text><Text style={[styles.summaryValue, styles.success]}>{formatLkr(values.weighted)}</Text></Card>
        <Card style={styles.summary}><Text style={styles.caption}>Next follow-up</Text><Text style={styles.summaryValue}>{lead.nextFollowUpAt ? format(new Date(lead.nextFollowUpAt), 'dd MMM · h:mm a') : 'Not set'}</Text></Card>
      </View>

      <View style={styles.twoColumns}>
        <View style={styles.column}>
          <Card>
            <SectionHeader title="Overview" detail="Current context" />
            <Detail label="Next action" value={lead.nextAction} />
            <Detail label="Requirement" value={`${lead.bedroomInterest} bedrooms${lead.budgetMax ? ` · Up to ${formatLkr(lead.budgetMax)}` : ''}`} />
            <Detail label="Motivation" value={lead.motivation ?? 'Not captured yet'} />
            <Detail label="Main objection" value={lead.primaryObjection ?? 'Not captured yet'} />
            <Detail label="Email" value={lead.email ?? 'Not provided'} />
          </Card>
          <Card>
            <SectionHeader title="Timeline" detail={`${leadActivities.length} activities`} />
            <View style={styles.timeline}>{leadActivities.map((activity) => <View key={activity.id} style={styles.timelineItem}><View style={styles.timelineDot} /><View style={styles.timelineCopy}><Text style={styles.timelineTitle}>{activity.title}</Text><Text style={textStyles.body}>{activity.summary}</Text><Text style={textStyles.muted}>{format(new Date(activity.occurredAt), 'dd MMM yyyy · h:mm a')}</Text></View></View>)}</View>
          </Card>
        </View>
        <View style={styles.sideColumn}>
          <Card style={styles.nextCard}>
            <SectionHeader title="Next action" detail="Active-lead rule" />
            <Text style={styles.nextAction}>{lead.nextAction}</Text>
            <Text style={styles.nextDetail}>{leadFollowUps.length ? `${leadFollowUps.length} open follow-up` : 'No open follow-up—one is required for an active lead.'}</Text>
          </Card>
          <Card>
            <SectionHeader title="Score explanation" detail="Transparent rules" />
            <View style={styles.reasons}>{lead.scoreReasons.map((reason) => <View key={reason} style={styles.reason}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><Text style={textStyles.body}>{reason}</Text></View>)}</View>
          </Card>
          <Card style={styles.privateCard}>
            <View style={styles.privateTitle}><Ionicons name="lock-closed" size={18} color={colors.gold} /><Text style={styles.privateHeading}>Private strategy</Text></View>
            <Text style={styles.privateCopy}>{lead.privateStrategyNotes ?? 'No private strategy notes yet.'}</Text>
            <Text style={styles.privateWarning}>Visible only to the authenticated owner after the database is connected.</Text>
          </Card>
        </View>
      </View>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg }, avatar: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.gold, fontSize: 20, fontWeight: '900' },
  heroCopy: { flex: 1, gap: spacing.xs }, name: { color: colors.navy, fontSize: 28, fontWeight: '900' }, phone: { color: colors.textMuted, fontSize: 13 }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }, score: { alignItems: 'center' }, scoreValue: { color: colors.navy, fontSize: 27, fontWeight: '900' }, scoreLabel: { color: colors.textMuted, fontSize: 10, textTransform: 'uppercase' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, summary: { flex: 1, minWidth: 180, gap: spacing.sm }, caption: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }, summaryValue: { color: colors.navy, fontWeight: '800', fontSize: 15 }, success: { color: colors.success },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' }, column: { flex: 2, minWidth: 320, gap: spacing.lg }, sideColumn: { flex: 1, minWidth: 280, gap: spacing.lg },
  detail: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.md, gap: 4 }, detailLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }, detailValue: { color: colors.text, fontSize: 14, lineHeight: 21 },
  timeline: { gap: spacing.lg }, timelineItem: { flexDirection: 'row', gap: spacing.md }, timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold, marginTop: 6 }, timelineCopy: { flex: 1, gap: 3, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, timelineTitle: { color: colors.navy, fontWeight: '800' },
  nextCard: { borderLeftWidth: 4, borderLeftColor: colors.warning }, nextAction: { color: colors.navy, fontSize: 17, fontWeight: '900' }, nextDetail: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }, reasons: { gap: spacing.sm }, reason: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  privateCard: { backgroundColor: colors.navy, borderColor: colors.navy }, privateTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, privateHeading: { color: colors.gold, fontSize: 16, fontWeight: '900' }, privateCopy: { color: colors.surface, fontSize: 14, lineHeight: 22, marginTop: spacing.md }, privateWarning: { color: '#9DAFBE', fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 }, backText: { color: colors.surface, fontWeight: '700' },
});
