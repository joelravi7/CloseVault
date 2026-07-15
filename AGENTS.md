# CloseVault Agent Guide

Read the exact Expo SDK 57 documentation at https://docs.expo.dev/versions/v57.0.0/ before changing Expo APIs.

## Purpose

CloseVault is a private, single-user real-estate lead-to-commission application. Preserve owner privacy and the explicit non-team product boundary. Demo fixtures must always be clearly fictional.

## Architecture and folders

- Expo Router routes live under `src/app`.
- Reusable visual primitives live under `src/components/ui`.
- Feature UI and feature hooks live under `src/features/<feature>`.
- Pure business rules and types live under `src/domain`.
- Data contracts and implementations live under `src/data`; screens never query Supabase directly.
- Cross-cutting providers live under `src/providers`.
- Supabase migrations and seed SQL live under `supabase/`.

## Coding standards

- TypeScript strict mode; do not use `any` to bypass design work.
- Prefer small pure functions and explicit return types for business rules.
- Validate external input with Zod at the boundary.
- Use theme tokens; do not scatter raw colours or spacing values through feature screens.
- Provide loading, empty, error, disabled-submit, and retry behavior where applicable.
- Use accessible labels, readable contrast, and comfortable touch targets.
- Store timestamps in UTC and render in `Asia/Colombo`.
- Represent persisted money as PostgreSQL `numeric`; use integer LKR or decimal strings in application logic.
- Never claim external delivery, call duration, upload, sync, or persistence without a verified integration.

## Security rules

- Never commit secrets, real credentials, client records, phone numbers, private notes, or production exports.
- The Expo client may contain only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and non-secret environment labels.
- Never use a Supabase service-role key in client code.
- No public registration route or anonymous CRM data access.
- Every private table must have tested owner-only RLS for select, insert, update, and delete.
- Do not log client names, contact details, message contents, auth tokens, or strategy notes in production.
- Documents use a private bucket and short-lived signed access.
- Biometrics supplement Supabase Auth; they never replace it.
- Confirm destructive actions and prefer soft deletion for important records.

## Database migration rules

- Make schema changes only through new, ordered SQL migrations; never edit an applied production migration.
- Use UUID primary keys, `timestamptz`, and `numeric` for money.
- Add `owner_id`, timestamps, indexes, updated-at triggers, constraints, and RLS in the same migration as a private table.
- Include forward intent and rollback notes in migration comments.
- Test policies as authenticated owner, different authenticated user, and anonymous user.
- Refresh generated database TypeScript types after schema changes.
- Seed only reference data and clearly fictional demo records.

## Commands

```bash
npm install
npm run start
npm run ios
npm run android
npm run web
npm run typecheck
npm run lint
npm test
```

## Rules for future Codex work

- Read `docs/IMPLEMENTATION_PLAN.md` and this file before changing architecture.
- Build complete vertical slices and run typecheck, lint, and relevant tests after each milestone.
- Keep demo and Supabase repositories behaviorally compatible.
- Do not add team, invitation, public-sign-up, automated messaging, analytics, or advertising features.
- Do not invent project inventory, payment terms, message delivery state, or client facts.
- Document new credentials, migrations, environment variables, and manual operations in the README.
