import Ionicons from '@expo/vector-icons/Ionicons';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  type PressableProps,
  type StyleProp,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, maxContentWidth, radii, shadow, spacing } from '@/constants/theme';
import type { LeadPriority, LeadTemperature } from '@/domain/models';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const content = <View style={styles.screenContent}>{children}</View>;
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {scroll ? <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

export function Button({
  label,
  icon,
  variant = 'primary',
  loading,
  ...props
}: PressableProps & {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && styles.pressed, props.disabled && styles.disabled]}
      {...props}>
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.surface : colors.navy} /> : icon ? <Ionicons name={icon} size={18} color={variant === 'primary' ? colors.surface : variant === 'danger' ? colors.danger : colors.navy} /> : null}
      <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold' }) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label.replaceAll('_', ' ')}</Text>
    </View>
  );
}

export function PriorityBadge({ priority }: { priority: LeadPriority }) {
  const tone = priority === 'A' ? 'danger' : priority === 'B' ? 'warning' : priority === 'closed' ? 'neutral' : 'info';
  return <Badge label={`Priority ${priority}`} tone={tone} />;
}

export function TemperatureBadge({ temperature }: { temperature: LeadTemperature }) {
  const tone = temperature === 'hot' ? 'danger' : temperature === 'warm' ? 'warning' : temperature === 'closed' ? 'neutral' : 'info';
  return <Badge label={temperature} tone={tone} />;
}

export function EmptyState({ icon = 'file-tray-outline', title, detail }: { icon?: React.ComponentProps<typeof Ionicons>['name']; title: string; detail: string }) {
  return (
    <Card style={styles.emptyState}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={colors.gold} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </Card>
  );
}

export const textStyles = StyleSheet.create({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  label: { color: colors.navy, fontSize: 13, fontWeight: '700' },
  value: { color: colors.text, fontSize: 15, fontWeight: '600' },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1 },
  screenContent: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 100, gap: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.lg },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.gold, fontWeight: '800', fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  pageTitle: { color: colors.navy, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 21, maxWidth: 680 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, ...shadow },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md, marginBottom: spacing.md },
  sectionTitle: { color: colors.navy, fontSize: 18, fontWeight: '800' },
  sectionDetail: { color: colors.textMuted, fontSize: 12 },
  button: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1 },
  button_primary: { backgroundColor: colors.navy, borderColor: colors.navy },
  button_secondary: { backgroundColor: colors.surface, borderColor: colors.border },
  button_ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  button_danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  buttonText: { fontWeight: '800', fontSize: 14 },
  buttonText_primary: { color: colors.surface },
  buttonText_secondary: { color: colors.navy },
  buttonText_ghost: { color: colors.navy },
  buttonText_danger: { color: colors.danger },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.pill },
  badge_neutral: { backgroundColor: '#EEF0F3' },
  badge_success: { backgroundColor: colors.successSoft },
  badge_warning: { backgroundColor: colors.warningSoft },
  badge_danger: { backgroundColor: colors.dangerSoft },
  badge_info: { backgroundColor: colors.infoSoft },
  badge_gold: { backgroundColor: colors.goldSoft },
  badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  badgeText_neutral: { color: colors.textMuted },
  badgeText_success: { color: colors.success },
  badgeText_warning: { color: colors.warning },
  badgeText_danger: { color: colors.danger },
  badgeText_info: { color: colors.info },
  badgeText_gold: { color: '#80651E' },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.navy, fontSize: 16, fontWeight: '800' },
  emptyDetail: { color: colors.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 360 },
});
