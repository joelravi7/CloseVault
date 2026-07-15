import {
  commission,
  findDuplicateLead,
  formatSriLankanPhone,
  normalizeSriLankanPhone,
  priorityFromScore,
  qualifiedCommission,
  rankUnitTypes,
  reconcilePayments,
  replaceTemplatePlaceholders,
} from '../business-rules';
import type { Lead, UnitType } from '../models';

describe('Sri Lankan phone numbers', () => {
  it.each([
    ['077 123 4567', '+94771234567'],
    ['+94 77 123 4567', '+94771234567'],
    ['0094-77-123-4567', '+94771234567'],
  ])('normalizes %s', (input, expected) => expect(normalizeSriLankanPhone(input)).toBe(expected));

  it('rejects non-mobile and incomplete numbers', () => {
    expect(normalizeSriLankanPhone('0112345678')).toBeNull();
    expect(normalizeSriLankanPhone('077123')).toBeNull();
  });

  it('formats a normalized number for display', () => {
    expect(formatSriLankanPhone('+94771234567')).toBe('077 123 4567');
  });
});

describe('lead rules', () => {
  it('maps transparent scores to priorities', () => {
    expect(priorityFromScore(50)).toBe('A');
    expect(priorityFromScore(25)).toBe('B');
    expect(priorityFromScore(10)).toBe('C');
    expect(priorityFromScore(9)).toBe('D');
    expect(priorityFromScore(-100)).toBe('closed');
  });

  it('finds a duplicate by normalized phone', () => {
    const lead = { normalizedPhone: '+94771234567', email: 'demo@example.test' } as Lead;
    expect(findDuplicateLead([lead], '077 123 4567')).toBe(lead);
    expect(findDuplicateLead([lead], undefined, 'DEMO@example.test')).toBe(lead);
  });
});

describe('commission rules', () => {
  it('calculates potential and weighted commission', () => {
    expect(commission(50_000_000, 2, 40)).toEqual({ potential: 1_000_000, weighted: 400_000 });
  });

  it('qualifies only after SPA and required initial payment', () => {
    const base = { propertyValue: 50_000_000, ratePercent: 2, initialPaymentRequired: 15_000_000 };
    expect(qualifiedCommission({ ...base, spaSigned: false, initialPaymentReceived: 15_000_000 })).toBe(0);
    expect(qualifiedCommission({ ...base, spaSigned: true, initialPaymentReceived: 14_999_999 })).toBe(0);
    expect(qualifiedCommission({ ...base, spaSigned: true, initialPaymentReceived: 15_000_000 })).toBe(1_000_000);
  });
});

describe('sales utilities', () => {
  it('reconciles scheduled payments exactly', () => {
    expect(reconcilePayments(10_000_000, [500_000, 2_500_000, 7_000_000])).toEqual({ total: 10_000_000, difference: 0, reconciled: true });
    expect(reconcilePayments(10_000_000, [9_000_000]).reconciled).toBe(false);
  });

  it('replaces only supplied template placeholders', () => {
    expect(replaceTemplatePlaceholders('Hello {{client_name}}, {{unknown}}', { client_name: 'Amara' })).toBe('Hello Amara, {{unknown}}');
  });

  it('ranks a matching unit within budget first', () => {
    const units: UnitType[] = [
      { id: '2-bed', typeName: 'Two', bedrooms: 2, bathrooms: 2, squareFeet: 1200, price: 40_000_000 },
      { id: '3-bed', typeName: 'Three', bedrooms: 3, bathrooms: 2, squareFeet: 1450, price: 55_000_000 },
      { id: 'expensive', typeName: 'Large three', bedrooms: 3, bathrooms: 3, squareFeet: 2100, price: 80_000_000 },
    ];
    expect(rankUnitTypes(units, { bedrooms: 3, maxBudget: 60_000_000, preferredSize: 1450 })[0].id).toBe('3-bed');
  });
});
