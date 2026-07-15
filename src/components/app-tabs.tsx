import Ionicons from '@expo/vector-icons/Ionicons';
import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

const items = [
  { name: 'today', href: '/today' as const, label: 'Today', icon: 'today-outline' as const },
  { name: 'leads', href: '/leads' as const, label: 'Leads', icon: 'people-outline' as const },
  { name: 'pipeline', href: '/pipeline' as const, label: 'Pipeline', icon: 'git-branch-outline' as const },
  { name: 'calendar', href: '/calendar' as const, label: 'Calendar', icon: 'calendar-outline' as const },
  { name: 'more', href: '/more' as const, label: 'More', icon: 'grid-outline' as const },
];

export default function AppTabs() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  return (
    <Tabs style={[styles.shell, wide && styles.shellWide]}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <View style={StyleSheet.flatten([styles.navigation, wide ? styles.sidebar : styles.bottomBar])}>
          {wide ? (
            <View style={styles.brand}>
              <View style={styles.mark}><Ionicons name="key" size={21} color={colors.navy} /></View>
              <View><Text style={styles.brandName}>CLOSEVAULT</Text><Text style={styles.brandTagline}>Private sales command centre</Text></View>
            </View>
          ) : null}
          {items.map((item) => (
            <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
              <TabButton label={item.label} icon={item.icon} wide={wide} />
            </TabTrigger>
          ))}
          {wide ? <View style={styles.demoPill}><View style={styles.demoDot} /><Text style={styles.demoText}>Fictional demo data</Text></View> : null}
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ label, icon, wide, isFocused, ...props }: TabTriggerSlotProps & { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; wide: boolean }) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.tabButton, wide ? styles.tabButtonWide : styles.tabButtonBottom, isFocused && styles.tabButtonActive, pressed && styles.pressed]}>
      <Ionicons name={icon} size={wide ? 20 : 22} color={isFocused ? colors.gold : wide ? '#C7D0DA' : colors.textMuted} />
      <Text style={[styles.tabLabel, wide && styles.tabLabelWide, isFocused && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  shellWide: { flexDirection: 'row-reverse' },
  slot: { flex: 1 },
  navigation: { backgroundColor: colors.navy },
  sidebar: { width: 238, paddingHorizontal: spacing.md, paddingVertical: spacing.xl, gap: spacing.sm, flexDirection: 'column', justifyContent: 'flex-start' },
  bottomBar: { height: 74, paddingHorizontal: spacing.sm, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl, paddingHorizontal: spacing.sm },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: colors.surface, fontWeight: '900', fontSize: 15, letterSpacing: 1.3 },
  brandTagline: { color: '#9DAFBE', fontSize: 10, marginTop: 2 },
  tabButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tabButtonWide: { minHeight: 48, borderRadius: 10, paddingHorizontal: spacing.md },
  tabButtonBottom: { flex: 1, flexDirection: 'column', gap: 3, justifyContent: 'center', minHeight: 54 },
  tabButtonActive: { backgroundColor: '#18344F' },
  tabLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  tabLabelWide: { color: '#C7D0DA', fontSize: 14 },
  tabLabelActive: { color: colors.gold },
  pressed: { opacity: 0.72 },
  demoPill: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 10, backgroundColor: colors.navySoft },
  demoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  demoText: { color: '#C7D0DA', fontSize: 11, fontWeight: '700' },
});
