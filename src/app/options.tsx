import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge, Card, PageHeader, Screen, SectionHeader } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { formatLkr, rankUnitTypes } from '@/domain/business-rules';
import { project } from '@/data/demo-fixtures';
import { useDemoData } from '@/providers/demo-data-provider';

export default function OptionsScreen() {
  const { unitTypes } = useDemoData();
  const [bedrooms, setBedrooms] = useState(3);
  const [maxBudget, setMaxBudget] = useState('60000000');
  const [preferredSize, setPreferredSize] = useState('1450');
  const matches = useMemo(() => rankUnitTypes(unitTypes, { bedrooms, maxBudget: Number(maxBudget) || undefined, preferredSize: Number(preferredSize) || undefined }), [bedrooms, maxBudget, preferredSize, unitTypes]);
  return (
    <Screen>
      <PageHeader eyebrow="Rule-based matching" title="Apartment options" subtitle={`${project.name} · Information last updated ${new Date(project.lastUpdatedAt).toLocaleDateString('en-LK')}. Confirm current price and availability before presenting an option.`} />
      <Card><SectionHeader title="Client requirement" detail="Adjust to re-rank" /><View style={styles.form}><View style={styles.field}><Text style={styles.label}>Bedrooms</Text><View style={styles.choices}>{[2, 3, 4].map((value) => <Pressable key={value} onPress={() => setBedrooms(value)} style={[styles.choice, bedrooms === value && styles.choiceActive]}><Text style={[styles.choiceText, bedrooms === value && styles.choiceTextActive]}>{value}</Text></Pressable>)}</View></View><View style={styles.field}><Text style={styles.label}>Maximum budget (LKR)</Text><TextInput accessibilityLabel="Maximum budget" keyboardType="number-pad" value={maxBudget} onChangeText={setMaxBudget} style={styles.input} /></View><View style={styles.field}><Text style={styles.label}>Preferred size (sqft)</Text><TextInput accessibilityLabel="Preferred size" keyboardType="number-pad" value={preferredSize} onChangeText={setPreferredSize} style={styles.input} /></View></View></Card>
      <View><SectionHeader title="Recommended matches" detail={`${matches.length} verified unit types`} /><View style={styles.results}>{matches.slice(0, 5).map((unit, index) => <Card key={unit.id} style={styles.result}><View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View><View style={styles.resultCopy}><View style={styles.inline}><Text style={styles.title}>{unit.typeName}</Text>{index === 0 ? <Badge label="Best match" tone="success" /> : null}</View><Text style={styles.spec}>{unit.squareFeet.toLocaleString()} sqft · {unit.bedrooms} bedrooms · {unit.bathrooms} bathrooms{unit.maidRoom ? ' · Maid’s room' : ''}</Text><Text style={styles.reason}>{unit.reason}</Text></View><View style={styles.price}><Text style={styles.priceValue}>{formatLkr(unit.price)}</Text><Text style={styles.perSqft}>{formatLkr(Math.round(unit.price / unit.squareFeet))} / sqft</Text></View></Card>)}</View></View>
      <Text style={styles.disclosure}>These are unit-type recommendations, not live unit inventory. No unit number, floor, facing or availability has been invented.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }, field: { flex: 1, minWidth: 180, gap: spacing.sm }, label: { color: colors.navy, fontWeight: '800', fontSize: 12 }, choices: { flexDirection: 'row', gap: spacing.sm }, choice: { width: 48, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' }, choiceActive: { backgroundColor: colors.navy, borderColor: colors.navy }, choiceText: { color: colors.navy, fontWeight: '800' }, choiceTextActive: { color: colors.gold }, input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.md, color: colors.text },
  results: { gap: spacing.md }, result: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg }, rank: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' }, rankText: { color: colors.navy, fontWeight: '900' }, resultCopy: { flex: 1, gap: 4 }, inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, title: { color: colors.navy, fontSize: 16, fontWeight: '900' }, spec: { color: colors.text, fontSize: 12 }, reason: { color: colors.textMuted, fontSize: 12 }, price: { alignItems: 'flex-end' }, priceValue: { color: colors.navy, fontWeight: '900', fontSize: 15 }, perSqft: { color: colors.textMuted, fontSize: 10, marginTop: 4 }, disclosure: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
