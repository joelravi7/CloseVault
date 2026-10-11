# Phase 6C: actual Expo hosted-auth preparation

## Source preservation and scope

Base: `1682f12c0cecf55f9358540a59402f688194127e`.
Checkpoint: `checkpoint/phase-6a-pre-phase-6c`.
Development branch: `codex/phase-6c-hosted-auth`.
Finalization authorizes one local commit after successful security and validation
gates; no GitHub push is authorized. Earlier checkpoints,
SQL, dependencies, CRM behavior and authentication production code are unchanged.

The owner supplied the project URL `https://uxecsfrnmlbugkuhjfeu.supabase.co`
and confirmed owner registration, disabled signup and no customer leads.
Those hosted administrative facts are owner-provided evidence, not remotely
queried or independently reverified during this task.

## Private local configuration

The prepared `/Users/joeljr/Documents/CloseVault/.env.local` is ignored by Git
and permission-restricted to mode 600. It was prepared with the approved URL, an
empty publishable-key field and `EXPO_PUBLIC_APP_ENV=development`. The owner then
populated the key privately; its modern-key format was checked without displaying
the value. No key was retrieved from the dashboard or written by Codex. To configure
another local environment, the owner must supply it privately:

1. Open the project's [API Keys dashboard](https://supabase.com/dashboard/project/uxecsfrnmlbugkuhjfeu/settings/api-keys).
2. Copy only the active modern **publishable** key beginning `sb_publishable_`.
3. Paste it after `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` in `.env.local` and save.
4. Never paste passwords, privileged keys or tokens into chat or this file.
5. Fully stop/restart Metro with `--clear` and reload the app after changing the
   environment; static exports and native builds require rebuilding to capture
   changed values. Use `npm run build:web -- --clear` for the web export.

The existing code uses direct `process.env.EXPO_PUBLIC_...` accesses, supported
by Expo environment inlining on web/iOS/Android. These public variables are
visible in client bundles; they are not a secret-storage mechanism. Only the
URL, publishable key and non-secret environment label belong there.

Do not commit `.env.local` or generated `dist`/`.expo` output. Missing/invalid
configuration blocks access; never use a fictional key to simulate real login.
Explicit demo mode remains `EXPO_PUBLIC_APP_ENV=demo` in development only.

## Existing actual application integration

- `src/data/supabase/auth-gateway.ts:createConfiguredAuth` validates HTTPS and a
  modern publishable key, creates the typed SDK client and selects platform storage.
- `createAuthGateway.signIn` calls `auth.signInWithPassword`; `verifyOwner` calls
  server `auth.getUser`, matches the verified identity and requires boolean
  `cv_owner_status()` authorization. No email/UUID whitelist is added.
- `src/domain/authentication.ts:AuthController` authorizes only after verification;
  epochs and terminal states reject stale results, with generic failure messages.
- `src/providers/auth-provider.tsx:AuthProvider` manages refresh for app lifecycle,
  restoration/remounts and expiry; clears the TanStack Query cache on access loss.
- `src/app/_layout.tsx:RootRoutes` protects the actual private workspace. Demo CRM
  providers/routes are absent from hosted authentication mode. The workspace is
  still a safe placeholder, with no customer-data forms or persistence adapter.
- Native sessions use chunked SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
  Web uses tab `sessionStorage`, not persistent `localStorage` or cookies.
- Sign-out hides private routes before awaiting cleanup/revocation. Failed cleanup
  remains fail-closed; a marker prevents restoration until explicit successful login.
- Password recovery remains disabled; no callback URL or Auth setting is changed.

The existing integration is reused without duplicating or rewriting it. Supabase
RLS remains the authoritative data boundary; route guards are a client UI boundary.
Logout revokes refresh sessions, not instant validity of already issued access JWTs.
`sessionStorage` is JS-accessible and not protection against XSS. A new tab opened
with an opener may initially inherit a copy; it is not guaranteed to start empty.

## Tests and actual-device acceptance

New `src/data/supabase/__tests__/hosted-auth-configuration.test.ts` adds 14
deterministic checks against the actual client factory: missing/unsafe values,
approved endpoint selection, native SecureStore wiring on both platforms, web
sessionStorage wiring, explicit-only demo mode and disabled recovery. SDK calls
are mocked and every key/session is fictional. These prove local wiring, not
successful hosted authentication or physical-device storage behavior.

The 160 original tests, including all 30 race regressions, remain unchanged.
They cover loading, incorrect credentials, owner verification failure, network
errors, restoration, refresh, expiry, sign-out, repeated operations, stale results,
route denial, remounts and private cache cleanup. Mock tests are not hosted evidence.

### Owner-operated web testing

After supplying the key and restarting Metro, open `http://localhost:8081`:

1. Confirm loading resolves to Sign in, not fictional CRM.
2. Enter the owner credentials personally in the application, never in chat.
3. A successful getUser/owner-status sequence must show **Authentication verified**
   and the placeholder. An Auth session alone must not unlock the workspace.
4. Refresh this tab: restoration must reverify before showing the workspace.
5. Sign out; rapidly repeat if possible, refresh and visit `/workspace` directly:
   private content must remain unavailable.
6. Test a wrong password without exposing credentials; only a generic error is expected.
7. Disable connectivity and attempt restoration/verification: private access must
   remain hidden. Re-enable connectivity and retry safely.
8. Use browser storage tools only personally. Do not share token values/screenshots.
   Confirm session storage rather than local storage, and cleanup on logout.

Do not create accounts, leads or test customer records. Interactive correct-owner
login, post-login refresh/logout and hosted token refresh require owner input.
Codex must not inspect a password field, capture auth tokens or simulate success.

### Physical iOS/Android testing

Use an existing compatible Expo SDK 57 development build. Run `npm run start --
--dev-client --lan` only when ready to expose the development server to your trusted
LAN. No tunnel is needed. Open that development build on the same trusted network.
Use the same private local configuration and enter credentials on the device.
Verify cold/warm restore, foreground/background refresh, sign-out/restart,
network loss and protected navigation on each physical platform. SecureStore
accessibility/chunk cleanup require real-device evidence. This task does not build
or install native apps, configure bundle/package identifiers or claim device tests.

## Execution results

- Jest: 174/174 passed across 14 suites (160 original + 14 targeted).
- TypeScript and ESLint passed.
- Metro started on loopback at `http://localhost:8081`; local HTTP returned 200,
  an HTML document and an Expo bundle reference. Metro was restarted after the
  private key was supplied so the new configuration is loaded.
- After restart, both the served HTML and JavaScript bundle returned HTTP 200.
  The actual running web bundle contains the approved URL and configured key,
  verified with boolean-only output. This is configuration evidence, not a
  rendered UI or successful Auth request.
- The web static export passed. Generated output is ignored, not committed.
- A separate bundled-value check found stale empty-key output after the first
  environment change/rebuild. `npm run build:web -- --clear` passed; the resulting
  JavaScript contains both the approved endpoint and the privately entered
  publishable key (checked in memory with boolean results only). No values were
  printed. Mere export success does not prove configuration was included.
- Browser automation inventory was empty; an in-app-browser automation attempt
  was unavailable. The Codex browser-panel opening was queued, not proof of a
  rendered sign-in screen. Subsequent owner-operated results are recorded below;
  automated browser observation and extended token-refresh testing are not claimed.
- The local endpoint and modern publishable-key format are verified. Successful
  hosted login and restoration are owner-confirmed below, not repeated by Codex.
- Git whitespace and pending-file credential checks passed. The actual local key
  does not occur in pending source/documentation; `.env.local`, `.expo` and `dist`
  are ignored. Preparation ended with one modified README and two new
  documentation/test files, nothing staged; HEAD was the approved base and
  checkpoints were unchanged.

An initial Metro invocation combining `--offline` and `--localhost` was rejected
by Expo before startup; the corrected localhost invocation succeeded. No package,
configuration or application-code workaround was needed. Build output contained
nonblocking terminal color-environment warnings.
Metro also reports newer Expo/dependency versions; no upgrade or installation
was performed in this task.

## Final security review and supplied hosted evidence — October 11, 2026

### Owner-confirmed manual web results

- Real owner login: PASS.
- Browser refresh and session restoration: PASS.
- Sign out and protected-route handling: PASS.

These results were supplied directly by the owner. Codex did not enter automated
credentials, capture passwords/tokens or repeat the real login. Additional
negative-password/network, prolonged refresh/expiry and multi-tab acceptance
scenarios are not implied by these three confirmed results.

### Independently verified hosted checks, reported by the owner from ChatGPT

- One confirmed Auth user and one correctly registered owner.
- Successful sign-in recorded.
- All five CRM tables retain RLS.
- Anonymous CRM access and direct authenticated table writes denied.
- Anonymous execution of CloseVault business RPCs denied.
- No customer records exist.

This is independently supplied hosted evidence. Codex did not query the hosted
project or inspect raw query results in this final review. It is not represented
as a newly executed Codex integration suite. Full hosted negative HTTP/JWT and
authorization tests remain recommended before enabling any CRM writes.

### Local source-level review

The 14 added tests exercise the existing actual configuration factory while
mocking SDK construction: nine unsafe/missing-input cases assert no SDK creation;
two native-platform cases assert endpoint/key selection, session options and
SecureStore accessibility; one web case exercises sessionStorage read/write/remove
without localStorage/native writes; the final two verify explicit-only demo mode
and disabled recovery. Their limitations remain stated above; they do not prove
physical keychain behavior or server authorization.

Server `getUser()` plus `cv_owner_status()` remain mandatory. No owner email/UUID
whitelist, demo fallback, password logging, password persistence outside the
normal in-memory login request, recovery enablement or CRM persistence was added.
The form clears password state on submission; controller render state excludes
passwords and tokens. Existing gateway generations, serialization and controller
epochs still protect races. Private routes are hidden and query caches cleared
on access loss. Web sessionStorage and native SecureStore remain unchanged.

Final local gates rerun on October 11, 2026:

- Jest: 174/174 tests and 14/14 suites passed; all 160 original tests and 30 race
  regressions preserved. No test weakened, skipped or altered for finalization.
- TypeScript, ESLint and Git/file whitespace checks passed.
- Web export passed; approved URL and configured publishable key were verified
  in generated JavaScript with values withheld. Generated output stays ignored.
- Credential-pattern and actual configured-key leak review passed across 115
  tracked/pending files. Only clearly fictional negative-test API-key strings
  occur in tests. No production key is in source/documentation; `.env.local`
  remains ignored, mode 600, with only the three approved public variables.
- No production authentication, application behavior, dependency, SQL or prior
  test changes. Review found no new blocking defect in this commit scope.

Approved commit scope is exactly `README.md`, this report and
`src/data/supabase/__tests__/hosted-auth-configuration.test.ts`.
Local commit message: `feat(auth): complete hosted owner login verification`.
No hosted operation or automated owner login was performed in finalization.

## Remaining release boundaries

No remote CLI database command, SQL deployment, owner-registry change, account
creation, signup change, customer-data operation or recovery setup is performed.
The free-plan leaked-password-protection setting remains unavailable, as reported
for this project. No compensating hosted setting was changed. Hosted negative
authorization testing remains recommended before CRM writes. Native physical-
device verification, approved password-recovery redirects and acceptance tests,
and tested production backup/restoration procedures remain pending. SessionStorage
XSS exposure and already-issued access JWT validity after logout remain explicit
security boundaries, not new fixes in this phase.

Real customer-data entry is NOT authorized. CRM persistence, LEAD-LOST-001,
multi-stop SITE-VISIT-001 and durable reminder reconciliation remain separately
authorized release work. No Phase 7 work begins with this commit.

References: [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native),
[Expo environment variables](https://docs.expo.dev/guides/environment-variables/),
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
