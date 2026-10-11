# Phase 7A-R: durable save identification and receipt reconciliation

## Scope and preservation

Base commit: `c5ae978dc07337b83e0eea7c6d57c62dedc7ba4a`.
Checkpoint: `checkpoint/phase-7a-pre-recovery`, at that exact commit.
Development branch: `codex/phase-7a-save-recovery`.
The owner authorized the final local commit after the correction validation passed.
GitHub push, hosted deployment and hosted CRM writes remain unauthorized.
No hosted requests, customer records, SQL changes, Auth settings changes or package
changes were performed. Hosted Create/Edit remains disabled at UI and repository.

## Design

`src/domain/lead-save-recovery.ts` defines the versioned metadata schema, a
deterministic JSON representation, and the exact request representation used by
the existing create/edit SQL receipt contracts. Creation timestamps use six-digit
UTC fractional seconds to match the deployed receipt representation. No migrations
or server behavior changed.

`src/data/lead-save-recovery.ts` coordinates one unresolved operation per owner
and environment. Journal preparation is serialized across service instances in
the same JavaScript runtime. A shared scope guard prevents concurrent save/check
execution. The original command UUID is created once by the form. Before RPC:

1. Validate the command and calculate a SHA-256 digest of its normalized request.
2. Read and validate any existing journal entry and its owner/project scope.
3. Reject a different command UUID or changed request for an unresolved operation.
4. Persist the marker, then read it back and verify exact equality.
5. Recheck private access before transmitting the unchanged command.

Failure to persist or verify the marker prevents transmission. A marker written
after concurrent sign-out cleanup is removed if it is still the exact marker
written by that operation. No background/startup mutation replay is implemented.

Journal key: `closevault.crm.pending-lead.v1`.
Fields: schema version, command UUID, operation type, authenticated owner UUID,
Supabase URL origin, SHA-256 request digest, and target lead UUID for edits.
The journal contains **no names, phone numbers, email addresses, inquiry/action
text, dates, request payloads, passwords, API keys or session tokens**. Identifiers
and digests are still private metadata and are cleared on security logout.

Full request details stay only in the form's existing in-memory command. This is
an intentional bounded design, not a durable request queue. It supports persistent
operation identification and reconciliation, not offline replay or durable draft
editing. Native large customer payloads are not split into a new secret-bearing
queue or stored in AsyncStorage/files.

## Approved final reliability corrections

The three final-review findings were corrected locally without enabling writes:

- Recovery publication checks live access before changing state and before each
  subscriber callback. Late receipt success, absence or failure after invalidation
  cannot publish even a blocked warning. Final asynchronous cleanup also rechecks
  access, so an invalidated reconciliation cannot return a navigation result.
  The provider's existing lifetime guard permanently invalidates its old service
  on access loss/account change or unmount; this correction does not change Auth.
- `snapshotSaveOperation` copies only supported command fields, including nested
  follow-up/edit fields, and freezes the detached operation and nested objects
  before the first await. Both canonical hashing and repository transmission use
  this snapshot, including UUID, operation kind and confirmation. Caller changes
  during hashing/storage cannot change the transmitted request. Payloads remain
  memory-only; no customer-payload persistence was introduced.
- Lead detail and edit loading/error branches render the recovery notice, retaining
  discoverability and the explicit server-check control independently of lead reads.

Twelve additional Jest regressions cover late success/absence/error, invalidation
during hashing/final cleanup, detached create/edit requests and UUID/kind changes,
and restored notices in all four detail/edit loading/error combinations. The prior
access-loss test now asserts no publication instead of accepting a stale blocked
publication. Two additional real isolated receipt scenarios exercise caller mutation
and late receipt completion; these simulate local session invalidation, not hosted
token revocation. No tests were skipped or weakened to hide the reviewed defects.

## Storage and survival boundaries

Web reuses the approved `createWebSessionStorage` adapter and sessionStorage only.
The marker survives ordinary refresh/reload in the same browser tab/session. No
localStorage is used. Tab closure/session destruction/storage clearing can lose it;
browser-specific tab restoration and opener copies are not durable guarantees.
Web session storage remains accessible to same-origin JavaScript: this does not
protect against XSS or a compromised origin.

Native reuses the existing `createSecureSessionStorage` adapter with
WHEN_UNLOCKED_THIS_DEVICE_ONLY. Only small bounded metadata is stored, within the
existing 400-code-point secure chunks/pointer protocol. Driver errors block saves;
there is no plaintext fallback. Adapter restoration is tested with a persistent
fictional driver map, not a physical device. Device lock, SecureStore availability,
uninstall, OS storage loss and platform backup behavior remain limitations. The
[SDK 57 SecureStore documentation](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
warns that platform payload limits and persistence behavior must not be treated as
an irreplaceable source of truth. SHA-256 uses the existing pinned Expo Crypto
package and requires a secure web origin.

Security sign-out deletes the journal through the same storage format as Auth.
Session cleanup is attempted even when journal cleanup fails. Terminal SDK
SIGNED_OUT uses the existing serialized denial/cleanup queue. Existing generation,
authorization and cache-cleanup protections are retained. Expiry denies access;
local metadata is not exposed through unauthenticated routes. Logout cleanup cannot
be promised when the platform refuses deletion; such failures remain fail closed.

## Receipt matching

`LeadRepository.receipt` performs authenticated owner-scoped SELECT of command_id,
owner_id, command_type, request and result from public.command_receipts. Existing
getUser/cv_owner_status verification runs before the query. RLS remains authoritative.
No direct insert/update/delete is added. The provider uses the configured Supabase
origin to bind journal state to its environment; demo mode never initializes it.

The user explicitly chooses **Check server outcome**. Reconciliation:

- Validates the stored owner/environment and live private access.
- Queries the exact command UUID under the authenticated owner.
- Requires matching command UUID, owner UUID, create_lead/edit_lead type and
  request digest (JSON key order does not change identity).
- Validates result UUIDs and positive lead version; create requires the expected
  initial follow-up result, edit must reference the original lead and no invented
  follow-up result.
- Refreshes owner-scoped lead queries, then verifies journal cleanup.
- Only then reports recovery and navigates to the authoritative result lead.

Absent receipt means **uncertain**, never “failed.” Malformed/mismatched receipts,
read failures, scope mismatches or cleanup failures block new saves and retain a
safe recovery warning. Known metadata disappearing during a live session does not
silently dismiss that operation. A definitive first command rejection may clear
its marker after authorized receipt checking; a rejection of a retry never clears
an earlier uncertain operation merely because no receipt is visible.

## User experience and retry

The workspace, lead profile and form expose loading, saving, checking, uncertain,
recovered, definitely rejected and blocked states without SQL/HTTP/private details.
An unresolved restored marker disables a fresh form submission. Repeated clicks and
concurrent service instances cannot send a second in-flight request. Explicit form
retry keeps the original UUID and identical request and is idempotent on the server.
No UUID replacement or automatic mutation retry is introduced.

After form reload/native restart, the request is deliberately not reconstructible.
Only receipt reconciliation is offered; no new UUID is issued for that unresolved
operation. If the receipt remains absent, the operation remains blocked/uncertain.
The owner can still perform necessary security sign-out; the notice explains that
this removes local recovery metadata without rolling back a server transaction.
Logout/tab/storage-loss recovery requires manual review of authoritative lead and
receipt history, not blind resubmission. This is an explicit limitation, not a
claim of exactly-once delivery across all storage loss or multiple browser tabs.

The configured application repository always carries a recovery coordinator and
remains read-only. The submission hook rejects a mutation-capable receipt-aware
repository lacking its coordinator. Legacy mocked repositories without a receipt
interface remain usable in unchanged unit tests. The bare isolated RPC adapter is
kept for database tests, not used as a configured writable application repository.

## Validation (2026-10-11)

Commands:

```sh
npm run typecheck
npm test
npm run lint
git diff --check
npm run build:web -- --clear
node supabase/tests/integration/run.mjs
```

Final results after the approved corrections: 303 Jest tests across 21 suites
(247 original tests unchanged plus 56 recovery tests), 77 real HTTP/JWT scenarios
(66 unchanged plus eleven recovery scenarios), 1,431 foundation and 18 owner-status
pgTAP assertions. All were rerun locally after the corrections.
TypeScript, ESLint, whitespace and 32-route web export passed. The disposable
containers/network were removed, and SQL hashes match the preserved baseline.
The recovery/domain/repository subset also passed 98/98 tests with
TZ=America/New_York. Credential review covered all sixteen changed/new files;
no sensitive key/token/private-key literals were detected; manually reviewed test
contacts and customer-like payloads are explicitly fictional.
The ignored environment file remains mode 600; its values were not printed.
Dependency manifests and earlier migrations/tests are unchanged. These validation
results precede final staging; no source changes were made during commit preparation.

New Jest coverage includes create/edit success; journal-before-RPC ordering; lost
response; absent receipt; web refresh; native driver restoration; invalid/mismatched
identity/request/result; unchanged retry; altered retry refusal; multiple clicks and
service instances; expiry/sign-out during reconciliation; owner/project mismatch;
read/write/readback/cleanup failures; corrupt/lost metadata; late write after logout;
failed cache refresh; definite rejection versus prior uncertainty; UI visibility,
disabled restored form, recovery navigation and hosted-write refusal. The original
247 tests were not edited, weakened or skipped.

Real local integration tests recover committed create and edit operations with
deliberately lost responses, restore metadata into a fresh coordinator, exercise
real SELECT/RLS on receipts, and verify no extra lead on identical retry. They also
check never-transmitted operations, changed-request blocking, nonowner receipt
invisibility, mismatched receipt fail-closed behavior and hosted-write protection.
Only fictional data in fresh disposable PostgreSQL/Auth/PostgREST is used.
The final isolated run was `closevault-phase5b-84412122a5`; all five containers
and its internal network were removed. This run included the final cleanup-access
guard and both newly added real-receipt regression scenarios. The earlier run
`closevault-phase5b-6e52619272` also passed and was cleaned up, but preceded the
last cleanup guard and the two added scenarios; it is not the final evidence.

The runner now copies the current Auth gateway for cleanup testing while retaining
the other preserved Auth source files and all prior HTTP scenarios. All SQL bytes
and assertions are unchanged. Docker uses an internal network, no published ports,
no host-directory/socket mounts, tmpfs data and owned-resource cleanup.

## Exact file inventory

Modified:

- README.md
- src/data/contracts/lead-repository.ts
- src/data/supabase/auth-gateway.ts
- src/data/supabase/lead-repository.ts
- src/features/leads/persisted-lead-hooks.ts
- src/features/leads/persisted-lead-screens.tsx
- src/providers/lead-repository-provider.tsx
- supabase/tests/integration/http.test.mjs
- supabase/tests/integration/run.mjs

New:

- docs/PHASE_7A_R_SAVE_RECOVERY.md
- src/domain/lead-save-recovery.ts
- src/data/lead-save-recovery.ts
- src/data/__tests__/lead-save-recovery.test.ts
- src/data/supabase/__tests__/auth-recovery-cleanup.test.ts
- src/features/leads/__tests__/lead-save-recovery-screens.test.ts
- supabase/tests/integration/recovery.test.mjs

## Remaining production gates

Owner review of metadata-only recovery and absent-receipt limitations is required.
Physical native restart/lock/storage cleanup and manual browser refresh/access-loss
acceptance remain pending. Hosted writes/customer entry remain unauthorized and
disabled. Existing dependency remediation, hosted negative-security acceptance,
server-side validation proposals, backup/restore/recovery procedures and all other
release requirements remain. No Phase 7B work was started.
