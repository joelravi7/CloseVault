import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, PriorityBadge, TemperatureBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { commission, formatLkr } from '@/domain/business-rules';
import type { Lead } from '@/domain/models';

export function LeadCard({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const { weighted } = commission(lead.potentialPropertyValue, 2, lead.probability);
  return (
    <Pressable onPress={() => router.push(`/lead/${lead.id}`)} accessibilityRole="button" accessibilityLabel={`Open ${lead.fullName}`}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed ? styles.pressed : undefined]}>
          <View style={styles.topRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{lead.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</Text></View>
            <View style={styles.main}>
              <Text style={styles.name}>{lead.fullName}</Text>
              <Text style={styles.meta}>{lead.bedroomInterest} bedrooms · {lead.source}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
          <View style={styles.badges}>
            <PriorityBadge priority={lead.priority} />
            <TemperatureBadge temperature={lead.temperature} />
            <Badge label={lead.stage} tone="neutral" />
          </View>
          {!compact ? (
            <View style={styles.footer}>
              <View style={styles.nextAction}>
                <Text style={styles.caption}>Next action</Text>
                <Text numberOfLines={1} style={styles.action}>{lead.nextAction}</Text>
              </View>
              <View>
                <Text style={[styles.caption, styles.alignRight]}>Weighted commission</Text>
                <Text style={styles.money}>{formatLkr(weighted)}</Text>
              </View>
            </View>
          ) : null}
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  pressed: { opacity: 0.75 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.gold, fontSize: 13, fontWeight: '900' },
  main: { flex: 1, gap: 2 },
  name: { color: colors.navy, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  nextAction: { flex: 1 },
  caption: { color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.5 },
  action: { color: colors.text, fontWeight: '700', marginTop: 3 },
  alignRight: { textAlign: 'right' },
  money: { color: colors.success, fontWeight: '800', fontSize: 13, marginTop: 3, textAlign: 'right' },
});
