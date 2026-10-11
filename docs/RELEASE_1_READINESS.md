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

Updated after the daily-follow-up vertical slice and final regression checkpoint.
