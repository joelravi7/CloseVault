# Phase 4A: local-only database foundation

Status: draft migrations tested locally in Phase 4B; NOT deployed remotely.
No application adapter, Auth configuration or owner is provisioned. Existing demo
screens/provider/tests remain unchanged. Owner-reported remote readiness is not
independently reverified in this phase.

## Implemented definitions

- Six entities: private immutable approved-owner registry, leads, follow-ups,
  activities, command receipts and append-only reminder intents.
- All 15 lead stages retained. No duplicate phone/email uniqueness, automatic
  normalization, scoring, reopening, sale-completion interpretation or mandatory
  initial follow-up is imposed.
- `cv_create_lead`: optional requested inquiry and initial follow-up; paired
  action/time validation; audit always recorded; all records commit together.
- `cv_cancel_follow_up`: FU-CANCEL-001 mandatory replacement, version checks,
  original history, planning pointer, audit and post-commit reminder intent.
- `cv_edit_lead`: versioned contact-metadata edits only, with immutable audit;
  unknown fields cannot bypass owner, planning or lifecycle restrictions.
- Exact request JSON receipt comparison rejects a reused ID with different input.
  An identical retry returns the original result, without a second transition.
  Request receipts are private customer-bearing data: never log/export casually.
- Commands serialize using the owner's registry row before lead/task locks. Future
  writers must retain consistent ordering. Native scheduling is never called by SQL.
- Phase 4C corrects required-text validation using one private immutable,
  NULL-strict, security-invoker `ecmascript_trim` helper. Commands and constraints
  use the same explicit 25-character ECMAScript boundary-whitespace set. Mandatory
  NULL values fail explicitly; optional NULL inquiry text remains optional.
  Boundary trimming now matches existing Zod `.trim()`, preserves internal text,
  and does not remove zero-width/non-trim characters. See Phase 4B verification's
  Phase 4C section for test-first evidence and safe local reproduction.
- Initial optional follow-ups describe storage capability, not approval of the
  eventual application's required-field policy.

## Security and operations

Migrations are transactional. Explicit table/function revocations neutralize
default Supabase grants for these new objects only. Authenticated clients get
owner-only SELECT and narrowly granted commands, no direct table writes. Registry
starts empty and fails closed. An administrative process must provision the
approved UUID later; never expose a client provisioning function.

Definer commands have an empty search path and explicit auth checks; privileged
administrators can bypass RLS, so client isolation must be verified separately.
Immutable triggers protect audit/receipts/intents and registry update/deletion;
privileged database administrators can still disable triggers and require an
operational access-control boundary.

UTC timestamptz is used throughout. Input must be explicitly zoned at the adapter;
never submit ambiguous local timestamps. Query projections derive next action/time
from `primary_follow_up_id`. Reminder intents do not prove OS delivery. Future
device-specific acknowledgements belong in separate records, not mutable intents.

No credentials/environment changes are required for this work. Do not run README
remote login/link/push instructions. Public signup, production recovery URLs,
owner provisioning and backups remain separate approved manual operations.

## Deferred commands and decisions

Typed review contracts exist for create activity, create follow-up and
Lost closure, but no executable RPC is supplied for them yet. Settle contact edit
validation/duplicate policy, activity kinds/contact semantics and primary-task
selection before implementation. Define owner-approved active eligibility around
sale completion; cancellation currently rejects `lost` and archived leads only.

LEAD-LOST-001 is deliberately unavailable: do not provide a follow-up-only closure
command and claim compliance. A later migration must include multi-stop visits and
all approved SV-001..SV-008 rules before closure is enabled. It must cancel every
open follow-up and outstanding proposed/scheduled/overdue stop with `lead_lost`,
preserve history, clear planning and persist cleanup intent without replacements.

Full site visits remain mandatory before first production release, not this slice.
The hand-written command contracts are NOT generated database types. Local type
generation and verification status are recorded in the Phase 4B report. Phase 4C's
helper is private: public tables/RPC signatures did not change, so the generated
public-schema types remain applicable.

## Isolated verification only

Docker was unavailable in Phase 4A. Phase 4B launched Docker Desktop normally and
applied both migrations to a dedicated disposable PostgreSQL 17 instance. See
[Phase 4B verification](PHASE_4B_DATABASE_VERIFICATION.md) for executed results and
remaining limitations. No remote fallback or package upgrades were used.

When an isolated Supabase instance is explicitly available, review its local-only
configuration, apply migrations there and run `supabase test db` (never `--linked`).
This repository does not include a linked project or connection credentials. The
pgTAP test transaction provisions fictional Auth UUIDs only in the isolated test
database and rolls everything back. Do not execute this file on production.

Tests cover table RLS/write-grant matrices, fail-closed provisioning, owner/non-owner/anonymous access, forged
direct ownership, direct update/audit deletion denial, validation, receipt replay,
payload conflicts, task/lead versions, injected mid-command and initial-creation
rollback, immutable audit updates, forged edit fields, cancellation with another
active task, terminal rejection and cancellation intent. Phase 4B expanded these
with invalid dates, cross-owner FKs, exact cancellation retries, two-session races,
and actual COMMIT failure. Mock tests alone cannot prove database atomicity.

Rollback: for a fresh isolated test database, recreate only that disposable
instance. For persisted data, revoke affected command execution to suspend writes
and apply an approved forward repair or tested restoration; never destructive
reset/drop against production. Do not edit an applied migration.
