# Phase 7S-A: encrypted local database restore rehearsal

## Authorization and scope

Base: `ec797e57002816b7e100d6fb2f716cad71d18236`.
Checkpoint: `checkpoint/phase-7a-r-pre-backup` at that exact commit.
Branch: `codex/phase-7s-a-backup-restore`.
Implementation is pending owner review; no commit/push/deployment is authorized.
No hosted connection, real customer data, production credentials, Auth changes,
owner provisioning or hosted write enablement is performed by these tools.

## Tools and repeatable local operation

```sh
node --test scripts/backup/envelope.test.mjs
node scripts/backup/rehearse.mjs
```

The rehearsal accepts **no arguments or database URLs**. It creates two new owned
PostgreSQL containers on a random `--internal` Docker network. There are no published
ports, host-directory mounts or Docker-socket mounts. PostgreSQL data is tmpfs.
Every operation verifies names, labels, mounts, ports, network ownership and internal
isolation. Cleanup verifies and removes only resources created by that run.
Existing Supabase CLI databases, saved tokens and `.env.local` are never used.

The cached image is `public.ecr.aws/supabase/postgres:17.6.1.167` (PostgreSQL 17).
No automatic image pull occurs. Host `pg_dump` is not installed; Docker supplies
official PostgreSQL 17 clients. Owner-approved Homebrew installation added only
official `age` 1.3.2 using `HOMEBREW_NO_AUTO_UPDATE=1 brew install age`.
`age --version` reports `v1.3.2`; `age-keygen` is available. No sudo, unrelated
upgrades or project dependency changes occurred. Hosted PostgreSQL 17.11 compatibility remains
a hosted acceptance gate: same major version is necessary, not a complete proof.

The source gets all three existing, unchanged migrations. Existing pgTAP suites run
before the committed fictional fixture is created. Commands create two leads,
initial inquiry/history, initial follow-ups, an edit, and FU-CANCEL-001 cancellation
with exactly one replacement. Synthetic Auth UUIDs exist only in these containers.

Extraction uses a synthetic `cv_backup` login with BYPASSRLS to permit a complete
owner-data read, SELECT-only CRM/registry grants and read-only default transactions.
It is not a superuser and has no CRM mutation-command grants. Loopback is explicitly
SCRAM authenticated; an incorrect disposable password must be rejected. Passwords
travel over process stdin; none appear in command arguments or logs. PGPASSWORD is
short-lived in the isolated dump process environment, not a persisted configuration.
This is a test-only mechanism, not a production credential entry interface.

For a future hosted extraction, separately approve an explicitly supplied dedicated
read-only password-authenticated connection, direct endpoint/SSL verification and a
private 0600 passfile or interactive secret mechanism. Review the need for BYPASSRLS
and least-privilege SELECT on each covered object. Never use the Supabase CLI's
token-based automatic temporary-role creation. Remote input support is intentionally
absent now; do not weaken the Docker-only capability boundary to use these scripts
against a hosted target.

## Database coverage

The custom-format `pg_dump` selects only `public` and `closevault_private`:

| Component | Recovery source |
|---|---|
| `leads`, `follow_ups`, `activities` | Encrypted dump data; includes versions, timestamps, complete recorded history and primary/replacement links |
| `command_receipts` | Encrypted dump; exact private request/result and idempotency keys must be retained |
| `reminder_intents` | Encrypted dump; schedule/cancel intent and record/command links |
| `closevault_private.approved_owner` | Encrypted dump; immutable owner UUID association |
| Tables, column definitions, constraints, triggers, indexes, RLS, functions and ACLs | Scoped custom dump plus version-controlled migrations as independently reviewed definitions |
| Original migration SQL/version IDs | Git; ordered filenames and SHA-256 hashes are recorded in encrypted metadata |
| Hosted migration ledger | Not exported by this scope; independently reconcile/verify when a replacement project is authorized |
| Auth users, identities, passwords, sessions, MFA and Auth configuration | **Excluded**; separate supported identity/service recovery required |
| Global roles, role passwords, extensions and managed schemas | **Excluded**; compatible trusted destination/bootstrap required |
| Storage bucket metadata and binary objects | **Excluded**; no Storage recovery claimed |

Raw scoped `pg_dump` is not equivalent to Supabase CLI `db dump`. Selecting schemas
does not automatically capture external dependencies; a whole-cluster dump is not
a safe replacement-project recipe. The small Auth scaffold in the rehearsal only
models `auth.users(id)` and `auth.uid()` dependencies; it does not restore a working
GoTrue service, credentials or real HTTP/JWT sessions. Existing independent HTTP
integration coverage must not be described as HTTP Auth recovery from this backup.

No changes are made to the three applied SQL migrations or application business logic.
Schema restoration cannot rely on migrating over an already populated target.
The restore tool accepts only the other owned, empty container. It never uses clean,
drop, reset, disable-triggers or session_replication_role as a recovery fallback.

The rehearsal discovered that Supabase image default grants can add anonymous
execution/read and authenticated direct writes during restore, even while the
archive contains the correct application ACLs. The empty owned restore context
therefore neutralizes global/public default grants for `supabase_admin` before
pg_restore. Explicit archive ACLs then restore the exact source privileges.
No source defaults or hosted defaults are changed. This destination preparation
is mandatory, not a post-hoc waiver of failed security checks; hosted defaults and
restore-role ownership require independent preflight before genuine recovery.

`pg_restore --single-transaction --exit-on-error --no-owner` restores the archive
into a fresh compatible privileged restore context. PostgreSQL orders data before
post-data foreign keys/triggers, avoiding partial manual restoration of the circular
lead/primary-follow-up relationship. The archive TOC skips only CREATE SCHEMA public
because initdb already supplied that empty schema; public ACL/comments remain.
Supabase-managed roles must already exist. Full replacement-project object ownership
and managed default privileges require separate review; `--no-owner` does not prove
that every provider-specific ownership dependency is portable.

## Encryption, integrity and completion status

The active format is official binary `age-encryption.org/v1`, created by the age CLI.
Custom RSA/OAEP/AES-GCM keys, encryption code, JSON ciphertext envelope and full-archive
base64 serialization are removed. SHA-256 remains only for integrity comparisons.
Encrypted plaintext contains `CVPGAGE1`, a four-byte metadata length, strict JSON
metadata, then the PostgreSQL custom archive. Metadata includes scope, creation time,
tool versions and migration hashes; private keys/customer records are never in reports.

Generate a disposable native X25519 identity with `age-keygen --output <private-file>`;
derive its public recipient with `age-keygen -y <private-file>`. Generation stderr is
suppressed. The identity is 0600 in a private 0700 directory outside Git. No permanent
identity, plugin, passphrase or custom cryptographic fallback is used.

`pg_dump` stdout streams through archive magic/hash checks into age stdin; age stdout
streams into an exclusive encrypted partial file with backpressure. No full plaintext
archive is buffered or written to disk. Restore first decrypts the whole artifact to
a discard sink, checking age exit status, metadata, archive magic/size/hash and ciphertext
size/hash. After that preflight, a second streamed pass builds the bounded TOC and a
third feeds `pg_restore`. Source/subprocess failures and premature EOF prevent success.
Safe argument arrays are used; the fixed Docker password-reading shell has no
interpolated credentials. Metadata is bounded to 64 KiB, TOC output to 1 MiB, and archive
stream buffers do not grow with database size. Fixture row comparisons are separate
small-data tests, not a scalable whole-database verification implementation.

RAM copies/process inspection are not guaranteed erased or hardware isolated.
Encryption does **not** establish sender provenance: anyone possessing the public
recipient can encrypt a replacement archive. A checksum beside a replaceable backup
is not authenticity. Production needs separately authenticated/signed manifest hashes,
restricted write access, immutable/versioned off-site copies and auditable custody.
Never accept replacement metadata solely because decryption succeeds.

Decryption must complete the full authentication pass before pg_restore receives data.
Only trusted backups should ever be restored: PostgreSQL archives execute SQL.

Artifacts go to a private 0700 OS temporary directory outside the repository. Files
are 0600. A unique exclusive `.partial` file is synced and atomically hard-linked to
the completed name without overwriting an existing backup. The directory is synced,
and partial files are removed on ordinary failure. Crash leftovers are incomplete
encrypted files, not completed backups; inspect ownership before removing them.
Completion status starts `encrypted-not-restore-verified` and becomes
`local-fictional-restore-verified` only after actual data/schema/security/RPC checks.
The separate final report records cleanup; failed cleanup is an overall failed run.

Only a disposable test identity is generated. Its 0600 age identity file is deleted on normal
completion/failure. The retained encrypted fictional artifact cannot be decrypted
again after identity disposal; it is evidence of the run, not a long-term usable
backup. Abrupt process termination can leave an identity file and owned containers;
follow the report/run label, do not blanket-delete Docker resources or directories.
OS temporary storage is not disaster recovery storage or an off-site destination.

## Verification and failure handling

Source/target comparisons use ordered JSON SHA-256 for all six covered tables,
including UUIDs, customer-like fictional fields, timestamps, versions and receipts.
Schema fingerprints compare columns, schema ownership/ACLs, constraints, indexes, triggers, policies, function
definitions and semantically ordered ACLs (grant ordering itself is not a privilege).
Counts alone are insufficient. Restore must preserve FK validity and owner identity.
RLS tests use actual `authenticated` and `anon` SQL roles with synthetic claims:
owner reads, other user sees no rows, anonymous reads/commands fail, direct writes
stay denied, registry cannot be replaced, and create/edit receipt retries cause no
row/version/history change. A new owner RPC must work after restore.

Corrupted/truncated ciphertext and wrong/missing identities fail before pg_restore.
Missing Auth UUIDs cause restore failure and rollback to an empty target, followed by
removal of the failed destination. Successful recovery uses a newly provisioned target;
failed restore destinations are not reused or published.
A populated target is rejected before restoration. Output withholds raw SQL/errors,
credentials, archive contents and customer-like fixture details; reports contain
only safe metadata, counts, hashes, privileges and verification labels.

## Auth and platform recovery gaps

Real recovery requires approved, supported preservation of the original Auth user
UUID and associated identity records. Creating a replacement user with a new UUID
does not repair CRM ownership, receipts or immutable registry associations. Never
silently rewrite owner IDs or bypass immutable-owner protections. Supported Auth
migration/export, password/session treatment, MFA and reauthentication must be
reviewed separately with the owner and Supabase documentation. No real password
hashes, session material or owner credentials were exported here.

On a replacement project verify region/PostgreSQL/extension compatibility, safe
privileged object ownership, roles and complete RLS/grants, migration ledger and SQL
hashes, disabled public signup, approved owner status, email confirmation/recovery
settings and redirects, project URL/publishable keys, secure application environment,
JWT issuer/session changes, and negative HTTP/JWT access checks. Project keys and
service configuration are not restored by this scoped archive. Rotate secrets
through private configuration; never copy privileged keys into the Expo client.
Device reminder reconciliation must not blindly duplicate restored intent delivery.
Any future Storage needs separate private bucket policies/object backups and a
signed-access test; database rows alone do not recover binary objects.

## Proposed retention and off-site policy — not configured

- Daily encrypted backups: keep 14 daily, 8 weekly and 12 monthly copies.
- RPO proposal: 24 hours; reassess if a day of lead updates is unacceptable.
- RTO proposal: 4 hours after authorized access and compatible replacement capacity
  are available; this local rehearsal does not establish hosted RTO.
- Keep at least one encrypted copy on independent storage/off-site under separately
  approved access. No external destination has been accessed, created or configured.
- Custody: encryption recipient may accompany the backup tool; private recovery
  identity must be separately safeguarded with a tested owner-accessible recovery
  copy. Losing the key makes otherwise intact backups unrecoverable.
- Verify every export's ciphertext hash and authenticated decryption/archive listing;
  alert on missing/late backups, wrong scope, version drift, failure or incomplete
  verification. Do not label dump success alone as recoverability.
- Monthly isolated restore, and after migrations/client-tool/provider changes;
  quarterly timed replacement-project rehearsal after separate authorization.
- Never auto-delete the last verified backup; retention deletion and automated
  scheduling require separate approval. No automation or uploads were created.

## Validation results

Historical initial custom-envelope rehearsal: `closevault-backup-6842c185d0a8`,
verified locally on 2026-10-11. Its encrypted artifact remains untouched, but its
format is no longer produced or accepted by the active tooling.
Current age rehearsal results are recorded below.

### Historical initial artifact
Private artifact directory:
`/var/folders/mp/jdc01yj13jx89kgth23zlw6h0000gn/T/closevault-backup-6842c185d0a8-HQ6sJx/`.

- `fictional.cvbackup`: 99,053 bytes, mode 0600; SHA-256
  `8daa27706e6120304a11cf5e01912a19e723ef4b5d7d1a94435ee43861955a25`.
- `report.json`: 52,019 bytes, mode 0600; directory mode 0700.
- Disposable private identity removed; both owned containers and internal network
  removed. No plaintext archive or partial file remains in the artifact directory.
- Restored counts before subsequent RPC checks: leads 2, follow-ups 3, activities 6,
  command receipts 4, reminder intents 4, approved owner 1. Every ordered row hash
  and the full schema/security fingerprint matched; UUIDs, versions and timestamps
  were unchanged. A subsequent fresh create RPC added one new fictional lead.
- All 12 rehearsal checks passed, including actual single-transaction rollback on
  missing Auth dependencies, wrong-password rejection, corrupt/wrong-key rejection,
  restored authorization and idempotency, and populated-target refusal.
- Historical Node envelope suite: 6/6 passed. Existing Jest: 303/303 across 21 suites passed.
- Existing isolated HTTP/JWT suite: 77/77 passed; foundation pgTAP 1,431/1,431 and
  owner-status pgTAP 18/18 passed. These SQL suites also passed within the backup
  rehearsal. HTTP/JWT tests ran independently, not against restored Auth credentials.
- TypeScript, Expo ESLint, explicit ESLint on all new backup scripts, Node syntax
  checks and whitespace checks passed. No dependencies, migrations or application
  behavior changed. Credential review found no private keys or credentials in the
  changed files; generated identities and archives remain outside Git.

Earlier failed rehearsals exposed public-schema duplication, ineffective loopback
password checking under image defaults, and extra destination default grants.
Those issues were corrected in the local tooling and retested; failed artifacts
remain explicitly failed, never promoted to valid backups. The final successful
run uses PostgreSQL/pg_dump/pg_restore 17.6 and Node v24.21.0.

### Age hardening validation

- Official age CLI: v1.3.2; all backup paths require it, with no cryptographic fallback.
- Updated Node encryption/streaming suite: 8/8 passed, including source subprocess
  failure, preflight cancellation, slow-sink backpressure, truncation, wrong/missing
  identities, corruption, compatibility, hashes and safe artifact destinations.
- Jest: 303/303 across 21 suites; an existing React `act(...)` warning remains in
  the lead-screen tests, without failed assertions. No application tests were changed.
- Isolated HTTP/JWT: 77/77; foundation pgTAP: 1,431/1,431; owner-status: 18/18.
  SQL suites also run in the age rehearsal. Independent HTTP tests are not restored Auth tests.
- TypeScript, Expo ESLint, direct backup-script ESLint, syntax and whitespace checks passed.
- An initial streaming test exposed a file-stream completion hang. It was corrected
  with a backpressure-aware file-handle sink. The exact owned interrupted-test encrypted
  partial and disposable identity were removed; subsequent tests clean up successfully.
- No plaintext database archives survive. Retained run directories contain only
  encrypted backups and safe reports; disposable age identities are removed.

Final age run: `closevault-backup-a81aa9ffe59a`, 2026-10-11 Asia/Colombo.
Directory: `/var/folders/mp/jdc01yj13jx89kgth23zlw6h0000gn/T/closevault-backup-a81aa9ffe59a-zBARUF/`.

- `fictional.cvbackup.age`: 55,573 bytes, mode 0600; SHA-256
  `1dcacd67bdb87f9e23ac61badb253e28d24d5eb0b0f1d56046bc3bb85402e178`.
- Archive: 54,832 bytes; SHA-256
  `b32f3d0828011ef7e57e6eb506f14fd876fdd57308228c1acff99678e776311b`.
- `report.json`: 52,920 bytes, mode 0600; directory mode 0700.
- All 12 restore checks passed. Restored counts: 2 leads, 3 follow-ups, 6 activities,
  4 receipts, 4 reminder intents and 1 approved owner. Complete ordered row and
  schema/security hashes matched, including UUIDs, timestamps, versions and links.
- Wrong/missing age identities and corrupt/truncated archives were rejected.
  Missing Auth dependencies rolled back all CRM DDL/data and the failed destination
  was removed; the successful target was newly provisioned. Populated targets were refused.
- Source and restore containers/internal network removed; all disposable identities
  removed; no age-test directory or plaintext archive remains. Retained encrypted
  artifacts cannot be reused after intentional identity disposal.
- Source control remains at `ec797e57002816b7e100d6fb2f716cad71d18236`, with 2 modified
  tracked files and 5 untracked files. Nothing staged, committed, pushed or deployed.

The small encrypted framing is not a replacement encryption format: age is the only
encryption/decryption implementation. Plain `age --decrypt` yields the framing and
archive, so do not pipe it directly into pg_restore; use the validated parser/preflight
in these local-only scripts. Independently review the workflow and separately protected
manifest/key recovery before introducing genuine hosted backups.

## References and remaining hosted gates

- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
- [PostgreSQL 17 pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
- [Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Official age documentation](https://github.com/FiloSottile/age)

Only a **local fictional CRM backup restored successfully** can be accepted here.
Hosted extraction, supported real Auth continuity, encrypted off-site copy/key recovery,
PostgreSQL 17.11/provider compatibility, replacement-project ownership/configuration,
native reminder reconciliation and timed full disaster recovery remain unproven.
No hosted backup or complete disaster recovery is claimed.
