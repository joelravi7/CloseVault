import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { Button, Card, EmptyState, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useDemoData } from '@/providers/demo-data-provider';

const activityTypes = [
  { value: 'outgoing_call', label: 'Outgoing call', title: 'Call logged' },
  { value: 'whatsapp_sent', label: 'WhatsApp', title: 'WhatsApp activity recorded' },
  { value: 'meeting', label: 'Meeting', title: 'Meeting recorded' },
  { value: 'documents_sent', label: 'Documents', title: 'Documents recorded as sent' },
  { value: 'internal_note', label: 'Private note', title: 'Private note added' },
] as const;

const schema = z.object({
  type: z.enum(['outgoing_call', 'whatsapp_sent', 'meeting', 'documents_sent', 'internal_note']),
  occurredAt: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'Enter a valid activity date and time.'),
  summary: z.string().trim().min(3, 'Add a short conversation or activity summary.'),
  outcome: z.string().trim().optional(),
  detailedNotes: z.string().trim().optional(),
  nextAction: z.string().trim().min(3, 'Every active lead needs a next action.'),
  nextFollowUpAt: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'Enter a valid follow-up date and time.'),
});

type FormValues = z.infer<typeof schema>;

export default function AddActivityScreen() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const { getLead, addActivity } = useDemoData();
  const lead = getLead(leadId);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'outgoing_call',
      occurredAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      summary: '',
      outcome: '',
      detailedNotes: '',
      nextAction: 'Follow up on the conversation',
      nextFollowUpAt: format(addDays(new Date(), 1), "yyyy-MM-dd'T'10:00"),
    },
  });
  const selectedType = useWatch({ control, name: 'type' });
  if (!lead) return <Screen><EmptyState title="Lead not found" detail="Return to the Leads screen and select a valid lead." /></Screen>;

  const submit = handleSubmit(async (values) => {
    const option = activityTypes.find((item) => item.value === values.type)!;
    addActivity({ leadId: lead.id, title: option.title, ...values });
    router.replace(`/lead/${lead.id}`);
  });

  return (
    <Screen>
      <View><Text style={styles.title}>Record an activity</Text><Text style={styles.subtitle}>{lead.fullName} · This demo entry remains in the current session and appears immediately in the timeline.</Text></View>
      <Card style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Activity type</Text>
          <Controller control={control} name="type" render={({ field: { onChange } }) => <View style={styles.chips}>{activityTypes.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: selectedType === item.value }} onPress={() => onChange(item.value)} style={[styles.chip, selectedType === item.value && styles.chipSelected]}><Text style={[styles.chipText, selectedType === item.value && styles.chipTextSelected]}>{item.label}</Text></Pressable>)}</View>} />
        </View>
        <FormField control={control} name="occurredAt" label="Activity date and time" placeholder="2026-07-16T14:30" error={errors.occurredAt?.message} />
        <FormField control={control} name="summary" label="Short summary" placeholder="What happened during this activity?" multiline error={errors.summary?.message} />
        <FormField control={control} name="outcome" label="Outcome (optional)" placeholder="Interested, requested time, no answer…" error={errors.outcome?.message} />
        <FormField control={control} name="detailedNotes" label="Detailed notes (optional)" placeholder="Private detail that helps with the next conversation" multiline error={errors.detailedNotes?.message} />
        <View style={styles.ruleBox}><Text style={styles.ruleTitle}>Next action required</Text><Text style={styles.ruleCopy}>Saving this activity also creates a follow-up so the active lead is not left without a next action.</Text></View>
        <FormField control={control} name="nextAction" label="Next action" placeholder="Send the current floor plan" error={errors.nextAction?.message} />
        <FormField control={control} name="nextFollowUpAt" label="Follow-up date and time" placeholder="2026-07-17T10:00" error={errors.nextFollowUpAt?.message} />
        <Button label="Save activity and follow-up" icon="checkmark" loading={isSubmitting} disabled={isSubmitting} onPress={submit} />
      </Card>
    </Screen>
  );
}

function FormField({ control, name, label, error, ...props }: { control: ReturnType<typeof useForm<FormValues>>['control']; name: keyof FormValues; label: string; error?: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><Controller control={control} name={name} render={({ field: { onChange, onBlur, value } }) => <TextInput {...props} value={String(value ?? '')} onChangeText={onChange} onBlur={onBlur} placeholderTextColor={colors.textMuted} style={[styles.input, props.multiline && styles.multiline, error && styles.inputError]} />} />{error ? <Text style={styles.error}>{error}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  title: { color: colors.navy, fontSize: 28, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.xs }, form: { width: '100%', maxWidth: 760, gap: spacing.lg }, field: { gap: spacing.sm }, label: { color: colors.navy, fontSize: 13, fontWeight: '800' }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 15 }, multiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' }, inputError: { borderColor: colors.danger }, error: { color: colors.danger, fontSize: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { minHeight: 42, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' }, chipSelected: { backgroundColor: colors.navy, borderColor: colors.navy }, chipText: { color: colors.navy, fontSize: 12, fontWeight: '700' }, chipTextSelected: { color: colors.gold }, ruleBox: { backgroundColor: colors.warningSoft, borderLeftWidth: 4, borderLeftColor: colors.warning, padding: spacing.md, borderRadius: radii.sm, gap: spacing.xs }, ruleTitle: { color: colors.navy, fontWeight: '900', fontSize: 13 }, ruleCopy: { color: colors.text, fontSize: 12, lineHeight: 18 },
});
