# Phase 7S-B: hosted backup readiness — no hosted connection performed

## Baseline and authorization

Base `051e0e7fc3371e74fb93091d4efdd4937de86d41`.
Checkpoint `checkpoint/phase-7s-a-pre-hosted-backup`, same commit.
Development branch `codex/phase-7s-b-hosted-backup-readiness`.
This implementation is pending review. No commit, hosted connection, production SQL,
role creation, Auth change, deployment, customer import or GitHub push is authorized.

## Export architecture and scope boundary

`export-hosted.mjs` is a separately confirmed, owner-operated CLI. It accepts only a
private external configuration path and `--confirm-export uxecsfrnmlbugkuhjfeu`.
Importing the core never connects. Tests never invoke its native hosted connection path;
argument-guard tests stop at missing-argument validation before a connection is possible.
The only native database operations are PostgreSQL 17 version checks, fixed catalog
SELECTs and scoped `pg_dump`. There is no SQL input option, restore command, Supabase
CLI call, role creation or migration deployment. Session startup settings enforce
read-only transactions, catalog search path and row-security-off completeness checks.
These settings are not persistent configuration changes or a privilege sandbox.

Configuration requires exactly this direct connection:

- Project `uxecsfrnmlbugkuhjfeu`.
- Host `db.uxecsfrnmlbugkuhjfeu.supabase.co`, port 5432, database `postgres`.
- Native PostgreSQL 17 `psql` and `pg_dump`; server must also report major 17.
- TLS `verify-full` using an explicitly supplied trusted provider CA file.
- One exact scoped 0600 passfile entry, outside Git in a private 0700 directory.
- Operator-supplied native age public recipient, never a production private identity.

Pooler/transaction-mode endpoints, IP overrides, other projects, other database names,
connection URLs and wildcard credentials are refused. Direct networking may require
IPv6; IPv4-only/pooler support requires separate reviewed design. No DNS lookup or
TLS handshake against the actual project was performed here.

Identity validation is anchored to the allowlisted project hostname and verified TLS
certificate, plus the expected table contract and three migration ledger versions.
PostgreSQL does not expose an independently verified Supabase project ID through these
catalog checks. The owner must independently confirm the direct connection details
and CA in the official dashboard before the first authorized export.

The role must have complete SELECT access to all six application tables and BYPASSRLS
or superuser capability, otherwise the tool refuses possible filtered/incomplete data.
`pg_dump` does not use `--enable-row-security`. A dedicated SELECT-only role is preferred,
but BYPASSRLS is privileged and requires separate approval/provisioning. No role is
created here. If existing credentials have CRM mutation, command execution, role/database
management or superuser permissions, the manifest labels them **broad credentials**.
The tool is export-only; it does not make those credentials intrinsically read-only.
Inheritable/extension/provider capabilities need independent DBA review before genuine use.
Access to `supabase_migrations.schema_migrations` is also necessary; missing grants fail
closed and are not auto-corrected.

## Private credential boundary

Passwords are provided through a PostgreSQL passfile, not URLs/arguments/PGPASSWORD.
`prepare-passfile.mjs` accepts a file path and non-secret database username, and prompts
in the owner's personal TTY with echo disabled. It escapes colon/backslash correctly,
uses exclusive 0600 creation and never prints the password. Do not run this prompt
through Codex, chat, terminal recording or a shared screen. Production secrets have
not been requested, entered or read during development.

Passfiles must be owned, regular, non-symlink files with one exact connection entry.
CA files are likewise privately held. The production process uses an environment
allowlist rather than inheriting PGSERVICE, PGHOSTADDR, PGPASSWORD, caller PGOPTIONS or
application `.env.local`. PostgreSQL client executables and age must be trusted local
installations. Filesystem permissions do not protect against an attacker controlling
the same owner account or machine. Password strings may exist briefly in memory;
the tool does not promise RAM erasure or secure deletion on SSDs. Remove temporary
passfiles after operation and keep retained credentials in separately approved secure
storage. Never copy passfiles into backup archives/off-site manifests.

## Exact coverage

| Category | Coverage/recovery requirement |
|---|---|
| Application schema/data | `public.leads`, `follow_ups`, `activities`, `command_receipts`, `reminder_intents`, and `closevault_private.approved_owner`; full data/history/versions, primary/replacement links, receipts and reminder intents |
| Application definitions | Scoped dump retains columns, constraints/FKs, triggers, indexes, RLS, functions and object ACLs; `--no-owner` means provider role/object ownership must be reviewed separately |
| Migrations | Local original SQL SHA-256 values and observed remote version IDs recorded; the managed migration ledger itself is excluded from the application dump |
| Supabase Auth | Excluded: Auth users/identities/password hashes/MFA/sessions/service settings. Original owner UUID is a required foreign-key dependency |
| Storage | Managed bucket metadata, access policies and binary objects excluded; separate encrypted export and private-policy verification required when used |
| Globals/provider | Global roles/passwords/default privileges/extensions/provider settings excluded; compatible destination/bootstrap and grants require separate preflight |
| Deployment/environment | Git/runtime dependencies, hosted URLs/publishable keys, Auth redirects/signup/email settings and native reminder-device reconciliation are separate procedures |

Preflight enforces exactly six expected tables with RLS and SELECT access, and these
versions: `20261010202459`, `20261010202601`, `20261010202607`.
Local migration hashes are checked against the approved unchanged SQL files.
The source column-shape fingerprint and table/role/migration metadata are compared
again after extraction to detect observed catalog drift. This is not a shared catalog
snapshot or proof that hosted SQL content equals local files merely because IDs match.
`pg_dump` obtains its own consistent data snapshot; concurrent DDL should be excluded
operationally. Archive restoration supplies the actual schema/security comparison.

## Encryption, verification and provenance

Existing age v1.3.2 streaming, atomic no-overwrite publication, 0600 files and 0700
directories are reused. No persistent plaintext dump is written. New optional encrypted
metadata records project, recipient SHA-256 fingerprint, column-shape fingerprint and
ledger versions. An unsigned private manifest stores timestamps, scope, versions,
archive size/hash, ciphertext size/hash and explicit credential assessment.
Recipient fingerprints are over the exact supplied public-recipient string.

Test-adapter exports are marked `sourceKind: isolated-fixture` inside encrypted metadata
and their manifests, even though they simulate the approved hostname/project reference.
They must never be represented as genuine hosted backups.

The public recipient alone cannot decrypt. Therefore initial publication is explicitly
`encrypted-export-not-decryption-or-restore-verified`, NOT a verified recovery.
The owner must run `verify-export.mjs` privately with their own recovery identity to
authenticate every age chunk and verify full archive framing, metadata, size and hash.
This writes no plaintext dump, connects to no database and prints no private material.
It proves decryption/integrity only, not restore usability, source provenance or Auth recovery.

If failure occurs before a completed dump, the encrypted partial is removed and no
completed backup is published. A later catalog/manifest failure may leave an encrypted
orphan without a valid completed manifest: classify it as incomplete/unverified and
quarantine it; never infer success from a final-looking filename or create a replacement
manifest to certify it. Existing paths are never overwritten. Subprocess timeout is
120 seconds; larger real exports need separately reviewed sizing/timeouts. TOC validation
remains bounded to 1 MiB; there is no production scale guarantee from a tiny fixture.

Anyone with the public recipient can encrypt another archive. A replaceable local
checksum+manifest is not cryptographically authenticated provenance. Before production,
approve separately retained/signed integrity evidence, independent custody and restricted
immutable/versioned off-site storage. No signing key, account, upload or schedule is created.

## Auth continuity after complete project loss — proposal only

Preferred recovery: use a separately approved and supported Supabase Auth backup/import
procedure to preserve the original `auth.users.id` and identity associations, then restore
the application data/immutable registry into a fresh compatible target. Test owner login,
`getUser()`/`cv_owner_status()`, disabled public signup, negative JWT/RLS access and sessions
under the replacement issuer. Password hashes/session/MFA material require tightly
controlled encrypted handling; none is exported or accessed by this application-only tool.

If original identity recovery is impossible, stop. Creating a new user alone will not
repair owner-scoped FKs, the immutable registry or command request/receipt provenance.
Separately approve a destination-only audited recovery migration and mapping procedure,
retain original provenance, review every owner/user FK, receipt request/digest/result,
history association, recovery journal and reminder intent. Do not simply update owner IDs,
disable immutable triggers or silently rewrite receipts. Whether historic commands remain
replayable under a new owner requires explicit domain/security decisions and regression tests.
No automatic owner re-provisioning or Auth migration is implemented.

Provider restoration, original Auth UUID continuity, complete replacement-project recovery,
off-site/key custody and timed RPO/RTO remain acceptance gates. The Phase 7S-A retention
proposal (14 daily, 8 weekly, 12 monthly; RPO 24h, RTO 4h) is not configured or guaranteed.

## Operator procedure

See [the owner-operated runbook](PHASE_7S_B_OPERATOR_RUNBOOK.md). **Do not execute the
hosted command until separate hosted-access authorization is given.** The Mac currently
has age, but native PostgreSQL clients were not found on PATH or standard Homebrew paths.
No client package was installed in this phase. Approve/provision trusted PG17 clients
before first use. All automated database tests use existing isolated Docker clients.

## Validation

Measured local results:

- Encryption/export tests: 33/33 (8 preserved encryption tests, 25 export tests).
- Combined isolated backup/export/restore rehearsal: 17/17 checks, including actual
  TLS/SCRAM, backend connection termination, interrupted dump invocation, simulated
  partial-stream rejection, fresh-destination restore, full data/schema comparisons,
  restored RLS/access denial, owner RPC and receipt replay.
- Application Jest: 303/303 across 21 suites; independent HTTP/JWT: 77/77.
- Foundation pgTAP: 1,431/1,431; owner-status pgTAP: 18/18.
- TypeScript, application ESLint, backup-module ESLint, Node syntax checks and Git
  whitespace checks passed. No source, dependency or migration changes were required.

Final successful rehearsal evidence is outside Git at
`/var/folders/mp/jdc01yj13jx89kgth23zlw6h0000gn/T/closevault-backup-48d08dfea6a8-OLhQbF/report.json`.
Its export fixture is explicitly tagged `isolated-fixture`, 55,896 encrypted bytes,
SHA-256 `523b95bdbb712b5cf2ca4df66f404f822ce2533ef9394c409754bf78dae00254`.
The report confirms owned-resource removal; only two encrypted artifacts, the unsigned
export manifest and safe report remain (0600 files in a 0700 directory). Disposable
identities, passfiles and TLS fixture keys were removed. Earlier incomplete rehearsal
invocations are not counted as successful backups; the final run completed successfully.
No hosted Supabase operation, production credential use, commit or push occurred.

Public Supabase changelog review identified the PostgreSQL 17.11 minor-release changes
for ltree, legacy pgcrypto PGP ciphers, btree_gist and custom selectivity operators.
The three CloseVault migrations do not introduce these objects; hosted extension/operator
inventory was not inspected. Use current trusted PG17 clients and separately verify
17.11/provider restore compatibility; the cached 17.6 image is an isolated fixture only.
No database/client upgrades were performed.

Only local fictional TLS export and application restore can be proven in this phase.
No genuine hosted backup or complete disaster recovery is claimed.

## References

- [PostgreSQL 17 password files](https://www.postgresql.org/docs/17/libpq-pgpass.html)
- [PostgreSQL 17 TLS verification](https://www.postgresql.org/docs/17/libpq-ssl.html)
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Official age](https://github.com/FiloSottile/age)
- [Supabase PostgreSQL 17.11 changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
