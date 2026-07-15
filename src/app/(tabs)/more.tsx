import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, PageHeader, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

const actions = [
  { title: 'Apartment options', detail: 'Rank verified unit types against a requirement', icon: 'business-outline' as const, href: '/options' as const, ready: true },
  { title: 'Payment calculator', detail: 'Build and reconcile a configurable payment plan', icon: 'calculator-outline' as const, href: '/calculator' as const, ready: true },
  { title: 'Documents', detail: 'Private, versioned project documents', icon: 'document-lock-outline' as const },
  { title: 'Message templates', detail: 'Manual, owner-approved WhatsApp messages', icon: 'chatbubble-ellipses-outline' as const },
  { title: 'Site visits', detail: 'Briefings, outcomes and follow-ups', icon: 'location-outline' as const },
  { title: 'Commissions', detail: 'Potential, weighted, qualified and received', icon: 'cash-outline' as const },
  { title: 'Reports', detail: 'Personal conversion and opportunity reports', icon: 'bar-chart-outline' as const },
  { title: 'CSV imports', detail: 'Validated Meta and portal lead imports', icon: 'cloud-upload-outline' as const },
  { title: 'Settings & security', detail: 'Owner profile, biometrics and auto-lock', icon: 'shield-checkmark-outline' as const },
  { title: 'Backup & export', detail: 'Explicit, owner-controlled exports', icon: 'archive-outline' as const },
];

export default function MoreScreen() {
  return <Screen><PageHeader eyebrow="Private workspace" title="More tools" subtitle="The demo enables apartment recommendations and the payment calculator. Backend-dependent tools remain clearly identified." /><View style={styles.grid}>{actions.map((action) => <Pressable key={action.title} disabled={!action.ready} onPress={() => action.href && router.push(action.href)} style={styles.item}>{({ pressed }) => <Card style={[styles.card, !action.ready ? styles.disabled : undefined, pressed ? styles.pressed : undefined]}><View style={styles.icon}><Ionicons name={action.icon} size={22} color={colors.gold} /></View><View style={styles.copy}><View style={styles.inline}><Text style={styles.title}>{action.title}</Text>{action.ready ? <Badge label="Demo ready" tone="success" /> : <Badge label="Next phase" tone="neutral" />}</View><Text style={styles.detail}>{action.detail}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Card>}</Pressable>)}</View></Screen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  item: { flexGrow: 1, flexBasis: 380, minWidth: 300 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 100 },
  disabled: { opacity: 0.65 }, pressed: { opacity: 0.75 },
  icon: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: spacing.sm }, inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.navy, fontWeight: '800', fontSize: 15 }, detail: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
