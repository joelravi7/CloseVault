# Phase 6A: local-only migration filename alignment

## Scope and preservation

- Base commit: `a42ec9711a1fa88612cec7b033f4dde795e4a10b`.
- Checkpoint: `checkpoint/phase-5b-pre-phase-6a`, pointing to that base.
- Development branch: `codex/phase-6a-migration-alignment`.
- Existing commits and preservation checkpoints are not modified.
- SQL contents, business rules, Auth behavior, RLS, dependencies and application
  configuration are unchanged. No hosted CLI commands or deployments are allowed.

The owner supplied independently verified hosted migration-ledger evidence:
exactly three deployed migrations with SQL bytes matching the hashes below.
This evidence authorizes local filename alignment only. Codex did not query the
hosted ledger or database during this phase.

## Original-to-aligned mapping

All files remain under `supabase/migrations/`, in their original execution order.

| Original filename | Aligned filename | Unchanged SHA-256 |
| --- | --- | --- |
| `20261010000100_secure_foundation.sql` | `20261010202459_secure_foundation.sql` | `36a6eb9412c21cbe92791a547c46165ddb41715167809ca9521f5c7fdf95d329` |
| `20261010000200_foundation_commands.sql` | `20261010202601_foundation_commands.sql` | `557de32fbc2ae2960ac12e95cd9f19d5e432b78552a1623bfbba1c9a19eeec39` |
| `20261010181858_owner_status.sql` | `20261010202607_owner_status.sql` | `6c8aa65032825f617da163e6ead42d7640791bda157ad3023f065d1ba532efbb` |

The directory must contain exactly these three migrations, with unique version
IDs. Git should report each as a 100% identical rename. No migration ledger is
repaired, and no new schema migration is introduced.

## Operational references

- README uses the aligned owner-status path and identifies the deployment
  evidence boundary, rather than treating historical nondeployment as current.
- Phase 4B reproduction paths use aligned names; recorded results remain historical.
- Phase 5B retains its original filename/hash table and links this mapping.
- The integration runner reads the aligned working-tree SQL files and compares
  their complete bytes against the originals at preserved Phase 5A commit
  `43fe931195247b7b6682f0875704e09efb453d42` before applying each file.
- Authentication source and pgTAP tests remain pinned to that preserved commit.
  Original Phase 5A commit inventories retain historical filenames intentionally.

## Local verification procedure

```sh
shasum -a 256 supabase/migrations/*.sql
node supabase/tests/integration/run.mjs
npm test -- --watch=false
npm run typecheck
npm run lint
git diff --check
git diff --cached --check
```

The existing runner uses a fresh disposable PostgreSQL cluster and real local
Auth/PostgREST services on an internal Docker network. It verifies zero published
ports, no host-directory or Docker-socket mounts, and removes only its owned
containers/network. It uses cached dependencies/images without installing or
upgrading them. Random credentials and fictional Auth identities exist only in
the isolated disposable fixture, never in hosted Supabase or project files.
The previously stopped Phase 4C container must not be restarted.

Hosted CLI history listing and `db push --dry-run` verification are deliberately
deferred. CLI 2.116.0 token-based database access can create temporary hosted
roles; this phase avoids that access entirely. Filename consistency relies on
the owner-provided evidence, not a new remote verification. Do not run linking,
linked listing, pushing, pulling, reset, repair or hosted SQL commands here.

## Execution record

Executed October 11, 2026, using disposable run `closevault-phase5b-667a034d8b`:

- Exactly three migration files and unique version IDs verified; all approved
  SHA-256 hashes and preserved Git source bytes matched before testing.
- All three aligned migration files applied successfully to a fresh database.
- Foundation pgTAP: 1,431 passed, zero failures.
- Owner-status pgTAP: 18 passed, zero failures.
- Real local HTTP/JWT: 47 passed, zero failures. Includes concurrent identical
  cancellation replay, conflicting cancellation, actual COMMIT-time rollback,
  authorization denial and natural Auth-issued token expiration.
- Jest: 160 passed across 13 suites, zero failures.
- TypeScript, ESLint, runner syntax and Git whitespace checks passed.
- Five owned containers and their internal network removed successfully;
  pre-existing stopped Phase 4C container and unrelated networks untouched.
- Application source, HTTP test scenarios, SQL tests, dependencies and local
  Supabase configuration unchanged.

These are newly executed Phase 6A checks. The four historical two-session SQL
concurrency scenarios were not separately rerun; concurrent HTTP checks are
distinct evidence. Historical Phase 4/5 execution records remain unchanged.

Commit inventory: README, Phase 4B and Phase 5B reference documentation, this
Phase 6A document, the integration runner, and three byte-identical migration
renames (eight file changes total). Commit message:
`chore(db): align migration versions with hosted Supabase`.

## Remaining boundaries

No GitHub push, owner provisioning, live Auth configuration, recovery redirects,
customer-data access or application-persistence implementation is part of Phase
6A. Device/browser acceptance, LEAD-LOST-001, multi-stop SITE-VISIT-001 and durable
notification reconciliation remain first-production-release requirements.
