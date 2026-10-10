export type LeadStage =
  | 'new'
  | 'connected'
  | 'requirement_identified'
  | 'documents_sent'
  | 'serious_interest'
  | 'site_visit_planned'
  | 'site_visit_completed'
  | 'unit_shortlisted'
  | 'negotiation'
  | 'reservation_expected'
  | 'reserved'
  | 'spa_in_progress'
  | 'sale_completed'
  | 'long_term_follow_up'
  | 'lost';

export type LeadTemperature = 'hot' | 'warm' | 'developing' | 'cold' | 'closed';
export type LeadPriority = 'A' | 'B' | 'C' | 'D' | 'closed';

export interface Lead {
  id: string;
  fullName: string;
  displayPhone: string;
  normalizedPhone: string;
  email?: string;
  source: string;
  stage: LeadStage;
  temperature: LeadTemperature;
  priority: LeadPriority;
  probability: number;
  bedroomInterest: number;
  budgetMin?: number;
  budgetMax?: number;
  nextAction: string;
  nextFollowUpAt?: string;
  lastContactAt?: string;
  motivation?: string;
  primaryObjection?: string;
  privateStrategyNotes?: string;
  potentialPropertyValue: number;
  score: number;
  scoreReasons: string[];
}

export interface FollowUp {
  id: string;
  leadId: string;
  title: string;
  type?: string;
  description?: string;
  dueAt: string;
  status: 'upcoming' | 'due' | 'overdue' | 'completed' | 'waiting_for_client' | 'cancelled' | 'rescheduled';
  priority: LeadPriority;
  outcome?: string;
  completedAt?: string;
  notificationId?: string;
}

export interface Activity {
  id: string;
  leadId: string;
  type: string;
  title: string;
  summary: string;
  outcome?: string;
  detailedNotes?: string;
  occurredAt: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: 'introduction' | 'brochure' | 'price_list' | 'site_visit' | 'follow_up' | 'custom';
  body: string;
  active: boolean;
}

export interface UnitType {
  id: string;
  typeName: string;
  squareFeet: number;
  bedrooms: number;
  bathrooms: number;
  price: number;
  maidRoom?: boolean;
}

export interface SiteVisit {
  id: string;
  leadId: string;
  scheduledAt: string;
  meetingPoint: string;
  status: 'proposed' | 'scheduled' | 'completed';
}
