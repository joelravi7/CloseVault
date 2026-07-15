# CloseVault Implementation Plan

## Product boundary

CloseVault is a private, single-owner lead-to-commission workspace for a Sri Lankan real-estate salesperson. It is not a team CRM. There is no public registration, lead assignment, staff reporting, shared inbox, or automated WhatsApp sending.

## Delivery strategy

Development is split into two deliberate phases:

1. **Demo phase (current):** a polished Expo application backed by fictional in-memory fixtures. The demo proves navigation, responsive design, key workflows, validation, calculations, and product terminology without requiring credentials or handling real client data.
2. **Connected phase:** provision Supabase, apply migrations and RLS policies, create the owner account, replace repositories with Supabase implementations, configure private Storage, notifications, biometrics, EAS environments, and deployment.

The UI depends on repository/service interfaces rather than importing Supabase directly. This keeps demo data replaceable and makes the backend connection a controlled milestone rather than a rewrite.

## Proposed architecture

- **Runtime:** Expo SDK 57, React Native, React 19, TypeScript strict mode, Expo Router.
- **Navigation:** protected root layout; mobile bottom tabs; responsive web/tablet sidebar; detail and modal routes above the tab shell.
- **UI:** reusable tokens and primitives in `src/components/ui`; feature components remain within `src/features`.
- **State:** TanStack Query for server-state lifecycles; small React contexts only for session, app lock, theme, and transient UI state.
- **Forms:** React Hook Form with Zod schemas.
- **Data access:** typed repository contracts in `src/data`; `demo` repositories now, `supabase` repositories later.
- **Business rules:** pure functions in `src/domain` for phone normalization, lead scoring, commissions, payments, dates, template interpolation, duplicate detection, CSV validation, and recommendations.
- **Backend:** Supabase Auth, PostgreSQL, private Storage, SQL migrations, RLS, and Edge Functions only for future privileged operations.
- **Security:** client receives only the Supabase URL and publishable key. Sensitive values use SecureStore. Biometrics are a local gate layered over Supabase Auth.
- **Offline:** TanStack Query persists only bounded recent data later; activity drafts use a small explicit sync queue. The full CRM is never stored unencrypted on-device.
- **Time and money:** database timestamps are UTC and rendered for `Asia/Colombo`; PostgreSQL money is `numeric`; application calculations use integer LKR amounts or decimal strings, never binary floating-point persistence.
- **Errors:** domain errors are translated to friendly messages at the service boundary; raw SQL, stack traces, and private client content are never presented or logged in production.

## Milestones

### M0 — Foundation and demo shell

- Scaffold Expo Router for iOS, Android, and web.
- Add strict TypeScript, linting, tests, environment template, EAS profiles, project rules, design tokens, demo fixtures, and typed models.
- Implement responsive mobile tabs/web sidebar and branded loading, empty, and error states.

### M1 — Demo command centre (current vertical slice)

- Today dashboard with priority summaries, follow-up actions, site visits, and commission snapshot.
- Lead search/list, quick-add validation, duplicate warning, lead profile, requirements, timeline, private strategy, and next-action rule.
- Mobile staged pipeline and responsive Kanban.
- Calendar agenda.
- Apartment recommendations, payment reconciliation, and commission calculations using fictional data.
- Unit tests for foundational business rules and smoke checks for primary routes.

### M2 — Supabase foundation

- Create migrations, enum/check constraints, indexes, updated-at and stage-history triggers.
- Enable and test RLS on every private table.
- Create private document bucket policies and seed reference/demo data.
- Add sign-in-only authentication, route protection, secure logout, and owner bootstrap documentation.
- Replace demo repositories with Supabase repositories behind the same contracts.

### M3 — Communication and follow-ups

- Call return/outcome workflow, WhatsApp deep links and manual sent confirmation.
- Follow-up lifecycle, local notification scheduling/cancellation, and active-lead next-action enforcement.
- Searchable templates and document-send history.

### M4 — Sales workflows

- CSV mapping, preview, validation, duplicate handling, summary, and failed-row export.
- Site visits, document library/version warnings, quotations with immutable sent versions, deals, and commissions.

### M5 — Reliability and release

- Offline activity draft queue, bounded cache, connectivity/sync states, exports, reports, and complete automated coverage.
- Security review, RLS verification, accessibility QA, responsive/device QA, EAS preview builds, production deployment, monitoring without private payloads, and backup/restore runbook.

## Database tables

All private rows are owner-scoped. Tables that do not use the profile ID as their primary key contain `owner_id uuid not null references auth.users(id)`, with `owner_id = auth.uid()` CRUD policies.

- `profiles`
- `projects`
- `unit_types`
- `units`
- `leads`
- `lead_requirements`
- `activities`
- `follow_ups`
- `lead_stage_history`
- `documents`
- `document_sends`
- `message_templates`
- `site_visits`
- `quotations`
- `quotation_payments`
- `deals`
- `commissions`
- `tags`
- `lead_tags`
- `csv_import_batches`
- `csv_import_errors`
- `app_settings`

Potential join/support tables added only when their workflow is implemented: `lead_shortlists`, `saved_views`, and `sync_operations`. Any addition requires a migration, indexes, RLS, rollback notes, and generated type refresh.

## Initial indexes

- Every owner-scoped table: `owner_id` and common `(owner_id, deleted_at)` access paths.
- Leads: normalized phone, WhatsApp phone, lower-cased email, stage, next follow-up, source, project, and created date.
- Units: project, unit type, and status.
- Follow-ups/site visits/quotations: owner plus due/scheduled/expiry timestamps.
- Commissions: owner plus status.
- Activities: lead plus occurred date.

## Assumptions

- One manually created Supabase Auth owner is the only application user.
- The first demo contains fictional data and does not persist changes after a reload.
- LKR is displayed without decimal places by default, but database values remain `numeric` for correctness.
- Finest Residencies data is editable reference data and its UI always exposes a last-updated label.
- Individual unit inventory is not invented; recommendations can operate on unit types until verified inventory is loaded.
- WhatsApp remains a user-approved deep link; delivery/read state is never inferred.
- Native notification and biometric behavior requires a physical device/development build for final verification.
- Server hosting refers to the Expo web build plus Supabase; native apps are distributed through EAS/App Store/Play Store rather than hosted as a traditional server process.

## External credentials and manual setup

Not required for the local demo. The connected phase requires:

- Supabase project URL and client-safe publishable key.
- A manually created owner account in Supabase Auth with public sign-ups disabled.
- Supabase CLI authentication or a database connection for migrations.
- Expo/EAS account and project linkage for development/preview/production builds.
- Apple Developer and Google Play Console accounts for store distribution.
- Notification credentials managed through EAS for production push notifications if remote notifications are added.
- Hosting provider/project for the static web build and DNS credentials only when deployment is authorized.

No service-role key, database password, EAS token, or private API key may be placed in the Expo client or committed to Git.

