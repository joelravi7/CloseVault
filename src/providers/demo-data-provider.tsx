import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react';

import { demoActivities, demoFollowUps, demoLeads, demoSiteVisits, unitTypes } from '@/data/demo-fixtures';
import { formatSriLankanPhone, normalizeSriLankanPhone, priorityFromScore } from '@/domain/business-rules';
import type { Activity, FollowUp, Lead, SiteVisit, UnitType } from '@/domain/models';

interface NewLeadInput {
  fullName: string;
  phone: string;
  source: string;
  initialInquiry: string;
  bedroomInterest: number;
  nextAction: string;
  nextFollowUpAt: string;
}

interface DemoDataContextValue {
  leads: Lead[];
  followUps: FollowUp[];
  activities: Activity[];
  siteVisits: SiteVisit[];
  unitTypes: UnitType[];
  addLead: (input: NewLeadInput) => Lead;
  completeFollowUp: (id: string) => void;
  getLead: (id: string) => Lead | undefined;
}

const DemoDataContext = createContext<DemoDataContextValue | null>(null);

export function DemoDataProvider({ children }: PropsWithChildren) {
  const [leads, setLeads] = useState(demoLeads);
  const [followUps, setFollowUps] = useState(demoFollowUps);
  const [activities, setActivities] = useState(demoActivities);

  const value = useMemo<DemoDataContextValue>(
    () => ({
      leads,
      followUps,
      activities,
      siteVisits: demoSiteVisits,
      unitTypes,
      getLead: (id) => leads.find((lead) => lead.id === id),
      completeFollowUp: (id) => {
        setFollowUps((current) => current.map((item) => (item.id === id ? { ...item, status: 'completed' as const } : item)));
      },
      addLead: (input) => {
        const normalizedPhone = normalizeSriLankanPhone(input.phone);
        if (!normalizedPhone) throw new Error('Enter a valid Sri Lankan mobile number.');
        const id = `${input.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
        const score = 10;
        const lead: Lead = {
          id,
          fullName: input.fullName.trim(),
          displayPhone: formatSriLankanPhone(normalizedPhone),
          normalizedPhone,
          source: input.source,
          stage: 'new',
          temperature: 'developing',
          priority: priorityFromScore(score),
          probability: 10,
          bedroomInterest: input.bedroomInterest,
          nextAction: input.nextAction,
          nextFollowUpAt: new Date(input.nextFollowUpAt).toISOString(),
          potentialPropertyValue: 0,
          score,
          scoreReasons: ['Complete initial information +10'],
        };
        const followUp: FollowUp = {
          id: `fu-${Date.now()}`,
          leadId: id,
          title: input.nextAction,
          dueAt: lead.nextFollowUpAt!,
          status: 'upcoming',
          priority: lead.priority,
        };
        const activity: Activity = {
          id: `activity-${Date.now()}`,
          leadId: id,
          type: 'client_update',
          title: 'Lead captured',
          summary: input.initialInquiry,
          occurredAt: new Date().toISOString(),
        };
        setLeads((current) => [lead, ...current]);
        setFollowUps((current) => [followUp, ...current]);
        setActivities((current) => [activity, ...current]);
        return lead;
      },
    }),
    [activities, followUps, leads],
  );

  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() {
  const context = useContext(DemoDataContext);
  if (!context) throw new Error('useDemoData must be used within DemoDataProvider');
  return context;
}
