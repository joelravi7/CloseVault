# Phase 7A: lead persistence (local review, not release approval)

## Scope and preservation

Base: `df88eee86acda28fdebfe6226ea0208591833f93`.
Checkpoint: `checkpoint/phase-6c-pre-phase-7a` at that exact commit.
Development branch: `codex/phase-7a-lead-persistence`.
Earlier checkpoints and commits remain unchanged. The owner authorized one local
implementation commit after final acceptance. No push is authorized.
No hosted reads, writes, SQL deployment, Auth changes or customer entry were
performed during this implementation. Existing hosted configuration was not edited.

## Architecture and behavior

- `src/domain/lead-persistence.ts`: approved validation, international E.164
  normalization and Colombo rendering. Reuses the original Sri Lankan utility
  for local inputs, validates with pinned libphonenumber-js full metadata, and
  reuses the existing strict Colombo date parser without changing cancellation.
- `src/data/contracts/lead-repository.ts`: typed supported database rows, list,
  detail, duplicate lookup and existing command contracts. No invented fields.
- `src/data/supabase/lead-repository.ts`: typed SDK reads and create/edit RPCs.
  Zod validates external lead and history rows and command results. Owner-scoped
  predicates supplement (never replace) database RLS. Generic errors do not expose
  raw SQL, customer content, request bodies or tokens.
- `src/providers/lead-repository-provider.tsx`: mounted only for authenticated,
  non-demo access. Uses the existing configured Auth gateway's getUser/owner RPC
  verification before each operation. Captured repositories are permanently denied
  after access loss or unmount; late results cannot enter private query data.
- `src/features/leads/persisted-lead-hooks.ts`: owner-keyed TanStack queries,
  cancellation signals, no automatic mutation retry, and invalidation after saves.
- Protected workspace/CRM routes render list, details and restricted create/edit
  forms. Existing demo screens/provider, Auth controller, migrations and all fifteen
  stages are unchanged. No stage transition is introduced.

List: 25 records per page; created_at descending then id descending. Name/mobile/
email substring search and exact stage/source filters execute in database queries.
Search/filter changes reset the page. Loading, empty, safe error/retry and refresh
states are rendered. Detail reads all follow-up/activity history in 250-row pages.
Primary planning comes from the real primary follow-up, not invented lead columns.
Completed/cancelled records remain in history; no lifecycle actions are enabled.

Creation requires full name, valid mobile, source, inquiry, a next action of at
least three characters (consistent with the existing demo form), and valid date/time.
Optional email is validated and lowercased. International mobiles include Sri Lankan
local/+94, +971, +44 and other valid mobile numbering plans; mixed fixed/mobile
classification is accepted where a numbering plan cannot distinguish it. Syntax
validation does not prove number ownership or reachability. Qualification such as
budget, bedrooms and residence preference is inquiry text, not unsupported columns.
Unzoned date/time denotes Asia/Colombo and is converted to UTC; no requirement for
a future date has been invented.

Editing exposes only full name, mobile, email and source. Mobile cannot be cleared.
Incomplete existing records remain readable, with required-field guidance on save.
The adapter sends only cv_edit_lead's supported JSON keys. No stage/planning edits.

Duplicate checks scan every authorized row in deterministic 250-row database pages,
outside list pagination/search. Canonical mobile and normalized email are compared;
the edited record is excluded. Matching leads are shown; saving a separate lead
requires explicit confirmation. No merge, overwrite or uniqueness enforcement is
claimed. The exhaustive scan supports legacy noncanonical contacts but is O(N);
a reviewed canonical-search schema/index/RPC should replace it before large-scale use.
Final review corrected short-response handling: exact counts are required, offsets
advance by actual rows returned, and missing/inconsistent counts, premature empty
pages or repeated IDs fail closed. Numbered list pages also reject incomplete
responses. This detects truncation, not concurrent edits within a stable row count;
the scan is not a database snapshot or race-free deduplication guarantee.

cv_create_lead receives the existing initial inquiry/action/date arguments, with
ownership and timestamps assigned by the database. cv_edit_lead uses the read version.
No direct CRM insert/update/delete is used. Forms retain one command UUID and freeze
the payload before submission. Double taps are guarded synchronously. Uncertain
results retain the original command, including when a subsequent duplicate check
finds the record from the earlier attempt. Failed saves are not automatically retried.
Version conflicts show reload guidance; successful saves invalidate owner lead queries.
Final review removed the edit form's version-based remount key and freezes the
original edit record/version. Background refresh cannot discard a retained command
or silently rebase an unsaved draft. Unknown-result guidance explicitly warns against
leaving/reloading the form; remounting never automatically submits a command.

Command retention is in-memory within the form, not a durable offline queue. Leaving
or reloading the form can lose an uncertain command; do not enable customer writes
without a reviewed durable/reconciliation UX. The existing Auth fetch wrapper can
override query abort signals; network requests may finish after cancellation, but
access-loss guards reject their results. No Auth transport changes were made.

## Hosted-write boundary

`createHostedLeadRepository` is always read-only. Environment labels do not toggle
writes. Forms/buttons are disabled and repository create/edit rejects before any
authorization or RPC call. No demo fallback occurs. Tests verify both UI and adapter.

`createIsolatedLeadRepository` constructs its own SDK client for HTTP loopback or
`http://rest:3000` inside the disposable runner only. Its transport checks origins,
disallows URL credentials/nonlocal hosts and rejects redirects. The direct Docker
PostgREST endpoint has no gateway, so only that endpoint removes `/rest/v1`.
This factory is never used by configured application screens. It requires only the
fictional runner's client-safe key/JWT, not service credentials. RLS/RPC ownership
remain authoritative even when a hostile client bypasses UI restrictions.

## Application rules versus SQL guarantees

The deployed create RPC requires nonblank name; it does not enforce the additional
Phase 7A contact/qualification/planning requirements or normalize contacts. The
application enforces these requirements at both form and repository boundaries.
Equivalent server enforcement requires a separately reviewed NEW migration.
There is no contact uniqueness constraint or race-free duplicate detection.
Different command UUIDs can create leads with shared contacts. Stable command replay
prevents duplicate execution of the same command, not all duplicate buyers.
Detail/history reads are separate queries, not a transactionally consistent snapshot.

## Local verification (2026-10-11)

Commands:

```sh
npm test
npm run typecheck
npm run lint
git diff --check
TZ=America/New_York npm test -- --runTestsByPath src/domain/__tests__/lead-persistence.test.ts src/data/supabase/__tests__/lead-repository.test.ts
node supabase/tests/integration/run.mjs
npm run build:web -- --clear
```

Final validation: 247/247 Jest tests across 18 suites (174 retained, 73 new),
TypeScript passed, ESLint passed with zero warnings/errors, and Git whitespace
passed. The relevant timezone run passed 55/55 tests with TZ=America/New_York.
The final isolated run passed 66/66 HTTP/JWT scenarios plus 1,431 foundation and
18 owner-status SQL assertions; migrations were reapplied to a fresh disposable
database and all owned containers/network were removed. The final web export
passed with 32 routes, including all three new CRM leaf routes. Only harmless
NO_COLOR/FORCE_COLOR build notices were emitted.

Credential review covers the 24 final changed/new files (the initial inventory was
seven modified and sixteen new; final review adds a separate dependency report).
No secret-key, private-key or
JWT literals found. Source inspection found no new debug logging or direct CRM
writes. The ignored `.env.local` retains mode 600, only the three approved variable
names, correct hosted URL and modern publishable-key format; values were not printed.
All three migration SHA-256 hashes match the preservation baseline. The original
174 tests and Auth source files are unchanged. Generated dist remains ignored.

The query-performance review identified missing dedicated created_at/id/search
indexes, OFFSET costs on deep pages, and the O(N) legacy duplicate scan. No indexes
or schema changes were made. Numbered pagination can shift when records are inserted
between page reads; consider a separately reviewed cursor/index strategy at scale.
The fresh audit reports 74 affected package entries (16 moderate, 57 high, one
critical), versus 76 previously reported. No dependency changes explain this
registry-report difference. See [dependency review](PHASE_7A_DEPENDENCY_REVIEW.md)
for the complete inventory, install/runtime distinctions and remediation proposals.
The critical shell-quote finding is developer tooling, not a confirmed active
production authentication/data path. No automatic fixes or major upgrades occurred.

The 174 pre-existing Jest tests are retained without edits. New tests cover domain
validation, payload mapping, paging/filter/order, full-scope duplicate detection,
write denial, sanitized errors, retry stability, version conflicts, invalid/owner
authorization, late-result denial, private repository invalidation, query refresh
and real React Native component rendering. Mocks do not prove database atomicity.

The isolated integration harness retains all 47 prior HTTP/JWT scenarios and adds
19 actual-adapter scenarios: atomic lead/inquiry/primary task creation; identical
and concurrent command replay; invalid mobile/date without changes; duplicate
confirmation; versioned edit/history; edit replay; version and command conflicts;
multi-page server search/filter and duplicate lookup; empty results; hosted write
denial; real nonowner denial and RLS; lost-access denial.
Final review adds real short HTTP page handling, premature scan termination denial,
and a lost successful RPC response followed by an idempotent same-command retry.
Fresh PostgreSQL applies all three byte-identical migrations; foundation 1,431 and
owner-status 18 pgTAP assertions run, plus actual HTTP COMMIT-time rollback in the
retained suite. No historical standalone four-scenario concurrency result is
represented as a new run; retained HTTP concurrent scenarios are actually rerun.

The initial new adapter run failed because direct PostgREST has no `/rest/v1`
gateway prefix. The isolated-only transport mapping was corrected; original HTTP
and SQL scenarios passed throughout. Disposable runs have an internal Docker
network, zero published ports, no bind/Docker-socket mounts, tmpfs data, bounded
resources and ownership-checked cleanup. Unrelated containers are untouched.

Web export and rendered component tests are not interactive browser acceptance.
No actual owner login was repeated; no physical iOS/Android test is claimed.

## Changed-file inventory

Modified:

- README.md
- package.json
- package-lock.json
- src/app/_layout.tsx
- src/app/workspace.tsx
- supabase/tests/integration/http.test.mjs
- supabase/tests/integration/run.mjs

New:

- docs/PHASE_7A_LEAD_PERSISTENCE.md
- docs/PHASE_7A_DEPENDENCY_REVIEW.md
- src/app/crm/_layout.tsx
- src/app/crm/create.tsx
- src/app/crm/edit/[id].tsx
- src/app/crm/lead/[id].tsx
- src/data/contracts/lead-repository.ts
- src/data/supabase/lead-repository.ts
- src/data/supabase/__tests__/lead-repository.test.ts
- src/domain/lead-persistence.ts
- src/domain/__tests__/lead-persistence.test.ts
- src/features/leads/persisted-lead-hooks.ts
- src/features/leads/persisted-lead-screens.tsx
- src/features/leads/__tests__/persisted-lead-screens.test.ts
- src/providers/lead-repository-provider.tsx
- src/providers/__tests__/lead-repository-provider.test.ts
- supabase/tests/integration/leads.test.mjs

Pinned additions: libphonenumber-js 1.13.15 and Expo SDK 57-compatible expo-crypto
57.0.1. Existing dependency versions/lock entries remain unchanged. No credentials,
environment changes, migration changes or generated build output belong in this diff.

## Gates before production customer writes

Final focused source/security review found no unresolved high-severity defect in
the committed slice. This is not production release or hosted-write approval.
Remaining gates: explicit hosted write
authorization; hosted negative authorization acceptance; owner-operated web and
physical native lead UX/access-loss testing; reviewed durable uncertain-command
handling and reconciliation (mandatory, including recovery across form reloads);
backup/restore and recovery procedures; dependency remediation and acceptance.
No Supabase Auth provisioning/settings changes are included. Lost closure, multi-stop
site visits, notification reconciliation, broader persistence and all previously
approved release requirements still require subsequent authorized implementation.
