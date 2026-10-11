import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, EmptyState, PageHeader, Screen, textStyles } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import type { PersistedLead } from '@/data/contracts/lead-repository';
import { leadError } from '@/data/supabase/lead-repository';
import { createLeadFormSchema, editLeadFormSchema, formatColombo, persistedLeadStages, type CreateLeadForm } from '@/domain/lead-persistence';
import { useAuth } from '@/providers/auth-provider';
import { refreshLeadQueries, useLeadDetail, useLeadList, useLeadSave, useLeadScope, useLeadRecovery, type LeadSubmission } from './persisted-lead-hooks';

function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) { return <Card><Text accessibilityRole="alert" style={styles.error}>{leadError(error).message}</Text>{retry && <Button label="Retry" variant="secondary" onPress={retry} />}</Card>; }
function WriteNotice() { return <Text style={textStyles.muted}>Hosted CRM is read-only. Creating and editing leads await owner authorization. No demo data is shown here.</Text>; }
export function RecoveryNotice() {
  const { recovery, state } = useLeadRecovery();
  if (!recovery || state.status === 'ready') return null;
  const busy = ['loading', 'saving', 'checking'].includes(state.status);
  return <Card><Text accessibilityRole="alert" style={textStyles.body}>{state.message || 'Loading save recovery…'}</Text>
    {state.pending && <Text style={textStyles.muted}>Do not start a replacement submission. After a restart, only server reconciliation is available; no request is replayed automatically. Sign-out or closing this web tab removes local recovery metadata and does not undo a server save.</Text>}
    {['uncertain', 'blocked'].includes(state.status) && <Button label="Check server outcome" variant="secondary" disabled={busy} onPress={() => { void recovery.reconcile().then(result => { if (result) router.replace({ pathname: '/crm/lead/[id]', params: { id: result.leadId } }); }).catch(() => undefined); }} />}
  </Card>;
}
export function PersistedLeadListScreen() {
  const { repository } = useLeadScope(); const { controller } = useAuth();
  const [filters, setFilters] = useState({ search: '', source: '', page: 0, stage: undefined as typeof persistedLeadStages[number] | undefined });
  const query = useLeadList(filters);
  return <Screen><PageHeader eyebrow="Private CloseVault" title="Leads" subtitle="Your secure lead workspace · Asia/Colombo" />
    <RecoveryNotice />
    <View style={styles.actions}><Button label="Daily follow-ups" variant="secondary" onPress={() => router.push('/crm/follow-ups')} /><Button label="Create lead" disabled={!repository?.writable} onPress={() => router.push('/crm/create')} /><Button label="Refresh" variant="secondary" disabled={!repository || query.isFetching} onPress={() => { void query.refetch(); }} /><Button label="Sign out" variant="ghost" onPress={() => { void controller?.signOut(); }} /></View>
    {!repository?.writable && <WriteNotice />}
    <Card><Text style={textStyles.label}>Search name, mobile or email</Text><TextInput accessibilityLabel="Search leads" style={styles.input} value={filters.search} onChangeText={search => setFilters(v => ({ ...v, search, page: 0 }))} /><Text style={textStyles.label}>Exact lead source (optional)</Text><TextInput accessibilityLabel="Filter lead source" style={styles.input} value={filters.source} onChangeText={source => setFilters(v => ({ ...v, source, page: 0 }))} /><View style={styles.actions}><Button label="All stages" variant={!filters.stage ? 'primary' : 'secondary'} onPress={() => setFilters(v => ({ ...v, stage: undefined, page: 0 }))} />{persistedLeadStages.map(stage => <Button key={stage} label={stage.replaceAll('_', ' ')} variant={filters.stage === stage ? 'primary' : 'secondary'} onPress={() => setFilters(v => ({ ...v, stage, page: 0 }))} />)}</View></Card>
    {!repository ? <EmptyState title="Connecting lead repository" detail="If this persists, reload after checking your secure session and configuration." /> : query.isPending ? <ActivityIndicator accessibilityLabel="Loading leads" /> : query.isError ? <ErrorNotice error={query.error} retry={() => { void query.refetch(); }} /> : query.data.leads.length === 0 ? <EmptyState title="No matching leads" detail="No records match this search. Hosted writes are not authorized yet." /> : <><Text style={textStyles.muted}>{query.data.total} matches · Page {filters.page + 1} · newest first</Text>{query.data.leads.map(lead => <Card key={lead.id}><Text style={styles.title}>{lead.full_name}</Text><Badge label={lead.stage} /><Text style={textStyles.body}>{lead.phone || 'Mobile not recorded'} · {lead.source || 'Source not recorded'}</Text><Text style={textStyles.muted}>Created {formatColombo(lead.created_at)}</Text><Button label={`View ${lead.full_name}`} variant="secondary" onPress={() => router.push({ pathname: '/crm/lead/[id]', params: { id: lead.id } })} /></Card>)}</>}
    <View style={styles.actions}><Button label="Previous page" variant="secondary" disabled={filters.page === 0 || query.isFetching} onPress={() => setFilters(v => ({ ...v, page: v.page - 1 }))} /><Button label="Next page" variant="secondary" disabled={!query.data || (filters.page + 1) * 25 >= query.data.total || query.isFetching} onPress={() => setFilters(v => ({ ...v, page: v.page + 1 }))} /></View>
  </Screen>;
}
export function PersistedLeadDetailScreen({ id }: { id: string }) {
  const { repository } = useLeadScope(); const query = useLeadDetail(id);
  if (!repository || query.isPending) return <Screen><RecoveryNotice /><ActivityIndicator accessibilityLabel="Loading lead" /></Screen>;
  if (query.isError) return <Screen><RecoveryNotice /><ErrorNotice error={query.error} retry={() => { void query.refetch(); }} /></Screen>;
  const { lead, followUps, activities } = query.data;
  const primary = followUps.find(v => v.id === lead.primary_follow_up_id);
  return <Screen><PageHeader title={lead.full_name} subtitle={`Version ${lead.version} · ${formatColombo(lead.updated_at)}`} /><RecoveryNotice /><Badge label={lead.stage} /><View style={styles.actions}><Button label="Back to leads" variant="secondary" onPress={() => router.push('/workspace')} /><Button label="Edit contact details" disabled={!repository.writable} onPress={() => router.push({ pathname: '/crm/edit/[id]', params: { id } })} /><Button label="Refresh lead" variant="secondary" onPress={() => { void query.refetch(); }} /></View>{!repository.writable && <WriteNotice />}
    <Card><Text style={textStyles.body}>Mobile: {lead.phone || 'Not recorded'}</Text><Text style={textStyles.body}>Email: {lead.email || 'Not recorded'}</Text><Text style={textStyles.body}>Source: {lead.source || 'Not recorded'}</Text><Text style={textStyles.muted}>Created {formatColombo(lead.created_at)}</Text>{lead.closure_reason && <Text style={textStyles.body}>Closure reason: {lead.closure_reason}</Text>}{lead.closed_at && <Text style={textStyles.muted}>Closed {formatColombo(lead.closed_at)}</Text>}{lead.archived_at && <Text style={textStyles.muted}>Archived {formatColombo(lead.archived_at)}</Text>}</Card>
    <Card><Text style={styles.title}>Primary follow-up</Text><Text style={textStyles.body}>{primary ? `${primary.title} · ${formatColombo(primary.due_at)} · ${primary.status}` : 'No primary follow-up recorded'}</Text></Card>
    <Button label="Daily follow-ups" variant="secondary" onPress={() => router.push('/crm/follow-ups')} />
    <Text style={styles.title}>Follow-up history</Text>{followUps.length ? followUps.map(v => <Card key={v.id}><Text style={textStyles.value}>{v.title}</Text><Badge label={v.status} /><Text style={textStyles.muted}>{formatColombo(v.due_at)}</Text>{v.outcome && <Text style={textStyles.body}>{v.outcome}</Text>}{v.cancellation_cause && <Text style={textStyles.muted}>Cancellation cause: {v.cancellation_cause}</Text>}{['upcoming','due','overdue','waiting_for_client'].includes(v.status) && lead.stage !== 'lost' && !lead.archived_at && <Button label={`Cancel and replace: ${v.title}`} variant="secondary" disabled={!repository.writable || !repository.cancelFollowUp || !repository.recovery} onPress={() => router.push({ pathname: '/crm/cancel-follow-up/[id]', params: { id: v.id, leadId: lead.id } })} />}</Card>) : <Text style={textStyles.muted}>No follow-ups</Text>}
    <Text style={styles.title}>Activity history</Text>{activities.length ? activities.map(v => <Card key={v.id}><Badge label={v.kind} /><Text style={textStyles.body}>{v.summary}</Text><Text style={textStyles.muted}>{formatColombo(v.occurred_at)}</Text></Card>) : <Text style={textStyles.muted}>No activities</Text>}
  </Screen>;
}
const blank: CreateLeadForm = { fullName: '', phone: '', email: '', source: '', inquiry: '', nextAction: '', followUpAt: '' };
export function PersistedLeadFormScreen({ lead: loadedLead }: { lead?: PersistedLead }) {
  // A background read must not rebase a draft or discard an uncertain command.
  const [lead] = useState(loadedLead);
  const { repository, owner } = useLeadScope(); const save = useLeadSave(); const queryClient = useQueryClient();
  const { state: recoveryState } = useLeadRecovery();
  const form = useForm<CreateLeadForm>({ resolver: zodResolver(lead ? editLeadFormSchema.extend({ inquiry: z.string(), nextAction: z.string(), followUpAt: z.string() }) : createLeadFormSchema), defaultValues: lead ? { ...blank, fullName: lead.full_name, phone: lead.phone ?? '', email: lead.email ?? '', source: lead.source ?? '' } : blank });
  const pending = useRef<LeadSubmission | null>(null); const submitting = useRef(false);
  const [attempted, setAttempted] = useState(false);
  const [pendingId, setPendingId] = useState<string>();
  const recoveryBlocked = recoveryState.status === 'loading' || recoveryState.status === 'checking' || recoveryState.status === 'saving' || recoveryState.status === 'blocked' || (!!recoveryState.pending && recoveryState.pending.commandId !== pendingId);
  const [matches, setMatches] = useState<PersistedLead[]>([]); const [notice, setNotice] = useState<string>(); const [busy, setBusy] = useState(false); const [locked, setLocked] = useState(false);
  const fields: (keyof CreateLeadForm)[] = lead ? ['fullName', 'phone', 'email', 'source'] : ['fullName', 'phone', 'email', 'source', 'inquiry', 'nextAction', 'followUpAt'];
  const labels = { fullName: 'Full name', phone: 'Mobile number', email: 'Email (optional)', source: 'Lead source', inquiry: 'Inquiry summary (include budget, bedrooms and residence preferences)', nextAction: 'Next action', followUpAt: 'Follow-up date/time — Asia/Colombo (YYYY-MM-DDTHH:mm)' };
  async function submit(confirmed = false): Promise<void> {
    if (!repository?.writable || submitting.current || recoveryBlocked) return;
    submitting.current = true; setBusy(true); setNotice(undefined);
    try {
      if (!pending.current) {
        if (!await form.trigger(fields)) return;
        const values = form.getValues();
        const contacts = editLeadFormSchema.parse({ fullName: values.fullName, phone: values.phone, email: values.email, source: values.source });
        pending.current = lead ? { kind: 'edit', command: { commandId: randomUUID(), leadId: lead.id, expectedVersion: lead.version, changes: contacts }, confirmed: false } : { kind: 'create', command: { commandId: randomUUID(), fullName: values.fullName, phone: values.phone, email: values.email, source: values.source, initialSummary: values.inquiry, initialFollowUp: { action: values.nextAction, dueAt: values.followUpAt } }, confirmed: false };
        setPendingId(pending.current.command.commandId);
        setLocked(true);
      }
      const submission = pending.current;
      if (!confirmed && !submission.confirmed) {
        const duplicates = await repository.duplicates(submission.kind === 'edit' ? submission.command.changes.phone ?? '' : submission.command.phone ?? '', submission.kind === 'edit' ? submission.command.changes.email ?? '' : submission.command.email ?? '', lead?.id);
        if (duplicates.length) { setMatches(duplicates); return; }
      }
      submission.confirmed = confirmed || submission.confirmed;
      setAttempted(true);
      const result = await save.mutateAsync(submission); setMatches([]);
      setNotice('Saved successfully.'); router.replace({ pathname: '/crm/lead/[id]', params: { id: result.leadId } });
    } catch (error) { const failure = leadError(error, true); setNotice(failure.message + (failure.code === 'uncertain_outcome' ? (repository.recovery ? ' Recovery metadata is retained. Check the server; a restart cannot restore this request for retry.' : ' Do not leave or reload this form until the result is reconciled; pending commands are not durably stored.') : '')); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <Screen><PageHeader title={lead ? 'Edit lead contact' : 'Create lead'} subtitle={lead ? 'Only name, mobile, email and source can be edited.' : 'Required qualification and planning are recorded by one atomic command.'} />{!repository?.writable && <WriteNotice />}{lead && <Text style={textStyles.muted}>Incomplete records remain readable. Complete required contact fields before saving.</Text>}
    <RecoveryNotice />
    <Card>{fields.map(name => <View key={name} style={styles.field}><Text style={textStyles.label}>{labels[name]}</Text><Controller control={form.control} name={name} render={({ field: { value, onChange, onBlur } }) => <TextInput accessibilityLabel={labels[name]} style={styles.input} value={value} onChangeText={onChange} onBlur={onBlur} editable={!!repository?.writable && !locked && !busy} autoCapitalize={name === 'email' ? 'none' : 'sentences'} keyboardType={name === 'phone' ? 'phone-pad' : name === 'email' ? 'email-address' : 'default'} multiline={name === 'inquiry'} />}/>{form.formState.errors[name] && <Text accessibilityRole="alert" style={styles.error}>{form.formState.errors[name]?.message}</Text>}</View>)}{!lead && <Text style={textStyles.muted}>International mobiles: include + and country code. Dates without an offset mean Colombo time. No device reminders are scheduled by this phase.</Text>}</Card>
    {matches.length > 0 && <Card><Text style={styles.title}>Potential duplicate leads</Text>{matches.map(v => <Text key={v.id} style={textStyles.body}>{v.full_name} · {v.phone} · {v.email || 'No email'}</Text>)}<Text style={textStyles.muted}>Shared contact details are allowed. No leads will be merged or overwritten. An attempted save retains its original command for retries.</Text><Button label={attempted ? 'Confirm: retry original command' : 'Confirm: save a separate record'} disabled={busy} onPress={() => { void submit(true); }} /><Button label="Review form without saving" variant="secondary" disabled={busy || attempted} onPress={() => { pending.current = null; setLocked(false); setMatches([]); }} /></Card>}
    {notice && <Text accessibilityRole="alert" style={styles.error}>{notice}</Text>}
    <Button label={locked ? 'Retry unchanged command' : 'Save lead'} loading={busy} disabled={!repository?.writable || busy || recoveryBlocked || matches.length > 0 || save.isSuccess} onPress={() => { void submit(); }} />
    {recoveryState.status === 'rejected' && !recoveryState.pending && <Button label="Review draft after rejection" variant="secondary" disabled={busy} onPress={() => { pending.current = null; setPendingId(undefined); setLocked(false); setAttempted(false); setMatches([]); setNotice(undefined); save.reset(); }} />}
    {save.error && leadError(save.error).code === 'version_conflict' && <Button label="Reload latest lead" variant="secondary" onPress={() => { if (lead && owner) void refreshLeadQueries(queryClient, owner).then(() => router.replace({ pathname: '/crm/lead/[id]', params: { id: lead.id } })).catch(() => setNotice('Reload failed. Please retry.')); }} />}
    <Button label="Back to leads" variant="secondary" disabled={busy} onPress={() => router.push('/workspace')} />
  </Screen>;
}
export function PersistedLeadEditScreen({ id }: { id: string }) {
  const query = useLeadDetail(id); const { repository } = useLeadScope();
  if (!repository || query.isPending) return <Screen><RecoveryNotice /><ActivityIndicator accessibilityLabel="Loading lead" /></Screen>;
  if (query.isError) return <Screen><RecoveryNotice /><ErrorNotice error={query.error} retry={() => { void query.refetch(); }} /></Screen>;
  return <PersistedLeadFormScreen key={id} lead={query.data.lead} />;
}
const styles = StyleSheet.create({ actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.md }, input: { borderColor: colors.border, borderWidth: 1, borderRadius: radii.sm, padding: spacing.md, color: colors.text, minHeight: 48, marginVertical: spacing.sm }, field: { marginBottom: spacing.md }, title: { color: colors.navy, fontSize: 18, fontWeight: '800', marginBottom: spacing.sm }, error: { color: colors.danger, marginVertical: spacing.sm } });
