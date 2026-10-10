# Phase 5B: isolated real Auth and HTTP/JWT verification

## Scope and source identity

Local integration testing only. No hosted Supabase connection, deployment,
account provisioning or recovery configuration is authorized. Phase 5B
finalization permits one local commit after successful checks; no push is authorized.
The production application and all migrations are unchanged.

- Development branch: `codex/phase-5b-auth-integration`.
- Preserved branch: `checkpoint/phase-5a-authentication`.
- Preserved commit: `43fe931195247b7b6682f0875704e09efb453d42`.
- Parent: `597890abc33755a821b7003d40a8bc6c23db856d`.

The harness reads migration and authentication source bytes with `git show`
from that exact preserved commit, not from an accidentally modified worktree.
It requires that checkpoint to match and that the commit remain an ancestor of
HEAD. Future production changes require a reviewed update to the pinned source
identity; this harness does not certify newer application code automatically.

## Reproduction and isolation

Prerequisites: Docker Desktop, existing project dependencies from the lockfile,
Node.js, Git, tar, and the following locally available images. The harness does
not install dependencies or pull images. On a new machine, acquisition of these
images/dependencies is a separate explicit setup step.

| Component | Image/version | Purpose |
| --- | --- | --- |
| PostgreSQL | `public.ecr.aws/supabase/postgres:17.6.1.167` | Real Auth schema, RLS, commands and pgTAP |
| Auth (two instances) | `public.ecr.aws/supabase/gotrue:v2.196.0` | Password login/refresh/logout; normal and five-second JWT expiry |
| PostgREST | `public.ecr.aws/supabase/postgrest:v16.2` | Real JWT validation and SQL transactions |
| Runner | `public.ecr.aws/supabase/postgres-meta:v0.99.0` | Cached Node/pg runtime; postgres-meta service is not started |

Run from the repository:

```sh
node supabase/tests/integration/run.mjs
npm test -- --watch=false
npm run typecheck
npm run lint
git diff --check
```

The runner requires at least 2 GiB free host disk. Each run generates unique
names and labels, an **internal** Docker network, and five disposable containers.
It verifies isolation before/after starting each container: no published ports,
no host bind mounts/volumes, no privileged mode, and only the owned network.
Database PGDATA is 512 MiB tmpfs; runner files are 128 MiB tmpfs. Container memory
is bounded. Services listen on their container interfaces, not host interfaces.
Nothing mounts the Docker socket. The stopped Phase 4C container is not restarted.
Cleanup removes only names whose ownership label and isolation still match.
Cleanup verification failure is reported for manual review, not bypassed.
Abrupt process/host termination can bypass `finally`; inspect only this run's
ownership labels and isolation before any manual cleanup. Do not use global
prune commands or print environment metadata. A passed run is not a disaster
recovery guarantee or a guarantee against Docker-host administrators.

Secrets are cryptographically random, passed by stdin, and never written into
project files or command-line arguments. Auth admin provisioning and SQL admin
access are confined to the controlled test fixture. Docker administrators can
inspect ephemeral container environment metadata while a run is active; this is
not protection against a compromised host/Docker administrator. Do not print
container Env or raw service logs. Fixtures use `example.invalid` identities;
there are no real owner IDs or customer records.

The real SDK runs inside Docker. A transport-only fetch adapter routes its
standard `/auth/v1` and `/rest/v1` paths to the two real services, without Kong.
Responses, token issuance, verification, refresh, revocation, RLS and command
execution are not mocked. The production controller/gateway are transpiled
without editing source. Node-only import shims replace unused native modules;
memory storage substitutes for device keychain/sessionStorage. This does not
test the configured production HTTPS/publishable-key factory or native storage.

## Migration integrity and SQL checks

Applied in order from the preserved commit:

| Migration | SHA-256 |
| --- | --- |
| `20261010000100_secure_foundation.sql` | `36a6eb9412c21cbe92791a547c46165ddb41715167809ca9521f5c7fdf95d329` |
| `20261010000200_foundation_commands.sql` | `557de32fbc2ae2960ac12e95cd9f19d5e432b78552a1623bfbba1c9a19eeec39` |
| `20261010181858_owner_status.sql` | `6c8aa65032825f617da163e6ead42d7640791bda157ad3023f065d1ba532efbb` |

GoTrue initializes its actual Auth schema first. Controlled fixture role
passwords are set inside the disposable database, with no production SQL edits.
The existing foundation and owner-status pgTAP suites are rerun because this
bootstrap includes live Auth. TAP assertions, not merely psql exit status, are
checked for failures. These SQL tests still use synthetic claims; the separate
HTTP tests use actual Auth-issued tokens and actual PostgREST verification.

## HTTP assertion inventory and evidence boundaries

### F5B-01: exact negative-response contract

A local diagnostic run (`closevault-phase5b-da61e533cd`) inspected only HTTP
status and sanitized error identifiers before assertion changes. The intended
contracts for the pinned services are:

| Scenario | HTTP | Error identifier |
| --- | --- | --- |
| Invalid password / nonexistent account | 400 | `invalid_credentials` |
| Disabled public signup | 422 | `signup_disabled` |
| Malformed, invalid-signature, forged-subject JWT | 401 | `PGRST301` |
| Expired JWT (fixture and actual Auth-issued) | 401 | `PGRST303` |
| Missing auth, anonymous CRM/RPC/command permission | 401 | `42501` |
| Nonowner command / authenticated direct writes | 403 | `42501` |
| Private registry absent from exposed schema | 404 | `PGRST205` |
| Missing reason/action/date; conflicting replay; terminal task | 400 | `22023` |
| Invalid timestamp syntax | 400 | `22007` |
| Explicit optimistic version conflict | 500 | `40001` |
| Deliberately injected COMMIT failure | 400 | `P0001` |
| Revoked refresh token | 400 | `refresh_token_not_found` |

These are exact assertions, not broad status ranges. Auth/permission tests cannot
pass on 5xx. For domain-generated errors, tests also match fixed non-sensitive
identifiers (`CV_UNAUTHORIZED`, `CV_INVALID_COMMAND`, `CV_COMMAND_CONFLICT`,
`CV_TERMINAL_FOLLOW_UP`, `CV_VERSION_CONFLICT`) in memory, without logging
response messages. The fixture exception requires its exact fixed identifier.
Existing unchanged-database snapshots remain mandatory.

PostgREST's documented `40*` mapping is HTTP 500, so the known SQLSTATE `40001`
version conflict is not an unexpected infrastructure failure or an authorization
denial. Only explicit version-conflict tests accept that exact status/code/domain
identifier combination. No schema/error-mapping change is made in this phase.
See [PostgREST error mappings](https://docs.postgrest.org/en/v16/references/errors.html).
The terminal scenario retains its original stale-version check and additionally
checks the current version to exercise the actual terminal-status rejection.

`http.test.mjs` emits fixed test labels, counts, nonsecret expiry timing and
allowlisted HTTP error identifiers, never raw error bodies or messages.
It checks HTTP outcomes **and** administrative snapshots of all five fictional
CRM tables for denied/invalid operations. Admin access is never given to the
application gateway.

- Real owner/nonowner password login; bad password/nonexistent identity denial;
  public signup denial with unchanged Auth users.
- Owner status true/false; anonymous denial; malformed, bad-signature and expired
  JWT denial; missing Authorization; forged owner subject rejected; registry
  provisioning inaccessible through public HTTP.
- Authorized create/edit/read and fresh-client persistence; nonowner RLS hides
  existing rows; unauthorized commands and direct insert/update/delete leave
  CRM state unchanged.
- Invalid FU-CANCEL reason/action/date/version commands roll back; original
  history, existing task, exactly one replacement, primary planning, audit and
  reminder intents survive a successful cancellation consistently.
- Identical replay is state-invariant; conflicting replay and terminal task
  recancellation fail; concurrent identical HTTP requests produce one replacement.
- A disposable deferred constraint-trigger fixture forces a **real COMMIT-time**
  exception after command execution. HTTP fails and every CRM table is unchanged.
  The trigger is removed in `finally` and is not part of any migration.
- SDK INITIAL_SESSION/SIGNED_IN/TOKEN_REFRESHED/SIGNED_OUT, refreshed identity
  restoration, repeated logout, refresh revocation, controller owner/nonowner
  authorization, gateway remount, and private-state clearing callback.
- A real owner-status response is delayed by a controlled barrier while the real
  SDK signs out. Releasing that response cannot reopen controller authorization.
  The server response is not fabricated; timing is deliberately controlled.
- Recovery is unavailable with the existing undefined approved redirect.

Expired-token coverage includes both an adversarial fixture re-signed with the
ephemeral test secret and a naturally expired, **unmodified Auth-issued JWT**.
Both go through actual HTTP validation. PostgREST clock-skew tolerance means
nominal `exp` is not an immediate rejection boundary; the latter probe permits
at most 40 seconds after `exp` for actual rejection. It does not mock time.

Ordinary server logout revokes refresh tokens but leaves already issued access
JWTs usable through PostgREST until expiry (including its tolerance). The current
SDK preserves a session after proactive refresh failure while its access token
remains valid; failed reactive refresh after expiry emits SIGNED_OUT and clears
the stored session. These are distinct behaviors, not equivalent logout claims.

The 30 original deterministic race regressions remain unchanged. Arbitrary
network/event interleavings, browser multi-tab behavior, native process restarts,
keychain corruption, actual React navigation and factory-remount coordination
still need device/browser acceptance testing. The four historical SQL concurrency
scenarios are not represented as rerun by this harness; its new concurrent HTTP
replay/conflict and COMMIT-time rollback checks are separately identified.

## Password recovery and hosted-release gates

Recovery remains disabled. Existing Expo configuration declares the `closevault`
scheme, but no final iOS bundle identifier or Android package is configured.
Before real PKCE recovery, the owner must approve the actual HTTPS web origin,
exact web/native callback URLs, platform identifiers and linking strategy.
Then verify Auth allowlist/provider/mail settings under separate authorization,
same-origin stored PKCE verifier handling, expired/replayed/mismatched callbacks,
new-tab/cross-device limitations, native cold/warm starts and web history/query/
fragment sanitization before rendering or analytics/logging. No production URL
or identifier is invented here; no mail delivery or deep-link success is claimed.

Before hosted deployment: authorized metadata/security preflight, reviewed
migration deployment and backups, controlled real-owner provisioning, disabled
public signup verification, HTTPS/current signing-key and publishable-key testing,
actual JWT/RLS tests in an authorized environment, device/browser acceptance,
recovery/callback sanitization, and a complete authenticated lead persistence
vertical slice. LEAD-LOST-001, SITE-VISIT-001 and durable device reminder
reconciliation remain release requirements; these tests do not implement them.

Service configuration references: [Auth v2.196.0](https://github.com/supabase/auth/blob/v2.196.0/README.md)
and [PostgREST configuration](https://docs.postgrest.org/en/v16/references/configuration.html).

## Execution record

Executed on October 11, 2026, on Apple Silicon Docker Desktop 29.8.0, host Node
24.21.0, runner Node 22.23.2 and installed Supabase JS 2.110.6:

- Initial Phase 5B disposable run: `closevault-phase5b-10b754608c`.
- 47 HTTP/JWT checks passed; zero failures.
- 1,431 foundation and 18 owner-status assertions rerun; zero failures.
- Two concurrent HTTP cancellation scenarios passed (identical replay and
  distinct conflicting commands). Actual HTTP COMMIT-time failure rolled back
  both create-lead and cancellation operations across all CRM tables.
- Naturally expired Auth token rejected with HTTP 401 at 31 seconds after exp;
  the SDK's reactive failed refresh then emitted SIGNED_OUT.
- Existing Jest: 160/160 tests, 13/13 suites; TypeScript and ESLint passed.
- All five owned containers and the owned internal network removed. Existing
  stopped Phase 4C container and unrelated networks remained unchanged.
- Original production source/migrations, dependency manifests, environment and
  existing test files unchanged. This initial record preceded local finalization.

Source-only independent review archive:
`/Users/joeljr/CloseVaultBackups/2026-10-11-phase-5b-review/closevault-phase5b-source-review.tar.gz`.
Its sibling `SHA256SUMS` records artifact integrity; the archive excludes local
environment files, dependencies, databases, credentials and generated runtime.
Archive members are byte-verified against the source during packaging. This is
a review package, not a full repository/source-preservation backup.
This initial archive predates F5B-01 and has not been overwritten. The finalized
four-file local commit, not that older archive, is authoritative for the correction.

Earlier setup attempts were discarded safely: the bootstrap needed the isolated
admin role, an empty env-file was rejected by Docker, the edit test incorrectly
assumed version 1, and initial refresh/expiry expectations omitted SDK preservation
and PostgREST tolerance. These were harness corrections, not production fixes.
No valid production regression was skipped or weakened.

### Finalization verification: F5B-01

- Final strict run: `closevault-phase5b-8e6e33f2d5`; 47/47 scenarios passed.
- Foundation: 1,431/1,431; owner status: 18/18; both rerun in that environment.
- All denial checks require exact status and error identifiers. Fixed domain
  identifiers are additionally checked where applicable; no message body is logged.
- All original scenarios and database snapshots retained. Terminal cancellation
  now also exercises `CV_TERMINAL_FOLLOW_UP` using the current task version.
- No unexpected HTTP responses or application/database defects discovered.
- One earlier attempt stopped before migrations due to a transient PostgreSQL
  initialization-socket readiness race. Owned resources were removed; the existing
  runner succeeded on retry without bootstrap changes. This runner startup timing
  limitation is recorded, not fixed or counted as a successful test.
- Final run verified internal networking, five owned containers, zero published
  ports, no host/socket mounts, and owned-resource cleanup. No hosted target used.
- Existing Jest: 160/160 tests, 13/13 suites; typecheck, lint and whitespace passed.
- Conditional local commit scope: README, this report, `run.mjs`, `http.test.mjs`.
  No production source, migrations, dependencies, or environment files changed.
- Local commit message: `test(auth): add isolated HTTP JWT integration coverage`.
  No push, migration deployment or Phase 6 work authorized.
