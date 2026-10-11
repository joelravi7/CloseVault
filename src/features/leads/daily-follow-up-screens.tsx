import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { Badge, Button, Card, EmptyState, PageHeader, Screen, textStyles } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { activeFollowUpStatuses, cancelCommandSchema, colomboDayWindow, type FollowUpBucket } from '@/domain/daily-follow-ups';
import { formatColombo } from '@/domain/lead-persistence';
import type { CommandSaveOperation as SaveOperation } from '@/domain/lead-save-recovery';
import { leadError } from '@/data/supabase/lead-repository';
import { useFollowUpPage, useLeadDetail, useLeadRecovery, useLeadSave, useLeadScope } from './persisted-lead-hooks';
import { RecoveryNotice } from './persisted-lead-screens';

const names: Record<FollowUpBucket, string> = { today: 'Due today', overdue: 'Overdue', upcoming: 'Upcoming' };
export function DailyFollowUpScreen() {
  const { repository } = useLeadScope();
  const [bucket, setBucket] = useState<FollowUpBucket>('today'); const [page, setPage] = useState(0);
  const [at, setAt] = useState(() => new Date().toISOString());
  // Keep the day window current across midnight without rebasing ordinary pagination.
  useEffect(() => { const timer = setInterval(() => { const next = new Date().toISOString(); if (colomboDayWindow(next).start !== colomboDayWindow(at).start) { setAt(next); setPage(0); } }, 30_000); return () => clearInterval(timer); }, [at]);
  const query = useFollowUpPage({ page, bucket, at });
  return <Screen><PageHeader eyebrow="Daily sales work" title="Follow-ups" subtitle="Your next conversations · Asia/Colombo" /><RecoveryNotice />
    <View style={styles.actions}><Button label="Back to leads" variant="secondary" onPress={() => router.push('/workspace')} /><Button label="Refresh follow-ups" variant="secondary" disabled={!repository || query.isFetching} onPress={() => { const next = new Date().toISOString(); if (colomboDayWindow(next).start !== colomboDayWindow(at).start) { setAt(next); setPage(0); } else void query.refetch(); }} /></View>
    <Card><Text style={textStyles.label}>Plan your day</Text><Text style={textStyles.muted}>Today includes every active task on this Colombo date. Overdue means before today; upcoming starts tomorrow. Lost and archived leads, and terminal tasks, are excluded.</Text><View style={styles.actions}>{(Object.keys(names) as FollowUpBucket[]).map(value => <Button key={value} label={names[value]} variant={bucket === value ? 'primary' : 'secondary'} onPress={() => { setBucket(value); setPage(0); }} />)}</View></Card>
    {!repository?.writable && <Text style={textStyles.muted}>Hosted CRM is read-only. No notification delivery or completed contact is inferred.</Text>}
    {!repository || query.isPending ? <Card><ActivityIndicator accessibilityLabel="Loading daily follow-ups" /></Card> : query.isError ? <Card><Text accessibilityRole="alert" style={styles.error}>{leadError(query.error).message}</Text><Button label="Retry follow-ups" onPress={() => { void query.refetch(); }} /></Card> : <>
      <Text style={textStyles.value}>{names[bucket]} · {query.data.total} tasks · Page {page + 1}</Text>
      {query.data.items.length === 0 ? <EmptyState title={`No ${names[bucket].toLowerCase()} follow-ups`} detail="No active tasks match this date range. Refresh to check for changes." /> : query.data.items.map(({ followUp, lead }) => <Card key={followUp.id}><View style={styles.actions}><Badge label={lead.stage.replaceAll('_', ' ')} /><Badge label={names[bucket]} /></View><Text style={styles.title}>{followUp.title}</Text><Text style={textStyles.value}>{lead.full_name}</Text><Text style={textStyles.body}>{lead.phone || 'Mobile not recorded'}{lead.email ? ` · ${lead.email}` : ''}</Text><Text style={textStyles.muted}>{formatColombo(followUp.due_at)}</Text><Button label={`Open lead: ${lead.full_name}`} variant="secondary" onPress={() => router.push({ pathname: '/crm/lead/[id]', params: { id: lead.id } })} /><Button label={`Cancel and replace: ${followUp.title}`} variant="ghost" disabled={!repository.writable || !repository.recovery || !repository.cancelFollowUp} onPress={() => router.push({ pathname: '/crm/cancel-follow-up/[id]', params: { id: followUp.id, leadId: lead.id } })} /></Card>)}
    </>}
    <View style={styles.actions}><Button label="Previous tasks" variant="secondary" disabled={page === 0 || query.isFetching} onPress={() => setPage(v => v - 1)} /><Button label="Next tasks" variant="secondary" disabled={!query.data || (page + 1) * 25 >= query.data.total || query.isFetching} onPress={() => setPage(v => v + 1)} /></View>
  </Screen>;
}

export function CancelFollowUpScreen({ id, leadId }: { id: string; leadId?: string }) {
  const { repository } = useLeadScope(); const query = useLeadDetail(leadId); const { state } = useLeadRecovery(); const save = useLeadSave();
  const [reason, setReason] = useState(''); const [action, setAction] = useState(''); const [dueAt, setDueAt] = useState(''); const [message, setMessage] = useState<string>();
  const pending = useRef<Extract<SaveOperation, { kind: 'cancel' }> | null>(null); const busy = useRef(false); const [running, setRunning] = useState(false); const [locked, setLocked] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [pendingId, setPendingId] = useState<string>();
  const recoveryBlocked = ['loading','checking','saving','blocked'].includes(state.status) || (!!state.pending && state.pending.commandId !== pendingId);
  const original = query.data?.followUps.find(v => v.id === id);
  const actionable = original && (activeFollowUpStatuses as readonly string[]).includes(original.status) && query.data?.lead.stage !== 'lost' && !query.data?.lead.archived_at;
  const permitted = !!repository?.writable && !!repository.cancelFollowUp && !!repository.recovery;
  const fields: { label: string; value: string; change: (value: string) => void }[] = [
    { label: 'Cancellation reason', value: reason, change: setReason },
    { label: 'Replacement next action', value: action, change: setAction },
    { label: 'Replacement date/time — Asia/Colombo (YYYY-MM-DDTHH:mm)', value: dueAt, change: setDueAt },
  ];
  async function submit(): Promise<void> {
    if (!permitted || busy.current || recoveryBlocked || save.isSuccess || !leadId || (!pending.current && !actionable)) return;
    busy.current = true; setRunning(true); setMessage(undefined);
    try {
      if (!pending.current) {
        const parsed = cancelCommandSchema.safeParse({ commandId: randomUUID(), followUpId: id, expectedVersion: original!.version, reason, replacement: { action, dueAt } });
        if (!parsed.success) { setMessage(parsed.error.issues.map(v => v.message).join(' ')); return; }
        pending.current = { kind: 'cancel', leadId, command: parsed.data, confirmed: true }; setPendingId(parsed.data.commandId); setLocked(true);
      }
      await save.mutateAsync(pending.current); if (!alive.current) return; setMessage('Cancellation and replacement confirmed.');
      router.replace({ pathname: '/crm/lead/[id]', params: { id: leadId } });
    } catch (error) { if (alive.current) setMessage(leadError(error, true).message); }
    finally { busy.current = false; if (alive.current) setRunning(false); }
  }
  const notice = <RecoveryNotice />;
  if (!leadId) return <Screen>{notice}<EmptyState title="Lead association missing" detail="Open cancellation from the daily queue or lead profile." /></Screen>;
  if (!repository || query.isPending) return <Screen>{notice}<ActivityIndicator accessibilityLabel="Loading cancellation" /></Screen>;
  if (query.isError) return <Screen>{notice}<Text accessibilityRole="alert" style={styles.error}>{leadError(query.error).message}</Text><Button label="Retry lead" onPress={() => { void query.refetch(); }} /></Screen>;
  return <Screen><PageHeader title="Cancel and replace" subtitle={query.data.lead.full_name} />{notice}<Card><Text style={textStyles.value}>{original?.title || 'Follow-up unavailable'}</Text><Text style={textStyles.muted}>The original history is retained. Exactly one replacement is created by the atomic RPC, even when another follow-up exists. Reminder intents are saved; device delivery is not verified.</Text></Card>
    {!permitted && <Text style={textStyles.muted}>Hosted cancellation is disabled. No mutation will be sent.</Text>}
    {!actionable && !locked && <Text accessibilityRole="alert" style={styles.error}>Only outstanding tasks for active leads can be cancelled.</Text>}
    <Card>{fields.map(({ label, value, change }) => <View key={label}><Text style={textStyles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={change} editable={permitted && !locked && !running && !recoveryBlocked} /></View>)}</Card>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button label={locked ? 'Retry unchanged cancellation' : 'Confirm cancellation and replacement'} disabled={!permitted || running || recoveryBlocked || save.isSuccess || (!actionable && !locked)} loading={running} onPress={() => { void submit(); }} />
    {state.status === 'rejected' && !state.pending && <Button label="Review cancellation draft" variant="secondary" disabled={running} onPress={() => { pending.current = null; setPendingId(undefined); setLocked(false); setMessage(undefined); save.reset(); }} />}
    <Button label="Back to lead" variant="secondary" disabled={running} onPress={() => router.push({ pathname: '/crm/lead/[id]', params: { id: leadId } })} />
  </Screen>;
}
const styles = StyleSheet.create({ actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.md }, title: { color: colors.navy, fontSize: 20, fontWeight: '800', marginBottom: spacing.sm }, input: { borderColor: colors.border, borderWidth: 1, borderRadius: radii.sm, padding: spacing.md, color: colors.text, minHeight: 48, marginVertical: spacing.sm }, error: { color: colors.danger, marginVertical: spacing.sm } });
