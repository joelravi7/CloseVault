import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { Button, Card, EmptyState, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useDemoData } from '@/providers/demo-data-provider';

const followUpTypes = [
  { value: 'callback', label: 'Callback' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'document_follow_up', label: 'Documents' },
  { value: 'site_visit_invitation', label: 'Site visit' },
  { value: 'payment_plan_follow_up', label: 'Payment plan' },
  { value: 'long_term_nurture', label: 'Long-term' },
] as const;

const schema = z.object({
  title: z.string().trim().min(3, 'Describe the next action.'),
  type: z.enum(['callback', 'whatsapp', 'document_follow_up', 'site_visit_invitation', 'payment_plan_follow_up', 'long_term_nurture']),
  dueAt: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'Enter a valid due date and time.'),
  priority: z.enum(['A', 'B', 'C', 'D']),
  description: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function AddFollowUpScreen() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const { getLead, addFollowUp } = useDemoData();
  const lead = getLead(leadId);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: lead?.nextAction ?? 'Call client', type: 'callback', dueAt: format(addDays(new Date(), 1), "yyyy-MM-dd'T'10:00"), priority: lead?.priority === 'closed' ? 'C' : lead?.priority ?? 'C', description: '' },
  });
  const selectedType = useWatch({ control, name: 'type' });
  const selectedPriority = useWatch({ control, name: 'priority' });
  if (!lead) return <Screen><EmptyState title="Lead not found" detail="Return to the Leads screen and select a valid lead." /></Screen>;

  const submit = handleSubmit(async (values) => {
    addFollowUp({ leadId: lead.id, ...values });
    router.replace(`/lead/${lead.id}`);
  });

  return (
    <Screen>
      <View><Text style={styles.title}>Schedule a follow-up</Text><Text style={styles.subtitle}>{lead.fullName} · The lead’s next action and Today agenda update immediately in this demo session.</Text></View>
      <Card style={styles.form}>
        <FormField control={control} name="title" label="Next action" placeholder="Call to discuss the payment plan" error={errors.title?.message} />
        <View style={styles.field}><Text style={styles.label}>Follow-up type</Text><Controller control={control} name="type" render={({ field: { onChange } }) => <View style={styles.chips}>{followUpTypes.map((item) => <Choice key={item.value} label={item.label} selected={selectedType === item.value} onPress={() => onChange(item.value)} />)}</View>} /></View>
        <FormField control={control} name="dueAt" label="Due date and time" placeholder="2026-07-17T10:00" error={errors.dueAt?.message} />
        <View style={styles.field}><Text style={styles.label}>Priority</Text><Controller control={control} name="priority" render={({ field: { onChange } }) => <View style={styles.chips}>{(['A', 'B', 'C', 'D'] as const).map((priority) => <Choice key={priority} label={priority} selected={selectedPriority === priority} onPress={() => onChange(priority)} />)}</View>} /></View>
        <FormField control={control} name="description" label="Reminder context (optional)" placeholder="Keep this concise and safe for an in-app reminder." multiline error={errors.description?.message} />
        <View style={styles.notice}><Text style={styles.noticeText}>On iOS and Android, CloseVault requests notification permission and schedules a privacy-safe reminder. Completing, cancelling, or rescheduling this follow-up updates that reminder.</Text></View>
        <Button label="Schedule follow-up" icon="alarm-outline" loading={isSubmitting} disabled={isSubmitting} onPress={submit} />
      </Card>
    </Screen>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>; }
function FormField({ control, name, label, error, ...props }: { control: ReturnType<typeof useForm<FormValues>>['control']; name: keyof FormValues; label: string; error?: string } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><Controller control={control} name={name} render={({ field: { onChange, onBlur, value } }) => <TextInput {...props} value={String(value ?? '')} onChangeText={onChange} onBlur={onBlur} placeholderTextColor={colors.textMuted} style={[styles.input, props.multiline && styles.multiline, error && styles.inputError]} />} />{error ? <Text style={styles.error}>{error}</Text> : null}</View>; }

const styles = StyleSheet.create({
  title: { color: colors.navy, fontSize: 28, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.xs }, form: { width: '100%', maxWidth: 760, gap: spacing.lg }, field: { gap: spacing.sm }, label: { color: colors.navy, fontSize: 13, fontWeight: '800' }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 15 }, multiline: { minHeight: 90, paddingTop: spacing.md, textAlignVertical: 'top' }, inputError: { borderColor: colors.danger }, error: { color: colors.danger, fontSize: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { minWidth: 44, minHeight: 42, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' }, chipSelected: { backgroundColor: colors.navy, borderColor: colors.navy }, chipText: { color: colors.navy, fontSize: 12, fontWeight: '700' }, chipTextSelected: { color: colors.gold }, notice: { backgroundColor: colors.infoSoft, padding: spacing.md, borderRadius: radii.sm }, noticeText: { color: colors.info, fontSize: 12, lineHeight: 18 },
});
