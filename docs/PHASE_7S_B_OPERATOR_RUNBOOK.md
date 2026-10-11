# First hosted export: owner-operated runbook (NOT authorized to execute yet)

This procedure is prepared for separate review/authorization. Codex has not connected
to hosted Supabase, generated a production key or received any production password.
Use your personal Terminal, not a recorded/shared Codex terminal, for secret entry.

## 1. Prerequisites and independent source confirmation

After explicit hosted-access approval, open your Supabase dashboard yourself. Select
**Close Vault**, reference `uxecsfrnmlbugkuhjfeu`, then **Connect → Direct connection**.
Confirm host `db.uxecsfrnmlbugkuhjfeu.supabase.co`, port 5432 and database `postgres`.
Obtain the official trusted server CA/certificate guidance from the dashboard/docs.
Do not copy a password-containing URL into chat, terminal history or project files.
If direct IPv6 is unavailable, stop: this runner does not support poolers/IP overrides.
Do not downgrade TLS verification to make a connection work.

Use an already-approved complete-read role. Dedicated SELECT-only/BYPASSRLS credentials
need separately authorized role/grant provisioning; the script will not create them.
Existing `postgres` credentials may be broad and will be labeled accordingly.
Require SELECT on the six application tables and the migration ledger, with RLS-complete
access. Native PG17 `psql`/`pg_dump` must be installed and trusted; they are currently
missing on this Mac. Installing them is a separate prerequisite, not performed here.

```sh
age --version
age-keygen --help
/absolute/trusted/pg17/bin/psql --version
/absolute/trusted/pg17/bin/pg_dump --version
```

## 2. Prepare private directories and your recovery key

### Owner-operated PostgreSQL 17 installation (not executed by Codex)

First restore ample disk headroom. Review the official
[Homebrew PostgreSQL 17 formula](https://formulae.brew.sh/formula/postgresql@17).
After separately approving its package/dependency and default-cluster creation effects:

```sh
HOMEBREW_NO_AUTO_UPDATE=1 brew install postgresql@17
PG17_BIN="$(brew --prefix postgresql@17)/bin"
"$PG17_BIN/psql" --version
"$PG17_BIN/pg_dump" --version
"$PG17_BIN/pg_restore" --version
```

All must report PostgreSQL 17.x; record the exact patch version. Set `clientBin` to
the printed absolute directory, not a generic PATH lookup. Do not start a local database
service (`brew services start`) for this export. The formula is keg-only and includes
server binaries/default cluster initialization; it is not a zero-system-change client
install. No installation was performed in the finalization sprint.

### Connection support boundary

The runner currently supports **only** `db.uxecsfrnmlbugkuhjfeu.supabase.co:5432`,
database `postgres`, an exact reviewed login matching its private one-line passfile,
official trusted CA and `sslmode=verify-full`; it independently checks PG17, complete
read access, RLS and expected migration versions. Native read-only session settings
are mandatory. Locally configured IPv6 addresses/default routes were observed, but no
hosted reachability probe was made.

[Supabase's documented session-pooler option](https://supabase.com/docs/guides/database/connecting-to-postgres)
uses IPv4-capable shared pooler port 5432 and a project-qualified username, for example
`postgres.uxecsfrnmlbugkuhjfeu` for the postgres login. Obtain the **exact** endpoint and
role-routing support from this project's dashboard; do not derive them from its region.
Session-pooler exports are **not supported or live-verified by this runner**. Supporting
one requires separately reviewed endpoint pinning, exact project-qualified role/passfile,
trusted TLS hostname verification and complete read-only dump tests. No automatic fallback,
wildcard host, IP override, transaction pooler (6543) or reduced TLS is allowed. Prefer
the direct connection for pg_dump as recommended by Supabase.

Proposed paths below are not created by Codex. Choose approved independent/off-site
storage and key custody before relying on them for disaster recovery.

```sh
umask 077
mkdir -p /Users/joeljr/CloseVaultPrivateBackup /Users/joeljr/CloseVaultRecoveryKeys /Users/joeljr/CloseVaultBackups/hosted/first-export
chmod 700 /Users/joeljr/CloseVaultPrivateBackup /Users/joeljr/CloseVaultRecoveryKeys /Users/joeljr/CloseVaultBackups/hosted/first-export
age-keygen --output /Users/joeljr/CloseVaultRecoveryKeys/owner-age-identity.txt
chmod 600 /Users/joeljr/CloseVaultRecoveryKeys/owner-age-identity.txt
age-keygen -y /Users/joeljr/CloseVaultRecoveryKeys/owner-age-identity.txt
recipient="$(age-keygen -y /Users/joeljr/CloseVaultRecoveryKeys/owner-age-identity.txt)"
printf '%s' "$recipient" | shasum -a 256
```

The recipient command emits only the public key; its exact string without a trailing
newline is fingerprinted for comparison with the manifest. Keep the private file under your
personal control; do not paste/read/upload it into ChatGPT or Git. Independently secure
at least two owner-accessible recovery copies, separate from the encrypted backup's
storage and tested for decryption. No off-site destination has been configured.

## 3. Supply credentials privately

Save the official trusted CA as
`/Users/joeljr/CloseVaultPrivateBackup/provider-root.crt`, mode 0600.
Do not put it or a passfile inside the repository. Then privately run:

```sh
cd /Users/joeljr/Documents/CloseVault
node scripts/backup/prepare-passfile.mjs /Users/joeljr/CloseVaultPrivateBackup/closevault.pgpass cv_backup
```

Replace `cv_backup` with the exact approved database login if different, including
`postgres` only when explicitly approved. The prompt hides input, escapes the password
and writes one exact 0600 entry. No password is in arguments/history. Do not record or
share this terminal. This is a local operator action; never give the password to Codex.

## 4. Create external non-secret configuration

Use your editor to save mode 0600:
`/Users/joeljr/CloseVaultPrivateBackup/closevault-backup-config.json`.
Replace the public recipient/client directory placeholders and match the passfile username.
Never add a password, URL, service-role key, token or private identity to this JSON.

```json
{
  "project": "uxecsfrnmlbugkuhjfeu",
  "host": "db.uxecsfrnmlbugkuhjfeu.supabase.co",
  "port": 5432,
  "database": "postgres",
  "user": "cv_backup",
  "passfile": "/Users/joeljr/CloseVaultPrivateBackup/closevault.pgpass",
  "rootCertificate": "/Users/joeljr/CloseVaultPrivateBackup/provider-root.crt",
  "clientBin": "/absolute/trusted/pg17/bin",
  "recipient": "REPLACE_WITH_YOUR_PUBLIC_AGE_RECIPIENT",
  "output": "/Users/joeljr/CloseVaultBackups/hosted/first-export/closevault.age"
}
```

Use a new approved private output directory/filename for every export. Do not overwrite
previous artifacts. Independently confirm recipient fingerprint/key custody, source,
CA and absence of concurrent schema changes before proceeding.

## 5. Export — only after separate authorization

```sh
node scripts/backup/export-hosted.mjs --config /Users/joeljr/CloseVaultPrivateBackup/closevault-backup-config.json --confirm-export uxecsfrnmlbugkuhjfeu
```

No remote SQL mutation/role creation is performed. A private encrypted artifact and
`.manifest.json` are written. Exit 0 means completed encrypted extraction, **not**
decryption/restore/complete-DR verification. Record its checksum and manifest through
an independently protected channel; co-located unsigned checksums are not provenance.
On any failure, do not invent a manifest or certify an orphan/partial. Quarantine it
for review, retain last verified backups and use a fresh path for a deliberate retry.

## 6. Verify privately without connecting to a database

```sh
node scripts/backup/verify-export.mjs --manifest /Users/joeljr/CloseVaultBackups/hosted/first-export/closevault.age.manifest.json --identity /Users/joeljr/CloseVaultRecoveryKeys/owner-age-identity.txt
```

PASS authenticates decryption, complete archive framing, metadata and hashes. It does
not establish sender provenance or database restoration. Never pipe plain age output
straight into pg_restore: this archive has validated metadata framing before PGDMP.
Secure/remove temporary credentials through your approved private process. Removing
a file is not a guaranteed SSD wipe. No automatic upload or retention deletion occurs.

## 7. Restore acceptance — separate authorization required

The fictional rehearsal remains executable without any hosted access:

```sh
node --test scripts/backup/envelope.test.mjs scripts/backup/hosted-export.test.mjs
node scripts/backup/rehearse.mjs --export-interface-test
```

It is NOT a restore of your genuine export. Actual customer backup restoration needs
separate authorization for a new network-isolated disposable destination, trusted
provider roles/extensions, supported original Auth UUID dependencies, reviewed default
privileges and a controlled privately decrypted stream through the existing parser.
The current restore helper deliberately accepts only its owned rehearsal containers;
no general or production restore CLI is supplied. Do not bypass these guards.

Require full row/schema/security comparisons, FK/history/receipt/reminder preservation,
owner/nonowner/anonymous/direct-write/RPC tests, and failed-destination disposal before
labeling a real backup restore-verified. Original Auth/service settings, Storage binaries,
global/provider configuration, deployment environment and authenticated provenance are
outside this application dump and require separate recovery evidence.
