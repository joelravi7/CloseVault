import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, format } from 'date-fns';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { Button, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { findDuplicateLead, normalizeSriLankanPhone } from '@/domain/business-rules';
import { useDemoData } from '@/providers/demo-data-provider';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter the lead’s name.'),
  phone: z.string().refine((value) => normalizeSriLankanPhone(value) !== null, 'Enter a valid Sri Lankan mobile number.'),
  source: z.string().trim().min(2, 'Enter a lead source.'),
  initialInquiry: z.string().trim().min(3, 'Capture the initial inquiry.'),
  bedroomInterest: z.string().regex(/^[1-6]$/, 'Enter a bedroom count from 1 to 6.'),
  nextAction: z.string().trim().min(3, 'Every active lead needs a next action.'),
  nextFollowUpAt: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'Enter a valid follow-up date and time.'),
});

type FormValues = z.infer<typeof schema>;

export default function QuickAddScreen() {
  const { leads, addLead } = useDemoData();
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', source: 'Meta', initialInquiry: '', bedroomInterest: '3', nextAction: 'Make first call', nextFollowUpAt: format(addDays(new Date(), 1), "yyyy-MM-dd'T'10:00") },
  });
  const submit = handleSubmit(async (values) => {
    const duplicate = findDuplicateLead(leads, values.phone);
    if (duplicate) {
      Alert.alert('Possible duplicate', `${duplicate.fullName} already uses this phone number. Open the existing lead instead of creating a duplicate.`, [{ text: 'Cancel' }, { text: 'Open existing', onPress: () => router.replace(`/lead/${duplicate.id}`) }]);
      return;
    }
    const lead = addLead({ ...values, bedroomInterest: Number(values.bedroomInterest) });
    router.replace(`/lead/${lead.id}`);
  });
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View><Text style={styles.title}>Capture the essentials</Text><Text style={styles.subtitle}>This creates a fictional session-only lead, initial activity and follow-up. No notification is scheduled in demo mode.</Text></View>
        <Card style={styles.form}>
          <Field control={control} name="fullName" label="Name" placeholder="Fictional client name" error={errors.fullName?.message} />
          <Field control={control} name="phone" label="Phone" placeholder="077 123 4567" keyboardType="phone-pad" error={errors.phone?.message} />
          <View style={styles.row}><View style={styles.rowItem}><Field control={control} name="source" label="Source" placeholder="Meta" error={errors.source?.message} /></View><View style={styles.smallItem}><Field control={control} name="bedroomInterest" label="Bedrooms" placeholder="3" keyboardType="number-pad" error={errors.bedroomInterest?.message} /></View></View>
          <Field control={control} name="initialInquiry" label="Initial inquiry" placeholder="What is the client looking for?" multiline error={errors.initialInquiry?.message} />
          <Field control={control} name="nextAction" label="Next action" placeholder="Make first call" error={errors.nextAction?.message} />
          <Field control={control} name="nextFollowUpAt" label="Follow-up date and time" placeholder="2026-07-17T10:00" autoCapitalize="none" error={errors.nextFollowUpAt?.message} />
          <Button label="Save demo lead" icon="checkmark" loading={isSubmitting} disabled={isSubmitting} onPress={submit} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ control, name, label, error, ...inputProps }: { control: ReturnType<typeof useForm<FormValues>>['control']; name: keyof FormValues; label: string; error?: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><Controller control={control} name={name} render={({ field: { onChange, onBlur, value } }) => <TextInput {...inputProps} value={String(value)} onBlur={onBlur} onChangeText={onChange} placeholderTextColor={colors.textMuted} style={[styles.input, inputProps.multiline && styles.multiline, error && styles.inputError]} />} />{error ? <Text style={styles.error}>{error}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.lg, gap: spacing.xl }, title: { color: colors.navy, fontSize: 28, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.xs }, form: { gap: spacing.lg }, field: { gap: spacing.sm }, label: { color: colors.navy, fontSize: 13, fontWeight: '800' }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 15 }, multiline: { minHeight: 100, paddingTop: spacing.md, textAlignVertical: 'top' }, inputError: { borderColor: colors.danger }, error: { color: colors.danger, fontSize: 12 }, row: { flexDirection: 'row', gap: spacing.md }, rowItem: { flex: 1 }, smallItem: { width: 120 },
});
