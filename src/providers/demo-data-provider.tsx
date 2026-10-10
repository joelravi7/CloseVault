import { createContext, type Dispatch, type PropsWithChildren, type SetStateAction, useContext, useEffect, useRef, useState } from 'react';

import { demoActivities, demoFollowUps, demoLeads, demoMessageTemplates, demoSiteVisits, unitTypes } from '@/data/demo-fixtures';
import { formatSriLankanPhone, normalizeSriLankanPhone, priorityFromScore } from '@/domain/business-rules';
import { applyCancellation, cancellationSchema, type CancellationState, isActionableFollowUp, requireCancellable } from '@/domain/follow-up-cancellation';
import type { Activity, FollowUp, Lead, LeadStage, MessageTemplate, SiteVisit, UnitType } from '@/domain/models';
import { cancelFollowUpNotification, scheduleFollowUpNotification } from '@/services/notifications';

interface NewLeadInput { fullName: string; phone: string; source: string; initialInquiry: string; bedroomInterest: number; nextAction: string; nextFollowUpAt: string }
interface NewActivityInput { leadId: string; type: string; title: string; summary: string; outcome?: string; detailedNotes?: string; occurredAt: string; nextAction: string; nextFollowUpAt: string }
interface NewFollowUpInput { leadId: string; title: string; type: string; description?: string; dueAt: string; priority: Lead['priority'] }
export interface FollowUpResolution { action: 'complete' | 'reschedule' | 'waiting' | 'cancel' | 'delete' | 'lost'; outcome: string; nextAction?: string; nextFollowUpAt?: string }
export interface CallOutcomeInput { leadId: string; outcome: string; summary: string; detailedNotes?: string; stage?: LeadStage; nextAction?: string; nextFollowUpAt?: string }

interface DemoDataContextValue {
  leads: Lead[]; followUps: FollowUp[]; activities: Activity[]; siteVisits: SiteVisit[]; unitTypes: UnitType[]; templates: MessageTemplate[];
  addLead: (input: NewLeadInput) => Lead; addActivity: (input: NewActivityInput) => Activity; addFollowUp: (input: NewFollowUpInput) => FollowUp;
  resolveFollowUp: (id: string, resolution: FollowUpResolution) => Promise<void>;
  recordCallOutcome: (input: CallOutcomeInput) => Promise<void>;
  recordWhatsAppSent: (leadId: string, templateName: string, message: string, nextAction?: string, nextFollowUpAt?: string) => Promise<void>;
  saveTemplate: (template: Omit<MessageTemplate, 'id' | 'active'> & { id?: string }) => void; duplicateTemplate: (id: string) => void; archiveTemplate: (id: string) => void;
  getLead: (id: string) => Lead | undefined;
  cancellationReminderErrors: Record<string, string[]>;
  retryCancellationReminders: (originalId: string) => void;
}

interface CancellationJob { originalId: string; oldNotificationId?: string; replacement: FollowUp; firstName: string }
interface CRMState extends CancellationState { cancellationJobs: CancellationJob[] }

const DemoDataContext = createContext<DemoDataContextValue | null>(null);
const isClosedOutcome = (outcome: string) => ['Not interested', 'Purchased elsewhere', 'Incorrect number'].includes(outcome);

export function DemoDataProvider({ children }: PropsWithChildren) {
  const [crm, publishCRM] = useState<CRMState>({ leads: demoLeads, followUps: demoFollowUps, activities: demoActivities, cancellationJobs: [] });
  // The authoritative local snapshot is applied synchronously at the command boundary.
  // React receives an immutable render snapshot; it does not decide command success.
  const latest = useRef(crm);
  const setCRM = (update: (current: CRMState) => CRMState): void => {
    const next = update(latest.current); // Pure calculation; a rejection propagates to the caller.
    latest.current = next;
    publishCRM(next);
  };
  const { leads, followUps, activities } = crm;
  // Preserve existing workflow setters while cancellation uses one CRM transition.
  const setLeads: Dispatch<SetStateAction<Lead[]>> = (update) => setCRM((current) => ({ ...current, leads: typeof update === 'function' ? update(current.leads) : update }));
  const setFollowUps: Dispatch<SetStateAction<FollowUp[]>> = (update) => setCRM((current) => ({ ...current, followUps: typeof update === 'function' ? update(current.followUps) : update }));
  const setActivities: Dispatch<SetStateAction<Activity[]>> = (update) => setCRM((current) => ({ ...current, activities: typeof update === 'function' ? update(current.activities) : update }));
  const [templates, setTemplates] = useState(demoMessageTemplates);
  const handled = useRef(new Set<string>());
  const running = useRef(new Set<string>());
  const progress = useRef(new Map<string, { cancelled: boolean; scheduled: boolean; obsoleteIds: Set<string> }>());
  const [cancellationReminderErrors, setReminderErrors] = useState<Record<string, string[]>>({});
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    for (const job of crm.cancellationJobs) {
      if (handled.current.has(job.originalId)) continue;
      handled.current.add(job.originalId); // Includes in-flight work; Strict Mode cannot duplicate it.
      running.current.add(job.originalId);
      const steps = progress.current.get(job.originalId) ?? { cancelled: false, scheduled: false, obsoleteIds: new Set<string>() };
      progress.current.set(job.originalId, steps);
      void (async () => {
        const errors: string[] = [];
        if (!steps.cancelled) {
          try {
            if (job.oldNotificationId) await cancelFollowUpNotification(job.oldNotificationId);
            steps.cancelled = true;
          } catch { errors.push('Original reminder cancellation failed. Retry required.'); }
        }
        if (!steps.scheduled) {
          try {
            const task = latest.current.followUps.find((item) => item.id === job.replacement.id);
            if (task && isActionableFollowUp(task)) {
              const notificationId = await scheduleFollowUpNotification(job.firstName, task.title, task.dueAt);
              // Reconcile against authoritative state AFTER the native await.
              const currentTask = latest.current.followUps.find((item) => item.id === task.id);
              if (notificationId) {
                if (currentTask && isActionableFollowUp(currentTask)) {
                  setCRM((current) => ({ ...current, followUps: current.followUps.map((item) => item.id === task.id ? { ...item, notificationId } : item) }));
                } else steps.obsoleteIds.add(notificationId);
              }
            }
            steps.scheduled = true;
          } catch { errors.push('Replacement reminder scheduling failed. Retry required.'); }
        }
        for (const notificationId of steps.obsoleteIds) {
          try {
            await cancelFollowUpNotification(notificationId);
            steps.obsoleteIds.delete(notificationId);
          } catch { errors.push('Obsolete reminder cleanup failed. Retry required.'); }
        }
        setReminderErrors((current) => ({ ...current, [job.originalId]: errors }));
        running.current.delete(job.originalId);
      })();
    }
  }, [crm.cancellationJobs, retryVersion]);

  const createFollowUp = (input: NewFollowUpInput) => {
    const timestamp = Date.now();
    const followUp: FollowUp = { id: `fu-${timestamp}-${Math.random().toString(36).slice(2, 6)}`, leadId: input.leadId, title: input.title.trim(), type: input.type, description: input.description?.trim() || undefined, dueAt: new Date(input.dueAt).toISOString(), status: 'upcoming', priority: input.priority };
    const lead = leads.find((item) => item.id === input.leadId);
    if (lead) void scheduleFollowUpNotification(lead.fullName.split(' ')[0], followUp.title, followUp.dueAt).then((notificationId) => notificationId && setFollowUps((current) => current.map((item) => item.id === followUp.id ? { ...item, notificationId } : item)));
    return followUp;
  };

  const value: DemoDataContextValue = {
    leads, followUps, activities, templates, siteVisits: demoSiteVisits, unitTypes,
    cancellationReminderErrors,
    retryCancellationReminders: (id) => {
      if (running.current.has(id) || !cancellationReminderErrors[id]?.length) return;
      handled.current.delete(id);
      setRetryVersion((current) => current + 1);
    },
    getLead: (id) => leads.find((lead) => lead.id === id),
    addActivity: (input) => {
      if (!leads.some((lead) => lead.id === input.leadId)) throw new Error('Lead not found.');
      const now = Date.now();
      const activity: Activity = { id: `activity-${now}`, leadId: input.leadId, type: input.type, title: input.title, summary: input.summary.trim(), outcome: input.outcome?.trim() || undefined, detailedNotes: input.detailedNotes?.trim() || undefined, occurredAt: new Date(input.occurredAt).toISOString() };
      const followUp = createFollowUp({ leadId: input.leadId, title: input.nextAction, type: 'activity_follow_up', dueAt: input.nextFollowUpAt, priority: leads.find((lead) => lead.id === input.leadId)?.priority ?? 'C' });
      setActivities((current) => [activity, ...current]); setFollowUps((current) => [followUp, ...current]);
      setLeads((current) => current.map((lead) => lead.id === input.leadId ? { ...lead, lastContactAt: activity.occurredAt, nextAction: followUp.title, nextFollowUpAt: followUp.dueAt } : lead));
      return activity;
    },
    addFollowUp: (input) => {
      if (!leads.some((lead) => lead.id === input.leadId)) throw new Error('Lead not found.');
      const followUp = createFollowUp(input);
      const activity: Activity = { id: `activity-${Date.now()}`, leadId: input.leadId, type: 'internal_note', title: 'Follow-up scheduled', summary: `${followUp.title} · ${new Date(followUp.dueAt).toLocaleString('en-LK')}`, occurredAt: new Date().toISOString() };
      setFollowUps((current) => [followUp, ...current]); setActivities((current) => [activity, ...current]);
      setLeads((current) => current.map((lead) => lead.id === input.leadId ? { ...lead, nextAction: followUp.title, nextFollowUpAt: followUp.dueAt } : lead)); return followUp;
    },
    addLead: (input) => {
      const normalizedPhone = normalizeSriLankanPhone(input.phone); if (!normalizedPhone) throw new Error('Enter a valid Sri Lankan mobile number.');
      const id = `${input.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`; const score = 10;
      const lead: Lead = { id, fullName: input.fullName.trim(), displayPhone: formatSriLankanPhone(normalizedPhone), normalizedPhone, source: input.source, stage: 'new', temperature: 'developing', priority: priorityFromScore(score), probability: 10, bedroomInterest: input.bedroomInterest, nextAction: input.nextAction, nextFollowUpAt: new Date(input.nextFollowUpAt).toISOString(), potentialPropertyValue: 0, score, scoreReasons: ['Complete initial information +10'] };
      const followUp: FollowUp = { id: `fu-${Date.now()}`, leadId: id, title: input.nextAction, dueAt: lead.nextFollowUpAt!, status: 'upcoming', priority: lead.priority };
      setLeads((current) => [lead, ...current]); setFollowUps((current) => [followUp, ...current]); setActivities((current) => [{ id: `activity-${Date.now()}`, leadId: id, type: 'client_update', title: 'Lead captured', summary: input.initialInquiry, occurredAt: new Date().toISOString() }, ...current]);
      void scheduleFollowUpNotification(lead.fullName.split(' ')[0], followUp.title, followUp.dueAt); return lead;
    },
    resolveFollowUp: async (id, resolution) => {
      if (resolution.action === 'cancel') {
        const parsed = cancellationSchema.safeParse(resolution);
        if (!parsed.success) throw new Error('Cancellation requires a reason, replacement action, and valid date/time.');
        const { original, lead } = requireCancellable(latest.current, id);
        const timestamp = new Date().toISOString();
        const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const replacement: FollowUp = { id: `fu-${token}`, leadId: lead.id, title: parsed.data.nextAction,
          dueAt: parsed.data.nextFollowUpAt, status: 'upcoming', priority: lead.priority, type: 'next_action' };
        const activity: Activity = { id: `activity-${token}`, leadId: lead.id, type: 'follow_up_outcome',
          title: 'Follow-up cancel', summary: parsed.data.outcome, occurredAt: timestamp };
        const job: CancellationJob = { originalId: id, oldNotificationId: original.notificationId,
          replacement, firstName: lead.fullName.split(' ')[0] };
        setCRM((current) => {
          const next = applyCancellation(current, id, replacement, activity, parsed.data.outcome);
          return { ...next, cancellationJobs: [...current.cancellationJobs, job] };
        });
        return; // Authoritative CRM transition is applied; notifications finish separately.
      }
      const existing = followUps.find((item) => item.id === id); if (!existing) throw new Error('Follow-up not found.');
      const lead = leads.find((item) => item.id === existing.leadId); if (!lead) throw new Error('Lead not found.');
      await cancelFollowUpNotification(existing.notificationId);
      const timestamp = new Date().toISOString();
      if (resolution.action === 'reschedule') {
        if (!resolution.nextAction || !resolution.nextFollowUpAt) throw new Error('Choose the replacement action and date.');
        const replacement = createFollowUp({ leadId: lead.id, title: resolution.nextAction, type: existing.type ?? 'follow_up', dueAt: resolution.nextFollowUpAt, priority: lead.priority });
        setFollowUps((current) => [replacement, ...current.map((item) => item.id === id ? { ...item, status: 'rescheduled' as const, outcome: resolution.outcome, completedAt: timestamp } : item)]);
        setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, nextAction: replacement.title, nextFollowUpAt: replacement.dueAt } : item));
      } else if (resolution.action === 'waiting' || resolution.action === 'delete') {
        if (!resolution.nextAction || !resolution.nextFollowUpAt) throw new Error('Choose the replacement action and date.');
        const replacement = { ...createFollowUp({ leadId: lead.id, title: resolution.nextAction, type: existing.type ?? 'follow_up', dueAt: resolution.nextFollowUpAt, priority: lead.priority }), status: resolution.action === 'waiting' ? 'waiting_for_client' as const : 'upcoming' as const };
        setFollowUps((current) => [replacement, ...current.filter((item) => item.id !== id)]);
        setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, nextAction: replacement.title, nextFollowUpAt: replacement.dueAt } : item));
      } else {
        const status = resolution.action === 'lost' ? 'cancelled' : 'completed';
        setFollowUps((current) => current.map((item) => item.id === id ? { ...item, status, outcome: resolution.outcome, completedAt: timestamp } : item));
        if (resolution.action === 'lost') setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, stage: 'lost', temperature: 'closed', priority: 'closed', probability: 0, nextAction: 'Closed – lost', nextFollowUpAt: undefined } : item));
        else if (resolution.nextAction && resolution.nextFollowUpAt) {
          const replacement = createFollowUp({ leadId: lead.id, title: resolution.nextAction, type: 'next_action', dueAt: resolution.nextFollowUpAt, priority: lead.priority });
          setFollowUps((current) => [replacement, ...current]); setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, nextAction: replacement.title, nextFollowUpAt: replacement.dueAt } : item));
        }
      }
      setActivities((current) => [{ id: `activity-${Date.now()}`, leadId: lead.id, type: 'follow_up_outcome', title: `Follow-up ${resolution.action}`, summary: resolution.outcome, occurredAt: timestamp }, ...current]);
    },
    recordCallOutcome: async (input) => {
      const lead = leads.find((item) => item.id === input.leadId); if (!lead) throw new Error('Lead not found.');
      const closed = isClosedOutcome(input.outcome); if (!closed && (!input.nextAction || !input.nextFollowUpAt)) throw new Error('An active lead needs a next action and follow-up date.');
      const now = new Date().toISOString(); setActivities((current) => [{ id: `activity-${Date.now()}`, leadId: lead.id, type: 'outgoing_call', title: input.outcome, summary: input.summary, detailedNotes: input.detailedNotes, outcome: input.outcome, occurredAt: now }, ...current]);
      if (closed) setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, stage: 'lost', temperature: 'closed', priority: 'closed', probability: 0, nextAction: 'Closed – lost', nextFollowUpAt: undefined, lastContactAt: now } : item));
      else {
        const followUp = createFollowUp({ leadId: lead.id, title: input.nextAction!, type: 'call_follow_up', dueAt: input.nextFollowUpAt!, priority: lead.priority }); setFollowUps((current) => [followUp, ...current]);
        setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, stage: input.stage ?? item.stage, nextAction: followUp.title, nextFollowUpAt: followUp.dueAt, lastContactAt: now } : item));
      }
    },
    recordWhatsAppSent: async (leadId, templateName, message, nextAction, nextFollowUpAt) => {
      const lead = leads.find((item) => item.id === leadId); if (!lead) throw new Error('Lead not found.'); const now = new Date().toISOString();
      setActivities((current) => [{ id: `activity-${Date.now()}`, leadId, type: 'whatsapp_sent', title: 'WhatsApp recorded as sent', summary: `${templateName}: ${message}`, occurredAt: now }, ...current]);
      if (nextAction && nextFollowUpAt) { const followUp = createFollowUp({ leadId, title: nextAction, type: 'message_follow_up', dueAt: nextFollowUpAt, priority: lead.priority }); setFollowUps((current) => [followUp, ...current]); setLeads((current) => current.map((item) => item.id === leadId ? { ...item, nextAction: followUp.title, nextFollowUpAt: followUp.dueAt, lastContactAt: now } : item)); }
      else setLeads((current) => current.map((item) => item.id === leadId ? { ...item, lastContactAt: now } : item));
    },
    saveTemplate: (template) => setTemplates((current) => template.id ? current.map((item) => item.id === template.id ? { ...item, ...template } : item) : [{ ...template, id: `tpl-${Date.now()}`, active: true }, ...current]),
    duplicateTemplate: (id) => setTemplates((current) => { const source = current.find((item) => item.id === id); return source ? [{ ...source, id: `tpl-${Date.now()}`, name: `${source.name} copy` }, ...current] : current; }),
    archiveTemplate: (id) => setTemplates((current) => current.map((item) => item.id === id ? { ...item, active: false } : item)),
  };

  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() { const context = useContext(DemoDataContext); if (!context) throw new Error('useDemoData must be used within DemoDataProvider'); return context; }
