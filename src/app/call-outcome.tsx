import { addDays, format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, EmptyState, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import type { LeadStage } from '@/domain/models';
import { useDemoData } from '@/providers/demo-data-provider';

const outcomes = ['Interested', 'Needs time', 'Requested documents', 'Site visit discussed', 'Call later', 'No answer', 'Busy', 'Switched off', 'Incorrect number', 'Not interested', 'Purchased elsewhere'];
const closed = (value: string) => ['Incorrect number', 'Not interested', 'Purchased elsewhere'].includes(value);

export default function CallOutcomeScreen() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>(); const { getLead, recordCallOutcome } = useDemoData(); const lead = getLead(leadId);
  const [outcome, setOutcome] = useState('Interested'); const [summary, setSummary] = useState(''); const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('Follow up after the call'); const [nextAt, setNextAt] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd'T'10:00")); const [saving, setSaving] = useState(false);
  if (!lead) return <Screen><EmptyState title="Lead not found" detail="Return to Leads and select a valid lead." /></Screen>;
  const save = async () => { if (!summary.trim()) return Alert.alert('Summary required', 'Add a short call summary.'); setSaving(true); try { await recordCallOutcome({ leadId: lead.id, outcome, summary, detailedNotes: notes, stage: (outcome === 'Requested documents' ? 'documents_sent' : outcome === 'Site visit discussed' ? 'serious_interest' : 'connected') as LeadStage, nextAction: closed(outcome) ? undefined : nextAction, nextFollowUpAt: closed(outcome) ? undefined : nextAt }); router.replace(`/lead/${lead.id}`); } catch (error) { Alert.alert('Cannot save', error instanceof Error ? error.message : 'Try again.'); } finally { setSaving(false); } };
  return <Screen><View><Text style={styles.title}>Record call outcome</Text><Text style={styles.subtitle}>{lead.fullName} · Saving a live outcome requires the next action unless the lead is closed.</Text></View><Card style={styles.form}>
    <View style={styles.field}><Text style={styles.label}>Outcome</Text><View style={styles.chips}>{outcomes.map((item) => <Pressable key={item} onPress={() => setOutcome(item)} style={[styles.chip, outcome === item && styles.selected]}><Text style={[styles.chipText, outcome === item && styles.selectedText]}>{item}</Text></Pressable>)}</View></View>
    <Field label="Conversation summary" value={summary} onChangeText={setSummary} multiline placeholder="What was discussed?" />
    <Field label="Private detailed notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Objections, motivation, or useful context" />
    {closed(outcome) ? <View style={styles.closed}><Text style={styles.closedText}>This outcome closes the lead as lost and removes its next-action requirement.</Text></View> : <><View style={styles.rule}><Text style={styles.ruleTitle}>Next action required</Text><Text style={styles.ruleText}>The call cannot be saved without a concrete next step and time.</Text></View><Field label="Next action" value={nextAction} onChangeText={setNextAction} /><Field label="Follow-up date and time" value={nextAt} onChangeText={setNextAt} /></>}
    <Button label="Save call outcome" icon="checkmark" loading={saving} disabled={saving} onPress={save} />
  </Card></Screen>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) { const { label, multiline, ...input } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...input} multiline={multiline} placeholderTextColor={colors.textMuted} style={[styles.input, multiline && styles.multiline]} /></View>; }
const styles = StyleSheet.create({ title: { color: colors.navy, fontSize: 28, fontWeight: '900' }, subtitle: { color: colors.textMuted, marginTop: spacing.xs }, form: { maxWidth: 780, gap: spacing.lg }, field: { gap: spacing.sm }, label: { color: colors.navy, fontWeight: '800', fontSize: 13 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { paddingHorizontal: spacing.md, minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill }, selected: { backgroundColor: colors.navy }, chipText: { color: colors.navy, fontWeight: '700', fontSize: 12 }, selectedText: { color: colors.gold }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md, color: colors.text }, multiline: { minHeight: 90, textAlignVertical: 'top' }, rule: { backgroundColor: colors.warningSoft, padding: spacing.md, borderRadius: radii.sm }, ruleTitle: { color: colors.navy, fontWeight: '900' }, ruleText: { color: colors.text, fontSize: 12, marginTop: 4 }, closed: { backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: radii.sm }, closedText: { color: colors.danger, fontSize: 12, fontWeight: '700' } });
