import { z } from 'zod';

export interface AuthConfiguration { url: string; publishableKey: string }
export function parseAuthConfiguration(url: unknown, key: unknown): AuthConfiguration {
  const parsed = z.object({ url: z.url(), publishableKey: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]+$/) }).parse({ url, publishableKey: key });
  const endpoint = new URL(parsed.url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/')
    throw new Error('A valid HTTPS Supabase URL and publishable key are required.');
  return parsed;
}
// Explicit local demo opt-in only; never infer demo from a configuration failure.
export function isExplicitDemo(label: string | undefined, developmentBuild: boolean): boolean { return developmentBuild && label === 'demo'; }

/** No deployment URL is invented. Owner-approved values must be supplied later. */
export const approvedRecoveryRedirect: string | undefined = undefined;
export function parseRecoveryCode(url: string, redirect: string | undefined): string {
  if (!redirect) throw new Error('Recovery redirect is not approved/configured.');
  const expected = new URL(redirect); const actual = new URL(url);
  if (expected.protocol !== 'https:' && expected.protocol !== 'closevault:') throw new Error('Unsupported recovery redirect.');
  if (expected.username || expected.password || expected.search || expected.hash) throw new Error('Invalid configured recovery redirect.');
  if (actual.protocol !== expected.protocol || actual.host !== expected.host || actual.pathname !== expected.pathname || actual.username || actual.password || actual.hash)
    throw new Error('Invalid recovery callback.');
  if ([...actual.searchParams.keys()].some((key) => key !== 'code') || actual.searchParams.getAll('code').length !== 1)
    throw new Error('Invalid recovery callback.');
  return z.string().min(1).max(2048).parse(actual.searchParams.get('code'));
}
