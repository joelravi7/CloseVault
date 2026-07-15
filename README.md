# CloseVault

> Your private lead-to-commission command centre.

CloseVault is a private, single-owner real-estate lead manager for capturing conversations, planning follow-ups, recommending apartments, tracking sales activity, and calculating personal commission. It is intentionally not a company or team CRM.

## Current status

This repository currently contains the first **fictional-data demo milestone**. It is designed for product review before any real database, credentials, client records, notifications, or hosting are connected.

Demo-ready flows:

- Responsive Today command centre
- Searchable lead list and detailed lead profile
- Fast lead capture with Zod validation and duplicate detection
- Mobile/desktop pipeline and calendar agenda
- Rule-based apartment recommendations
- Reconciled payment-plan calculator
- Commission, phone, scoring, template, duplicate, and ranking business rules

The More screen labels backend-dependent workflows as “Next phase”; those controls are intentionally disabled rather than pretending to work.

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

No environment values are required for the fictional demo.

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

Copy `.env.example` to `.env` only when beginning the connected phase:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_APP_ENV=development
```

Only the project URL and client-safe publishable key belong in Expo. Never put a service-role key, database password, private API key, OpenAI key, EAS token, or production export in the client environment.

Use EAS environment variables for preview and production instead of committed `.env` files.

## Supabase setup — next milestone

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
