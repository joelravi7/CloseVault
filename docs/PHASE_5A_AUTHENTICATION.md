# Phase 5A: local authentication foundation

## Baseline and scope

Base commit: `597890abc33755a821b7003d40a8bc6c23db856d`.
Checkpoint: `checkpoint/database-foundation-pre-phase-5a` at the same commit.
Development branch: `codex/phase-5a-authentication`.
Existing preservation checkpoints and the Phase 4 implementation are unchanged.
The owner approved local preservation after final security review and application
validation. This implementation is local-only; no push or deployment is authorized.

Implemented locally: typed Supabase Auth gateway, secure storage adapters,
token-free auth state machine, email/password forms, owner verification, logout,
guarded navigation, PKCE recovery handling and deterministic tests. No public
registration, team accounts, live CRM adapter or unrelated domain changes.

## Authorization boundary

`AuthController` separates initializing, signed-out, authenticated owner,
unauthorized authenticated identity, verification-unavailable, password-recovery
and signing-out states. Private access requires the authenticated-owner state.
Restoration and auth events hide access before asynchronous verification. Epochs
reject stale results; foreground restoration cannot supersede an in-flight auth
operation. SDK event callbacks defer API calls to avoid auth-lock deadlocks.
The installed SDK's process lock serializes same-runtime auth operations. SDK
refresh timer start/stop promises are queued, caught and cleaned up; failures
block access rather than creating unhandled rejections.

Cached session identity is NOT authorization. The gateway verifies identity with
`auth.getUser()` then calls `cv_owner_status()`. Network/secure-storage failures
remain unavailable, not confirmed nonowner. An explicit false result is nonowner.
Client clocks are used only for Unix expiry instants, not business-date parsing.
Client guards supplement database authorization; they never replace RLS.

The new ordered local migration adds an authenticated-only boolean RPC using
`SECURITY INVOKER`, an empty search path, no arguments and the existing private
`is_owner()` helper. It returns no registry UUIDs, records or metadata. The
existing private helper retains its narrowly scoped definer privilege. Registry
provisioning is not changed. Existing owner-only RLS/command grants are unchanged.
Database TypeScript types were extended for the boolean RPC and verified against
its local catalog signature. The full type generator was not rerun against a
hosted project; later authorized deployment must regenerate/compare types.

## Configuration and data separation

Only existing variables are read: `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_APP_ENV`.
URL must be HTTPS without credentials, query or fragment. Key must be a
publishable-key format, never service-role/secret. No owner UUID is hardcoded in
production code. No client construction or requests occur at module import.

Fictional demo mode requires both a development build and explicit `demo` label.
Missing production configuration never switches to demo. The demo provider and
biometric provider mount only in demo mode. Verified production-mode owners
receive `/workspace`, which explicitly states CRM persistence is not connected.
Existing demo CRM screens remain demo-only until an approved persistence slice.
Demo fixtures may still be included as fictional bundled source; they are never
served as production CRM records by the auth flow.

## Storage and logout privacy

Native session and PKCE data use Expo SDK 57 SecureStore, with
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Serialized, generation-addressed secure chunks
stay below the documented native payload limit; the manifest pointer commits
last. Failed writes invalidate the old pointer. Missing/corrupt chunks and
availability/read/write/delete errors fail closed, with no plaintext fallback.
A storage fault stays unavailable for that adapter lifetime; reload/restart and
potential controlled secure-storage cleanup may be required. SecureStore is not
a server revocation mechanism, and physical-device behavior remains unverified.

Web uses only `sessionStorage`, never persistent localStorage or a persisted CRM
query cache. Refresh restoration requires server identity and owner verification.
Session storage is accessible to page JavaScript: XSS remains a release security
concern, not solved by session scoping. Closing the browser/tab generally ends
that local storage lifecycle; server tokens have their own expiry/revocation.

Logout blocks access and clears/cancels private TanStack Query data before
awaiting Supabase. A securely persisted denial marker prevents cached restoration
after failure; local session removal is attempted even if the marker write or
remote revocation fails. If secure storage cannot be written or deleted at all,
durable denial/cleanup cannot be guaranteed across a restart; current runtime
access remains blocked and controlled storage recovery is required.
Only explicit successful sign-in or verified recovery clears that marker. Failed
logout is visible and retryable when no terminal SDK event has superseded its
result. A subsequent SDK signed-out event is authoritative for local denial;
late command errors do not replace it. Remote revocation is not claimed successful.
Password fields clear on submit/error, and protected navigation unmounts forms.
No credentials, callback codes or token payloads are logged or placed in context.
No production reminders are scheduled, cancelled or reconciled in this phase.
Future device-specific reminder reconciliation remains required.

## Routes and recovery

`Stack.Protected` declares boundaries before screen rendering. Initial/unavailable/
unauthorized/signing-out states have no private workspace or CRM routes. Sign-in
and recovery-request routes require signed-out state. Recovery sessions can use
the reset form but cannot enter the owner workspace. Index/status routes redirect
according to verified state. The reset route itself may show a generic invalid
link message, but renders password-update fields only for verified recovery.

PKCE callbacks require an explicitly supplied approved redirect, exact scheme/
host/path, exactly one code and no token fragments/extra query fields. HTTPS and
the existing `closevault` scheme are supported by the parser; final addresses
have not been chosen. The installed SDK must emit `PASSWORD_RECOVERY` while
exchanging its stored PKCE verifier; a generic sign-in code is rejected. Owner
verification is required before resetting. Verification retries keep recovery
restricted and require proof of a successful recovery exchange; a cached ordinary
owner session can never turn a failed callback into reset authorization.
Successful password update is followed by local-scope sign-out.
UI responses and errors are generic and do not reveal account existence.

`approvedRecoveryRedirect` is intentionally undefined. The request button stays
disabled and callbacks cannot establish a recovery session until configuration is
approved. Tests inject fictional redirect addresses only. PKCE requires the
originating device/browser context with its verifier; web sessionStorage can make
new-tab/cross-browser links fail safely. App restart does not persist a recovery
UI authorization flag. Expired/reused links rely on the Auth server rejecting
exchange; this is mocked, not verified over HTTP. Native callback routing,
browser refresh/history behavior and reset email delivery need end-to-end tests.
The operating system/browser and Expo Router initially receive the callback URL;
web handling removes its query from the address bar, but no claim is made that
all platform history/navigation metadata is scrubbed. Final callback routing
and history sanitization must be reviewed with the approved deployment URLs.

## Initial Phase 5A verification

- Complete Jest: **130/130 tests across 9 suites**, including all original 52.
- 78 new tests: auth/configuration (37), secure storage (9), gateway (13),
  navigation/forms (13), provider lifecycle (6). SDK/native storage/router
  mechanics are mocked.
- TypeScript and ESLint: passed; final Git whitespace check: passed.
- Existing four regression test files and prior migrations unchanged.
- New RPC: **18/18 actual pgTAP assertions**.
- Foundation rerun unchanged: **1,431/1,431 pgTAP assertions**, no failures.
- Four actual two-session concurrency scenarios and COMMIT-time rollback passed.

Database tests used only the positively identified
`closevault-phase4c-whitespace-local` container: PostgreSQL 17.6, network `none`,
no published ports, no host mounts, 512 MiB tmpfs data, Unix socket only. Restart
provided a fresh disposable bootstrap (zero Auth users/no CRM tables); migrations
were applied in order, then both rollback-wrapped pgTAP suites and concurrency
tests. It is now stopped and tmpfs fixtures discarded. No unsafe CLI DB startup,
hosted project access, real Auth user, customer record or remote JWT was used.

Reproduction requires first rechecking that exact container's labels, networking,
ports, mounts and disposable tmpfs. Use the safe Phase 4C procedure in
`PHASE_4B_DATABASE_VERIFICATION.md`, adding the new owner-status migration after
the two foundation migrations and its test before concurrency. Inspect TAP
failures explicitly; psql exit status alone is insufficient. Never substitute a
hosted URL or restart the older port-published CLI instance.

## P1 terminal-event race correction (2026-10-11)

The original controller discarded `signed_out` while `busy`. A pending successful
owner verification could consequently publish authenticated state after logout.
Test-first reproduction against that implementation: 11 failures / 3 passes in
14 controller race tests, and 6 failures / 0 passes in 6 gateway race tests.
One controller failure timed out because the obsolete busy guard prevented the
new attempt from reaching its deferred completion. A subsequent remount test
also failed before gateway coordination was shared across instances. Valid tests
were not skipped or weakened. The pre-existing 130 tests were left unchanged.

Corrections are limited to the controller and gateway:

- Terminal signed-out/unavailable events are handled before ordinary busy-event
  filtering. They synchronously deny access, advance the controller epoch, clear
  private queries, invalidate recovery proof and release only obsolete ownership.
- Active mutation ownership is the operation epoch, not a free-standing boolean.
  Each `finally` releases only its own operation. Stale success and failure paths
  cannot replace newer authoritative state. Stale password-update completion
  cannot sign out a subsequent login. Cache cleanup exceptions fail closed.
- Ordinary session events and cached restoration cannot reverse terminal denial;
  a new explicit sign-in or recovery attempt is required.
- Gateway generations are checked after storage reads, SDK responses, identity
  verification, owner RPC and denial-marker removal. Terminal events fence late
  SDK session writes. Storage failures are caught and sticky for the runtime.
- SDK mutations and marker/session cleanup share a promise queue. A new sign-in
  waits for earlier cleanup; no auth API is called recursively from an SDK event
  callback. Own-logout SDK events are acknowledged without enqueueing cleanup
  behind a later login. Native SDK `processLock` remains enabled.
- Gateways for the same injected storage adapter share coordination. The real
  configured factory shares one coordination namespace across distinct adapters
  and provider remounts. Terminal denial reaches all registered controllers in
  that namespace. The app still supports only one configured owner/project.

The SDK may finish an already-sent request and temporarily hold its result in
memory. This is not authorization: terminal denial suppresses its session events,
rejects its result and blocks restoration; queued cleanup removes stored session
data before a later explicit login. This does not prove remote token revocation,
cross-process crash safety, browser cross-tab behavior or physical-device storage
semantics. If storage cannot persist denial at all, restart guarantees remain
unavailable. Shared runtime storage faults require controlled recovery/reload;
creating a new provider is not a way to bypass them. An already-sent password
update cannot be undone locally, but its stale response cannot authorize a reset
or log out a newer session.

Final executed application verification:

- **160/160 Jest tests across 13 suites**: all original 52, existing 78 auth,
  and 30 new race regressions (controller 14; gateway 12; configured factory 1;
  real provider/layout boundary 3).
- The provider/layout tests prove private query clearing, workspace removal,
  sign-in destination, rejection of stale login/restoration/recovery results and
  successful subsequent sign-in. Expo Router mechanics, native services and SDK
  network requests remain mocked. No production provider/layout change was needed.
- TypeScript and ESLint passed. Tracked and untracked whitespace checks passed.
  Common credential/private-key/debugging-pattern scan found no matches.
- No commit, staging, push, dependency change, hosted Supabase operation, recovery
  enablement or SQL modification occurred during the correction.
- Database tests were **not rerun** during this correction. The earlier 18 owner
  assertions and Phase 4 evidence above remain historical verification only.

New regression files:

- `src/domain/__tests__/authentication-races.test.ts`
- `src/data/supabase/__tests__/auth-gateway-races.test.ts`
- `src/data/supabase/__tests__/auth-gateway-factory-races.test.ts`
- `src/providers/__tests__/auth-provider-races.test.ts`

## Required approvals and remaining release gates

No remote changes were made. Before approved integration:

1. Local preservation approval does not authorize push, deployment or integration;
   obtain separate approval for those operations and any further corrections.
2. Approve final native app identifiers, HTTPS origin and recovery redirects.
3. Authorize hosted metadata/security inspection and deployment separately.
4. Verify public signup and anonymous sign-in are disabled, email/password Auth
   and appropriate recovery settings are configured, and the owner Auth UUID is
   administratively provisioned in the private registry. Never expose secrets.
5. Review/apply ordered migrations and refresh generated public-schema types.
6. Test real HTTP/JWT, expired/revoked sessions, rate limits, email delivery,
   PKCE redirects, storage failures and direct/deep-link navigation across iOS,
   Android and web. Mocks do not prove those integrations.
7. Implement the small authenticated lead-persistence slice behind data contracts.

Biometric locking remains the existing demo feature and has not been integrated
with production auth. Native background snapshots, device security, web CSP/XSS,
automatic refresh timing and actual Expo navigation need release testing.
Offline CRM access and durable cache persistence are intentionally absent.
Full FU-CANCEL-001 database/client integration, durable notification reconciliation,
LEAD-LOST-001 and complete multi-stop SITE-VISIT-001 remain production requirements;
none were weakened or implemented partially by this auth phase.

## Exact change inventory

Modified tracked files (5):

- `.env.example`
- `README.md`
- `src/app/_layout.tsx`
- `src/app/index.tsx`
- `src/data/supabase/database.types.ts`

New files (23):

- `docs/PHASE_5A_AUTHENTICATION.md`
- `src/app/auth-status.tsx`
- `src/app/recover-password.tsx`
- `src/app/reset-password.tsx`
- `src/app/sign-in.tsx`
- `src/app/workspace.tsx`
- `src/data/supabase/auth-config.ts`
- `src/data/supabase/auth-gateway.ts`
- `src/data/supabase/auth-storage.ts`
- `src/data/supabase/__tests__/auth-gateway.test.ts`
- `src/data/supabase/__tests__/auth-gateway-races.test.ts`
- `src/data/supabase/__tests__/auth-gateway-factory-races.test.ts`
- `src/data/supabase/__tests__/auth-storage.test.ts`
- `src/domain/authentication.ts`
- `src/domain/__tests__/authentication.test.ts`
- `src/domain/__tests__/authentication-races.test.ts`
- `src/features/auth/auth-screen.tsx`
- `src/providers/auth-provider.tsx`
- `src/providers/__tests__/auth-navigation.test.ts`
- `src/providers/__tests__/auth-provider.test.ts`
- `src/providers/__tests__/auth-provider-races.test.ts`
- `supabase/migrations/20261010181858_owner_status.sql`
- `supabase/tests/owner-status.test.sql`

Expo Router's ignored `.expo/types/router.d.ts` was regenerated using the
already-installed CLI route type generator so the new route paths typecheck.
No production environment file, dependencies/lockfile, existing CRM business
source, baseline tests or prior migration was modified. This inventory describes
the changes relative to the base commit; preservation is local-only.
