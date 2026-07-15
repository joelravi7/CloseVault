import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge, Button, Card, PageHeader, Screen, SectionHeader } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { formatLkr, reconcilePayments } from '@/domain/business-rules';

export default function CalculatorScreen() {
  const [basePrice, setBasePrice] = useState('54000000');
  const [discount, setDiscount] = useState('0');
  const [reservation, setReservation] = useState('500000');
  const [initial, setInitial] = useState('15700000');
  const [monthlyAmount, setMonthlyAmount] = useState('900000');
  const [monthlyCount, setMonthlyCount] = useState('24');
  const finalPrice = Math.max(0, Number(basePrice) - Number(discount));
  const monthlyTotal = Number(monthlyAmount) * Number(monthlyCount);
  const suggestedFinal = Math.max(0, finalPrice - Number(reservation) - Number(initial) - monthlyTotal);
  const [finalPaymentOverride, setFinalPaymentOverride] = useState<string | null>(null);
  const finalPayment = finalPaymentOverride === null ? suggestedFinal : Number(finalPaymentOverride);
  const result = useMemo(() => reconcilePayments(finalPrice, [Number(reservation), Number(initial), monthlyTotal, finalPayment]), [finalPayment, finalPrice, initial, monthlyTotal, reservation]);
  return (
    <Screen>
      <PageHeader eyebrow="Configurable plan" title="Payment calculator" subtitle="The calculator reconciles each component without inventing project-specific payment conditions." />
      <View style={styles.columns}>
        <Card style={styles.formCard}><SectionHeader title="Plan inputs" detail="LKR" /><View style={styles.form}><Input label="Base price" value={basePrice} onChangeText={setBasePrice} /><Input label="Discount" value={discount} onChangeText={setDiscount} /><Input label="Reservation" value={reservation} onChangeText={setReservation} /><Input label="Initial payment" value={initial} onChangeText={setInitial} /><View style={styles.row}><View style={styles.flex}><Input label="Monthly amount" value={monthlyAmount} onChangeText={setMonthlyAmount} /></View><View style={styles.small}><Input label="Months" value={monthlyCount} onChangeText={setMonthlyCount} /></View></View><Input label="Final payment" value={String(finalPayment)} onChangeText={setFinalPaymentOverride} /><Button label="Reset final payment to balance" variant="secondary" onPress={() => setFinalPaymentOverride(null)} /></View></Card>
        <View style={styles.summaryColumn}><Card style={styles.summary}><SectionHeader title="Payment summary" detail="Draft" /><Money label="Final property value" value={finalPrice} strong /><View style={styles.divider} /><Money label="Reservation" value={Number(reservation)} /><Money label="Initial payment" value={Number(initial)} /><Money label={`${Number(monthlyCount) || 0} monthly payments`} value={monthlyTotal} /><Money label="Final payment" value={finalPayment} /><View style={styles.divider} /><Money label="Total scheduled" value={result.total} strong /><Money label="Difference" value={result.difference} danger={result.difference !== 0} /><View style={styles.status}>{result.reconciled ? <Badge label="Plan reconciles" tone="success" /> : <Badge label="Plan does not reconcile" tone="danger" />}<Text style={styles.statusCopy}>{result.reconciled ? 'This draft can proceed to review.' : 'Saving as a final plan must remain blocked. It may only be retained as an incomplete draft.'}</Text></View></Card><Card><Text style={styles.disclosure}>Payment terms are subject to approval and the applicable reservation, initial and milestone payment requirements.</Text></Card></View>
      </View>
    </Screen>
  );
}

function Input({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} keyboardType="number-pad" value={value} onChangeText={onChangeText} style={styles.input} /></View>; }
function Money({ label, value, strong, danger }: { label: string; value: number; strong?: boolean; danger?: boolean }) { return <View style={styles.money}><Text style={[styles.moneyLabel, strong && styles.strong]}>{label}</Text><Text style={[styles.moneyValue, strong && styles.strong, danger && styles.danger]}>{formatLkr(value)}</Text></View>; }

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' }, formCard: { flex: 1.2, minWidth: 320 }, summaryColumn: { flex: 1, minWidth: 300, gap: spacing.lg }, form: { gap: spacing.lg }, field: { gap: spacing.sm }, label: { color: colors.navy, fontSize: 12, fontWeight: '800' }, input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: colors.surface }, row: { flexDirection: 'row', gap: spacing.md }, flex: { flex: 1 }, small: { width: 100 }, summary: { backgroundColor: colors.navy, borderColor: colors.navy }, money: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm }, moneyLabel: { color: '#BAC5CF', fontSize: 13 }, moneyValue: { color: colors.surface, fontWeight: '700' }, strong: { color: colors.gold, fontWeight: '900', fontSize: 15 }, danger: { color: '#FF8793' }, divider: { height: 1, backgroundColor: colors.navySoft, marginVertical: spacing.sm }, status: { marginTop: spacing.lg, gap: spacing.sm }, statusCopy: { color: '#AEBBC6', fontSize: 11, lineHeight: 17 }, disclosure: { color: colors.text, fontSize: 12, lineHeight: 19, textAlign: 'center' },
});
