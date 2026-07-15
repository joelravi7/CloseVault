import type { Lead, LeadPriority, UnitType } from './models';

export function normalizeSriLankanPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('0094')) local = local.slice(4);
  else if (local.startsWith('94')) local = local.slice(2);
  if (local.startsWith('0')) local = local.slice(1);
  if (local.length !== 9 || !local.startsWith('7')) return null;
  return `+94${local}`;
}

export function formatSriLankanPhone(normalized: string): string {
  if (!/^\+94\d{9}$/.test(normalized)) return normalized;
  const local = normalized.slice(3);
  return `0${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
}

export function formatLkr(value: number): string {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function commission(propertyValue: number, ratePercent: number, probabilityPercent: number) {
  const potential = Math.round((propertyValue * ratePercent) / 100);
  const weighted = Math.round((potential * probabilityPercent) / 100);
  return { potential, weighted };
}

export function qualifiedCommission(input: {
  propertyValue: number;
  ratePercent: number;
  spaSigned: boolean;
  initialPaymentRequired: number;
  initialPaymentReceived: number;
}): number {
  const qualified = input.spaSigned && input.initialPaymentReceived >= input.initialPaymentRequired;
  return qualified ? Math.round((input.propertyValue * input.ratePercent) / 100) : 0;
}

export function priorityFromScore(score: number): LeadPriority {
  if (score <= -100) return 'closed';
  if (score >= 50) return 'A';
  if (score >= 25) return 'B';
  if (score >= 10) return 'C';
  return 'D';
}

export function reconcilePayments(finalPrice: number, payments: number[]) {
  const total = payments.reduce((sum, value) => sum + value, 0);
  const difference = finalPrice - total;
  return { total, difference, reconciled: difference === 0 };
}

export function replaceTemplatePlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}

export function findDuplicateLead(leads: Lead[], phone?: string, email?: string): Lead | undefined {
  const normalizedPhone = phone ? normalizeSriLankanPhone(phone) : null;
  const normalizedEmail = email?.trim().toLowerCase();
  return leads.find(
    (lead) =>
      (normalizedPhone && lead.normalizedPhone === normalizedPhone) ||
      (normalizedEmail && lead.email?.toLowerCase() === normalizedEmail),
  );
}

export function rankUnitTypes(
  units: UnitType[],
  input: { bedrooms: number; minBudget?: number; maxBudget?: number; preferredSize?: number },
): (UnitType & { matchScore: number; reason: string })[] {
  return units
    .map((unit) => {
      let score = unit.bedrooms === input.bedrooms ? 50 : -25 * Math.abs(unit.bedrooms - input.bedrooms);
      const inBudget = (!input.minBudget || unit.price >= input.minBudget) && (!input.maxBudget || unit.price <= input.maxBudget);
      score += inBudget ? 30 : input.maxBudget && unit.price > input.maxBudget ? -Math.min(25, ((unit.price - input.maxBudget) / input.maxBudget) * 100) : 5;
      if (input.preferredSize) score += Math.max(0, 20 - (Math.abs(unit.squareFeet - input.preferredSize) / input.preferredSize) * 20);
      const reason = inBudget
        ? `${unit.bedrooms}-bedroom match within the selected budget`
        : `Closest ${unit.bedrooms}-bedroom alternative by price and size`;
      return { ...unit, matchScore: Math.round(score), reason };
    })
    .sort((a, b) => b.matchScore - a.matchScore || a.price - b.price);
}
