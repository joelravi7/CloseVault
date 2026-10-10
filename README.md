# CloseVault

> Your private lead-to-commission command centre.

CloseVault is a private, single-owner real-estate lead manager for capturing conversations, planning follow-ups, recommending apartments, tracking sales activity, and calculating personal commission. It is intentionally not a company or team CRM.

## Current status

This repository contains the **fictional-data demo**, a locally tested database
foundation, and a local Phase 5A authentication foundation. No hosted
database deployment or hosted authentication verification is claimed. See
[Phase 5A authentication](docs/PHASE_5A_AUTHENTICATION.md) for current boundaries,
verification results and required approvals.

Phase 5B adds a disposable, internal-network Auth/PostgREST HTTP/JWT test harness.
See [local integration testing](docs/PHASE_5B_AUTH_INTEGRATION.md) for reproduction,
security boundaries and evidence. It does not connect to hosted Supabase or
establish production readiness.

Authentication mode fails closed when configuration or owner verification is
unavailable. A verified owner currently sees a placeholder workspace, not demo
CRM records. The persistence adapter is a later vertical slice.

Demo-ready flows:

- Responsive Today command centre
- Searchable lead list and detailed lead profile
- Fast lead capture with Zod validation and duplicate detection
- Activity logging with timeline updates and a required next action
- Follow-up scheduling with lead and calendar updates
- Mobile/desktop pipeline and calendar agenda
- Rule-based apartment recommendations
- Reconciled payment-plan calculator
- Commission, phone, scoring, template, duplicate, and ranking business rules

The More screen labels backend-dependent workflows as “Next phase”; those controls are intentionally disabled rather than pretending to work. See `docs/FEATURE_STATUS.md` for the exact implemented, partial, and pending feature inventory.

## Technology

- Expo SDK 57, React Native 0.86, React 19, Expo Router
- TypeScript strict mode
- React Hook Form and Zod
- TanStack Query boundary for future server state
- Jest and Jest Expo
- Supabase client packages prepared for the connected phase

## Prerequisites

- Node.js 22.13 or newer. Node 22 LTS is recommended for predictable tooling.
- npm 10 or newer
- Expo Go for quick device preview, or an Expo development build for native APIs
- Xcode for the iOS simulator and Android Studio for an Android emulator

## Local demo setup

```bash
git clone https://github.com/joelravi7/CloseVault.git
cd CloseVault
npm install
cp .env.example .env
npm run start
```

For the fictional demo, explicitly set `EXPO_PUBLIC_APP_ENV=demo` in your local
environment and use a development build. No Supabase values are required for
that mode. Release builds ignore the demo label. The default `development`
label selects authentication mode; missing configuration blocks access.

Run a specific platform:

```bash
npm run web
npm run ios
npm run android
```

## Quality commands

```bash
npm run typecheck
npm run lint
npm test
npm run build:web
```

## Environment variables

Copy `.env.example` to a local ignored `.env` when configuring a selected mode:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_APP_ENV=development
```

Only the project URL and client-safe publishable key belong in Expo. Never put a service-role key, database password, private API key, OpenAI key, EAS token, or production export in the client environment.

Use EAS environment variables for preview and production instead of committed `.env` files.

Phase 5A adds no new environment-variable names. Authentication requires a valid
HTTPS URL and a client-safe `sb_publishable_...` key; privileged and legacy secret
keys are rejected. Do not launch configured authentication mode against hosted
Supabase until remote testing is separately approved. Password recovery remains
disabled until the owner approves final HTTPS/native redirects and remote Auth
settings. No signup UI is provided.

The additional local-only migration
`supabase/migrations/20261010181858_owner_status.sql` exposes an authenticated
boolean owner-status RPC, not the private owner registry. Its isolated tests are
`supabase/tests/owner-status.test.sql`. It has not been deployed. Apply only after
separate review/authorization using the safe isolated procedure documented in
the Phase 5A report; do not use the older all-interface CLI startup.

## Supabase setup — next milestone

Phase 4A adds local-only draft migrations and SQL tests. They are **not deployed**,
and the fictional demo still uses in-memory state. Authentication mode never
uses that provider. See
[Phase 4A foundation](docs/PHASE_4A_DATABASE_FOUNDATION.md) for implemented scope,
unexecuted database checks and required approvals. Do not run the remote setup
commands below as part of Phase 4A.

Phase 4B verifies these drafts in a disposable local database only. See
[local database verification](docs/PHASE_4B_DATABASE_VERIFICATION.md) for target
guards, test commands, security limitations and safe shutdown instructions.

The database will be connected after the demo has been reviewed and corrected.

1. Create a Supabase project in the appropriate region.
2. In Authentication settings, disable public email sign-up.
3. Create the single owner manually in the Supabase dashboard.
4. Install and authenticate the Supabase CLI:

   ```bash
   npm install --global supabase
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

5. Review every migration and policy locally before applying it:

   ```bash
   supabase start
   supabase db reset
   supabase test db
   supabase db push
   ```

6. Add the project URL and publishable key to the appropriate EAS environment.

The connected milestone must verify owner-only select, insert, update, and delete policies with three actors: the owner, a different authenticated user, and an anonymous user. A private Storage bucket will be used for documents.

## Owner account and public sign-up

There is no registration route in the product. Create the owner through Supabase Dashboard → Authentication → Users. Disable “Allow new users to sign up” before exposing any connected build. Password recovery will remain an owner-controlled flow.

## Expo development builds

Native biometrics, notifications, and production-like configuration should be tested in a development build, not assumed from web or simulator behavior:

```bash
npm install --global eas-cli
eas login
eas build:configure
eas build --profile development --platform ios
eas build --profile development --platform android
npx expo start --dev-client
```

## Biometrics and notifications

These are not active in the fictional demo. During the connected milestone:

- Test Face ID/Touch ID/Android biometrics on supported physical devices.
- Keep Supabase Auth as the primary gate; biometrics only unlock an existing local session.
- Request notification permission in context.
- Schedule, reschedule, and cancel local reminders with follow-up lifecycle changes.
- Keep sensitive strategy and conversation details off lock-screen notification content.

## EAS builds

The repository includes development, preview, and production profiles in `eas.json`.

```bash
eas build --profile preview --platform all
eas build --profile production --platform ios
eas build --profile production --platform android
```

Production builds require Apple Developer and Google Play Console credentials. Web deployment is a separate static export:

```bash
npm run build:web
```

Hosting will be selected and configured only after demo corrections are approved.

## Export and backup

Exports are not enabled in the demo. The production design supports explicit owner-confirmed CSV exports and a versioned JSON backup. Exports must never be uploaded to a public bucket or logged. Supabase platform backups and recovery procedures will be documented and tested before launch.

## Security warnings

- Never use real client data in the demo fixtures.
- Never commit `.env`, tokens, exports, private documents, or service-role credentials.
- Do not enable public registration or anonymous CRM access.
- Do not automate or scrape WhatsApp; every message requires owner review and manual sending.
- Do not log names, contact details, message contents, or private strategy in production.
- Treat project price, completion, and availability data as editable and time-sensitive.

## Known limitations

- Demo changes are session-only and reset on reload.
- Supabase Auth, database persistence, RLS, and Storage are not connected yet.
- Native local notifications and biometric lock are not active.
- Call and WhatsApp buttons open device/browser links but do not infer duration, delivery, or read state.
- CSV import, documents, quotations, site-visit editing, exports, reports, and production commission lifecycle are later vertical slices.
- Individual unit inventory is deliberately absent; the demo uses verified unit types only.

## Next milestone

Review the demo on phone and web, collect workflow and visual corrections, then implement the Supabase schema/RLS and sign-in-only owner flow behind the existing data boundary. See `docs/IMPLEMENTATION_PLAN.md` for the complete roadmap.
