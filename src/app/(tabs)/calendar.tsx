import Ionicons from '@expo/vector-icons/Ionicons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, PageHeader, Screen, SectionHeader } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useDemoData } from '@/providers/demo-data-provider';

export default function CalendarScreen() {
  const { followUps, siteVisits, getLead } = useDemoData();
  const events = [
    ...followUps.filter((item) => item.status !== 'completed').map((item) => ({ id: item.id, leadId: item.leadId, at: item.dueAt, title: item.title, kind: 'Follow-up' })),
    ...siteVisits.map((item) => ({ id: item.id, leadId: item.leadId, at: item.scheduledAt, title: 'Site visit', kind: 'Site visit' })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Screen>
      <PageHeader eyebrow="Asia / Colombo" title="Calendar" subtitle="A focused agenda for follow-ups, site visits, deadlines and commission actions." />
      <SectionHeader title="Agenda" detail={`${events.length} upcoming items`} />
      <View style={styles.timeline}>
        {events.map((event) => {
          const lead = getLead(event.leadId);
          return <Pressable key={`${event.kind}-${event.id}`} onPress={() => lead && router.push(`/lead/${lead.id}`)}><Card style={styles.event}><View style={styles.date}><Text style={styles.day}>{format(new Date(event.at), 'dd')}</Text><Text style={styles.month}>{format(new Date(event.at), 'MMM')}</Text></View><View style={styles.copy}><View style={styles.inline}><Text style={styles.title}>{event.title}</Text><Badge label={event.kind} tone={event.kind === 'Site visit' ? 'success' : 'info'} /></View><Text style={styles.lead}>{lead?.fullName ?? 'Unknown lead'}</Text><Text style={styles.time}>{format(new Date(event.at), 'EEEE · h:mm a')}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Card></Pressable>;
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  timeline: { gap: spacing.md },
  event: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  date: { width: 54, height: 58, borderRadius: 10, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  day: { color: colors.surface, fontWeight: '900', fontSize: 19 },
  month: { color: colors.gold, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  copy: { flex: 1, gap: 3 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  lead: { color: colors.text, fontSize: 13 },
  time: { color: colors.textMuted, fontSize: 12 },
});
