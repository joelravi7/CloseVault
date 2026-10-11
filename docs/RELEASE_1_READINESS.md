# Release 1 — consolidated readiness and acceptance

This is the active release checklist, not authorization to deploy, access hosted SQL,
enable hosted writes or enter customer data. Earlier phase reports remain historical.

## Sprint A: locally verified foundation

- Phase 7S-B committed; original checkpoints retained. Backup export is fixed-target,
  read-only-session, PG17, verify-full TLS and streaming official age; no plaintext dump.
- Local inspection found non-link-local IPv6 interface addresses and IPv6 default routes.
  This is configuration evidence only, not a hosted connectivity test. No database
  connection or production DNS/network probe was performed.
- [Current Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)
  recommends direct connections for pg_dump. Session pooler uses port 5432 and a
  project-qualified username; its exact hostname must come from the project's Connect
  panel and cannot be invented from a region. No automatic fallback is implemented.
  Keep the direct-only guard until a separately verified endpoint, certificate chain,
  project-specific username/role routing and read-only session semantics can be tested.
  Local IPv6 configuration makes retaining direct mode reasonable; actual reachability
  remains an owner acceptance gate. Transaction pooler port 6543 remains rejected.
- HTTP negative coverage now tests all five tables' POST/PATCH/DELETE denial and anonymous
  reads, unsupported Lost/completion/site-visit RPC denial, and anonymous/nonowner
  cancellation denial with complete before/after CRM snapshots. Existing JWT forgery,
  expiry, owner scoping and stale-session controller tests remain intact.
- Isolated HTTP/JWT: 80 passed; foundation pgTAP: 1,431; owner-status pgTAP: 18.
  Five containers, internal network, zero published ports, no bind/socket mounts;
  owned resources removed. No hosted request is part of these tests.

## Dependency disposition

Use [the detailed Phase 7A classification](PHASE_7A_DEPENDENCY_REVIEW.md) for graph
and runtime reachability. A fresh pre-remediation audit returned 76 affected package
entries (1 critical, 59 high, 16 moderate), not 76 independent vulnerabilities.
`shell-quote` was updated within its existing parent's ^1.6.1 range from 1.10.0 to
1.12.0; five regressions check comment/line-terminator rejection and ordinary quoting.
Only that locked package changed; npm's unrelated optional-peer/metadata churn was
removed. No major Expo, RN, Router or Jest upgrades, audit fix or system installs.

The moderate `decode-uri-component` router/deep-link DoS remains runtime-relevant:
0.2.2 is required through query-string's ^0.2.2, while the advisory affects <=0.4.2.
A patched 0.5 replacement is outside that range, so it is not treated as a proven
low-risk update. Coordinated Router/parser remediation and hostile-link acceptance
remain release gates. Remaining build/dev parser advisories require the existing
classification and private developer servers; no confirmed critical advisory on the
production Supabase Auth/data-access path was identified. This is not vulnerability-free
certification. Post-remediation audit: 73 affected package entries (0 critical, 57 high,
16 moderate); shell-quote no longer reported. Nine direct entries remain, two of which
are dev declarations. The two-high difference also reflects registry/propagated-entry
changes and is not claimed as two additional remediations. Sprint A Jest: 308/308;
TypeScript, ESLint and whitespace passed.

## Browser and native acceptance

Browser automation is available. With dotenv disabled and a fictional HTTPS endpoint
(never the hosted URL), a direct private lead URL redirected to Sign in and did not
render CRM data. This verifies signed-out route denial only. Full fictional authenticated
browser acceptance is **not complete**: the existing isolated Auth/PostgREST runner
has zero published ports and is not reachable from the desktop browser. Do not weaken
that isolation or use the real owner credentials to fill this gap. Rendered screen tests
and actual isolated HTTP controller tests are separate evidence, not browser E2E proof.
During the live development run, refresh also exposed repeated Auth-client warnings
and an initializing screen; its cause was not established. A clean production web export
with the same fictional configuration was then served on loopback: direct private-route
navigation and refresh both settled at Sign in, with no warning/error browser entries
observed. Do not infer that this proves authenticated session restoration or dismiss the
development warning as diagnosed. Keep it on the browser-acceptance checklist.

Manual acceptance on a separately approved isolated browser setup:

1. Configure only fictional local Auth/REST, disabled signup and fictional approved owner.
2. Sign in; verify private workspace, empty/error/loading states and no fixture fallback.
3. Seed >25 fictional leads using reviewed local RPCs; search name/phone/email and filter
   stage/source beyond the first page. Check deterministic ordering and page reset.
4. Open a lead; compare contact, primary task and complete history to local records.
5. Refresh; verify session restoration through getUser/owner-status and current data.
6. Sign out; verify route denial, private-query cleanup and no back-button private content.
7. In a read-only client configuration, verify Create/Edit/cancellation are disabled and
   direct invocation rejects before a mutation request.
8. Repeat daily-work boundaries at Colombo midnight, mobile-width layouts, keyboard,
   screen-reader labels and physical iOS/Android devices. Device acceptance is pending.

## Operator go/no-go checklist for a real-data pilot

All gates must be explicitly passed before hosted writes/customer entry:

- Owner authorizes hosted security acceptance separately; privately verifies correct
  project, owner registry, getUser/owner-status, disabled signup, recovery policy and redirects.
- Repeat negative anonymous/nonowner/JWT/direct-write/unsupported-RPC tests against an
  approved hosted acceptance fixture; absence of customer data is not an RLS test.
- Install trusted native PG17 clients as a separate owner action. Privately supply official
  direct connection, CA and scoped passfile; verify role completeness/least privilege.
- Follow [the backup operator runbook](PHASE_7S_B_OPERATOR_RUNBOOK.md) only after hosted
  export approval. Independently secure age identity copies and provenance evidence;
  approve off-site custody/retention. Complete actual hosted encrypted export and restore
  into a separate approved destination, including 17.11/provider compatibility.
- Test Auth UUID continuity or approve a destination-only new-owner recovery mapping;
  application-only exports exclude Auth, Storage objects, global roles and provider config.
  RPO/RTO are proposals until measured; no complete hosted disaster recovery is proven.
- Complete native session/lock/storage/recovery acceptance and browser authenticated E2E.
- Resolve runtime parser advisory, test deployment hardening and approve a production build.
- Review application-only creation rules versus weaker existing server requirements;
  race-free contact uniqueness is not promised. No unapproved schema enforcement is added.
- Validate recovery limitations: same-tab session storage, native adapter but no physical
  crash proof, missing receipt remains uncertain, retry only with exact retained request,
  logout/tab closure may lose metadata. No exactly-once delivery guarantee.
- Notification intents are persisted after atomic cancellation, but native designated-device
  reconciliation still needs implementation/acceptance before reminder delivery claims.
- Complete mandatory multi-stop SITE-VISIT-001 and LEAD-LOST-001 before the full first
  production release; neither is implemented in this daily-follow-up sprint.

Current decision: **NO-GO for hosted mutations and real customer data.** Local development
can continue because these are explicit release gates, not an authorization bypass.

## Sprint B and final measured validation

- `/crm/follow-ups` supplies Today, Overdue and Upcoming queues. Colombo midnight
  defines day boundaries; an active task later today remains in Today. Overdue means
  before today's start, not every task earlier than the current minute. UTC bounds are
  applied before pagination, with due_at/id ascending and exact-count 25-row pages.
- The existing lead repository now queries owner-scoped tasks joined to owner-scoped
  leads. Terminal tasks and lost/archived leads are excluded. The screen provides contact,
  stage, scheduled time, lead navigation, loading/empty/error/retry/refresh and pagination.
  It does not load the entire CRM or synthesize demo data in hosted mode.
- Lead list/detail link to the queue; actionable profile tasks link to cancellation.
  Only cv_cancel_follow_up is used for mutations in isolated tests. The SQL, stage
  transitions, Lost closure and site visits remain unchanged/unavailable.
- Cancellation requires reason, meaningful replacement action, valid Colombo/offset date,
  task version and explicit confirmation. The atomic RPC retains history, creates one
  replacement, updates primary planning and stores reminder intents. UI and repository
  reject hosted cancellation independently, as they do Create/Edit. No notification API
  is called or delivery inferred by this interface.
- The existing recovery coordinator now supports cancellation without a parallel storage
  system. It stores only IDs/scope/type/digest, never cancellation reason, action/date,
  customer payload or credentials. Detached immutable requests are journaled/verified
  before transmission. Identical retained retries reuse UUID/request; unrelated new
  commands are blocked while unresolved. Receipt reconciliation checks type/owner/digest,
  original/replacement IDs and preserved task-to-lead/replacement relationships before
  refresh and journal cleanup. Late invalidated reads cannot publish subscriber updates.
- Recovery remains visible during cancellation loading/errors and on the daily queue.
  After navigation/restart, reconciliation is offered, not automatic replay or a guessed
  new command. Original creation/edit recovery semantics and tests remain intact.

Final measured results:

| Validation | Result |
| --- | --- |
| Jest | 346/346, 25 suites (303 baseline + 5 dependency + 38 daily-work tests) |
| Real isolated HTTP/JWT | 87/87 (77 baseline + 3 security + 7 daily-work scenarios) |
| Foundation / owner-status pgTAP | 1,431 / 18 passed in the final integration run |
| America/Los_Angeles regressions | 136/136 across six suites |
| TypeScript / ESLint / whitespace | Passed, zero lint warnings in the final run |
| Production web export | Passed, 34 routes, dotenv disabled and fictional configuration |
| Age encryption/export unit tests | 33/33 rerun; prior unchanged 17-check restore rehearsal retained |
| Credential / sensitive-path review | No findings; no environment/key/archive artifacts staged |

All database mutations used the owned disposable internal Docker runner, with zero
published ports and only tmpfs mounts. It confirmed cleanup. Pre-existing unrelated
local containers were not changed. Browser smoke servers were loopback-only, used no
real credentials and were stopped. No hosted database access, SQL changes, Auth changes,
customer entry, deployment or push occurred.

Implemented vertical slices are locally usable/tested; hosted reads remain owner-authorized
and hosted mutations remain prohibited. Follow-up completion/rescheduling/addition lack
approved executable server contracts and are not exposed by this new interface. The
separate fictional demo workflows remain unchanged. Full first-production release still
requires the gates above, including complete multi-stop visits and Lost closure.
