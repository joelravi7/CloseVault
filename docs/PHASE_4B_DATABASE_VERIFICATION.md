# Phase 4B: isolated database verification

## Target and boundaries

Local project: `closevault-phase4b-local`; container:
`supabase_db_closevault-phase4b-local`; PostgreSQL 17.6; Supabase CLI 2.116.0.
Database port 55432. Auth, API, Storage, Realtime, Studio and other application
services are disabled. This is database-only testing, not HTTP/JWT verification.
No hosted project link, credentials, production user or customer data is used.

Docker Desktop 29.8.0 was started normally. No pre-existing containers were found
in the selected desktop-linux context. Other Docker contexts were not changed.
CLI-required container images were downloaded; no package/CLI upgrades or Docker
cleanup occurred. Disk space is constrained and should be checked before reruns.

The CLI explicitly publishes the database on all host interfaces. A Docker bridge
with loopback defaults did NOT override that explicit publication. Treat this as a
local-environment exposure limitation: do not leave the instance running, use only
fictional records, and obtain an approved loopback/firewall solution before ongoing
development. Stopping this project preserves its disposable volume.

## Commands and reproducibility

These are HISTORICAL Phase 4B commands, not the current safe reproduction path.
Do not rerun CLI startup below: its all-interface publication remains unresolved.
The concurrency script now targets the isolated Phase 4C container instead.
Commands were local-only; never substitute `--linked`, `--db-url` or a hosted ref:

```bash
open -a Docker
docker info --format '{{.ServerVersion}}'
docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}'
supabase start --network-id closevault-phase4b-loopback --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
supabase test db --local --network-id closevault-phase4b-loopback supabase/tests/foundation.test.sql
node supabase/tests/concurrency.mjs
supabase stop --project-id closevault-phase4b-local
```

The named bridge is local Docker infrastructure, created with host-binding default
127.0.0.1. It is required by the above commands but does not guarantee port binding.
Normal CLI startup output can contain local development credentials; do not paste
it into reports. Verification used Docker exec/Unix socket for direct queries.

The concurrency script asserts the exact Docker project label, an empty owner
registry and empty leads before provisioning fictional test fixtures. It has no
URL/credential/remote-ref parameters. It leaves fictional records for inspection.
Before rerunning it, positively identify the disposable container/volume and data;
only then use `supabase db reset --local --no-seed --network-id
closevault-phase4b-loopback`. Never reset another database. pgTAP rolls back its
fixtures, and should run before the concurrency script on a clean local database.

## Findings and smallest corrections

Both migrations parsed and applied in order. No migration-definition change was
required during Phase 4B. All six private tables have RLS; inspected constraints
are validated. The owner registry starts empty. Foreign keys, version/history
triggers and command functions execute under tests.

The initial 65-assertion suite failed 28 assertions because the test harness set
only `request.jwt.claims`, whereas this local bootstrap's `auth.uid()` reads
`request.jwt.claim.sub`. The harness now sets both fields for fictional identities;
authorization is unchanged. The original 65 then passed. Expanded results are
101/101 pgTAP assertions passing on a freshly rebuilt disposable database. Four
actual two-session races passed with observed lock waits. A fifth standalone
check forced a real COMMIT failure and verified unchanged counts across all five
CRM tables. Application validation: 52/52 Jest tests, TypeScript, ESLint and Git
whitespace checks passed, including generated public-schema database types at
`src/data/supabase/database.types.ts`.

Authorization assertions use real `SET ROLE authenticated` / `SET ROLE anon` in
addition to synthetic identity claims. Privileged assertions are separately used
for fixture setup, FK/unique constraints and immutable triggers, not as proof of
client RLS. No remote exploit testing occurred.

Owner provisioning remains a future approved administrative INSERT referencing an
existing Auth UUID. Clients cannot insert/read/update the registry. Its immutable
trigger blocks ordinary update/delete, but a privileged administrator can bypass
triggers; this is an operational trust boundary, not protection from administrators.

## Locking and invariants

All implemented commands authorize, then lock the singleton owner row, then the
lead and affected task. This intentionally serializes writes for the single owner.
Two-session tests observe actual `pg_stat_activity` Lock waits, not sequential
simulation. Tests cover cancellation races, versioned edits, different create IDs,
same-key create replay, and deferred failure at a real COMMIT.

This increases contention and is not an exhaustive deadlock proof. No inversion
was found within existing commands; future visit/follow-up commands must follow
the same order. Do not mix lead-first then owner-lock commands with these commands.
Do not redesign locking without a separate reviewed rationale.

FU-CANCEL-001 is preserved. LEAD-LOST-001 remains unavailable rather than exposing
a partial closure without visits/stops. SITE-VISIT-001 / SV-001..SV-008 are unchanged.

## Remaining release gates

- HTTP/PostgREST JWT validation and Auth/session/recovery integration not tested.
- Reminder intents tested, but native notification reconciliation not implemented.
- Visit/stop persistence, full Lost closure and other deferred commands absent.
- Production sign-up/recovery/owner provisioning and backups untouched.
- Additional lifecycle decisions from Phase 4A remain unresolved.
- Current locking tests do not prove every future multi-record interleaving.
- Local port exposure and disk-space limitations require operational attention.

No commit, push or remote deployment is authorized by these local results.

Final state: this project's containers were stopped with backup preservation;
fictional concurrency fixtures remain in its disposable local data volume. The
fresh migration registry was empty; its later test owner is not a production
provisioning operation. Starting this instance again republishes the database
port until the exposure limitation is addressed.

## Phase 4C: P1 required-text correction and executed retest

### Test-first evidence and canonical semantics

Default PostgreSQL `btrim(text)` removes U+0020 only, while the app's Zod
`.trim().min(1)` uses ECMAScript String.trim. The defect affected RPC cancellation
reason/replacement action, create/edit lead names, initial action/inquiry, and
constraints on name, closure reason, task title/cancelled outcome, activity kind
and summary. No Lost-closure command was introduced.

Before changing either migration, the expanded suite ran against the original
definitions: **876 passed, 510 failed, 1,386 total**. All original 101 assertions
passed. Failures demonstrated whitespace acceptance and incorrect trimming of
valid wrapped text. Helper-specific assertions were added after the correction.

The canonical set is exactly U+0009..000D, U+0020, U+00A0, U+1680,
U+2000..200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF.
Do not replace this with locale-dependent POSIX whitespace classes. U+0085,
U+180E, U+200B/C/D and U+2060 are deliberately NOT whitespace under this rule:
the current app accepts them, and this correction does not invent a new ban.

One `closevault_private.ecmascript_trim(text)` helper is immutable, strict,
parallel-safe, security-invoker and uses an empty search path. PUBLIC, anonymous
and authenticated execution is revoked. It reads no CRM data and grants no
privileged access. Mandatory checks explicitly coalesce NULL length to zero;
optional inquiry NULL remains valid. RPC storage trims the same boundaries as
the existing app, preserving internal spaces/tabs and non-whitespace content.
Receipt payloads remain exact original requests, not newly normalized payloads.

41 text cases are exercised across six command fields and six constraint fields:
NULL, empty, repeated ASCII space/tab/newline/CR, mixed whitespace, all 25 individual
trim characters, meaningful/wrapped/internal-whitespace text, and six non-trim
characters. Command probes run as the authenticated approved owner. Constraint
probes are privileged explicitly, not evidence of RLS. Every rejected command is
compared with full ordered JSON snapshots of all five CRM tables, including
planning pointers, original/other follow-ups, versions, history, receipts and
reminder intents—not just counts. A deliberate sentinel rolls successful probes
back, keeping cases independent even before the fix. pgTAP assertions execute
outside probe rollback blocks; test helpers live only in the rolled-back session.

### Safely isolated environment

Target: `closevault-phase4c-whitespace-local`, label
`com.supabase.cli.project=closevault-phase4c-whitespace`. Existing cached image:
`public.ecr.aws/supabase/postgres:17.6.1.167` (server reports PostgreSQL 17.6).
No image/package upgrade or remote connection occurred. This is not a test against
the current hosted PostgreSQL version.

Before startup Docker inspection verified `NetworkMode=none`, empty port bindings,
no host mounts, and tmpfs PGDATA capped at 512 MiB. The server command explicitly
sets `listen_addresses=`. After startup inspection again verified no published
ports and SQL SHOW confirmed an empty listener address. Access used Docker exec
and the container's Unix socket only. Supabase's actual image bootstrap supplied
`anon`, `authenticated`, `auth.users`, `auth.uid()` and pgTAP; no fabricated Auth
stub was used. A random disposable database password was generated without
printing/storing it in project files. Never inspect or paste container Env/logs
for credentials.

Safe reproduction, only if this exact test container does not already exist:

```bash
docker create --name closevault-phase4c-whitespace-local --network none \
  --label com.closevault.test=phase4c-whitespace \
  --label com.supabase.cli.project=closevault-phase4c-whitespace \
  -e POSTGRES_USER=supabase_admin \
  -e POSTGRES_PASSWORD="$(openssl rand -hex 24)" \
  -e POSTGRES_HOST=/var/run/postgresql -e PGDATA=/var/lib/postgresql/data \
  --tmpfs /var/lib/postgresql/data:rw,size=536870912 \
  public.ecr.aws/supabase/postgres:17.6.1.167 \
  postgres -D /var/lib/postgresql/data -c listen_addresses=
docker inspect closevault-phase4c-whitespace-local --format '{{.HostConfig.NetworkMode}} {{json .HostConfig.PortBindings}} {{json .Mounts}}'
# Confirm none, {}, and no host mounts before starting. Stop if different.
docker start closevault-phase4c-whitespace-local
# Wait for Unix-socket readiness; never assume readiness from docker start alone.
docker exec closevault-phase4c-whitespace-local pg_isready -h /var/run/postgresql -U postgres -d postgres
docker exec -i closevault-phase4c-whitespace-local psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261010000100_secure_foundation.sql
docker exec -i closevault-phase4c-whitespace-local psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261010000200_foundation_commands.sql
docker exec -i closevault-phase4c-whitespace-local psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/foundation.test.sql
node supabase/tests/concurrency.mjs
docker stop closevault-phase4c-whitespace-local
```

Inspect TAP output: psql's exit status alone does NOT detect failed assertions.
Concurrency additionally refuses network-enabled containers, published ports,
wrong labels or nonempty owner/lead state. Stopping loses tmpfs test data by
design. Restarting this exact disposable container creates a fresh bootstrap;
never apply this procedure to persisted or unrelated containers. No other
container, Docker volume, network or global firewall was changed/deleted.

### Newly executed final results

Both corrected, uncommitted migrations applied in order to a clean tmpfs cluster;
the initial Auth table was empty and no CRM table existed. **1,431/1,431 pgTAP
assertions passed, zero failures** (101 original plus 1,330 added assertions).
The exact trim codepoint set was also compared with runtime JS/Zod; a database
scan of every Unicode scalar value returned exactly the same 25 codepoints.

All four real two-session scenarios passed again with observed lock waits:
competing cancellations (one replacement), stale edits, distinct creates and
same-key create replay. The actual COMMIT-failure test again verified rollback
across all five CRM tables. Original RLS/privilege, ownership-FK, terminal-state,
mid-command rollback, receipt replay and immutable-history tests passed unchanged.
New helper hardening/revocation/NULL behavior assertions passed. Public API
signatures, existing grants/policies, owner provisioning and lock order did not
change. Private helper introduction does not change generated public-schema types.

Application results: **52/52 tests in four suites passed**, TypeScript passed,
ESLint passed, tracked and untracked Git whitespace checks passed. Existing
application source, dependencies and environment configuration were untouched.
No commit, staging, push, hosted Auth change or remote deployment occurred.
All six private tables had RLS enabled and zero unvalidated foundation constraints
were found. Final shutdown stopped only the labeled Phase 4C container; its tmpfs
fixtures were discarded by design. The container is retained, stopped, with
network disabled and no port bindings. Free host disk space was about 8.7 GiB at
the final check (about 9.8 GiB initially); no disk cleanup was performed.

Remaining gates from Phase 4B still apply, especially HTTP/JWT verification,
notification reconciliation, full Lost/visit commands and production operations.
The prior CLI all-interface startup remains unsafe, although this Phase 4C target
avoids that exposure entirely. This retest is readiness evidence for owner review,
not authorization to commit or deploy.
