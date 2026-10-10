# CloseVault Feature Status

This document is the source of truth for what works in the current fictional-data demo and what remains for later milestones. A visible control must not be described as working unless its complete demo behavior has been implemented and verified.

## Demo-ready now

- Responsive mobile bottom navigation and desktop sidebar
- Today summaries, prioritized action list, structured call/WhatsApp workflows, follow-up resolution, site-visit summary, and commission snapshot
- Lead search, lead cards, and detailed lead profiles
- Quick Add Lead with Zod validation, Sri Lankan phone normalization, duplicate detection, initial activity, and initial follow-up
- Add Activity with type, timestamp, summary, outcome, detailed notes, required next action, timeline update, and automatic follow-up creation
- Schedule Follow-up with type, date/time, priority, context, lead next-action update, timeline record, and calendar data update
- Session-local lead, activity, and follow-up state
- Read-only pipeline stage view
- Calendar agenda
- Rule-based apartment type recommendations
- Configurable payment-plan reconciliation
- Tested phone, duplicate, scoring, commission, payment, template, and recommendation business rules
- Call outcomes with active-lead next-action enforcement and explicit closed outcomes
- WhatsApp template preview, placeholder replacement, clipboard/deep-link handoff, manual-send record, and optional follow-up
- Session-local message-template create, edit, duplicate, archive, and search
- Follow-up complete, reschedule, waiting-for-client, cancel, delete, and lost outcomes with activity history
- Native local-notification permission, safe-content scheduling, cancellation, and rescheduling
- Native biometric app lock, secure local preferences, configurable inactivity timeout, and device fallback

## Partially implemented

- **Calls:** the lead action opens the dialler and prepares the outcome sheet for return. Call-duration detection is intentionally not claimed.
- **WhatsApp:** template preview and manual-send recording work. Selecting private project documents is reserved for the document-library milestone.
- **Notifications and biometrics:** implemented for native builds; browsers display the supported limitation and do not emulate device security APIs.
- **Pipeline:** displays stage columns, but confirmed drag/stage change, lost reason, cancellation of open tasks, and stage history are not active.
- **Calendar:** displays agenda items; day/week navigation and event editing are not active.
- **Payment calculator:** calculates and blocks unreconciled final plans conceptually, but save, attach, quotation, revise, PDF, and share are not active.
- **Apartment options:** ranks verified unit types, but lead shortlisting and private floor-plan documents are not active.

## Milestone 2 — Secure Supabase foundation

- PostgreSQL migrations for all owner-scoped tables
- Constraints, numeric money fields, indexes, timestamps, updated-at triggers, and stage-history trigger
- RLS policies for owner-only select, insert, update, and delete
- Private Storage bucket and policies
- Sign-in-only Supabase Auth, protected routes, secure session handling, and logout
- Manual single-owner provisioning and disabled public sign-up
- Supabase repository implementations replacing session-only demo state
- Seed project, unit types, templates, and fictional demo records
- RLS tests for owner, different authenticated user, and anonymous user

## Milestone 3 — Communication and follow-up workflows

Status: **Demo-complete for native testing.** Data remains session-local until Milestone 2 is completed last.

- Call outcome sheet and next-action enforcement
- WhatsApp template preview, placeholder replacement, manual-send recording, and follow-up creation
- Message-template library
- Local notification permissions, scheduling, rescheduling, completion cancellation, and deletion cancellation
- Follow-up outcome, reschedule, waiting-for-client, cancel, and lost flows
- Safe notification content and biometric app lock

## Milestone 4 — Sales operations

- CSV file selection, mapping, preview, validation, duplicates, merge rules, summary, and failed-row export
- Private document library, upload/download/preview/share, versions, outdated warnings, and send history
- Site-visit creation, briefing, outcome, preferred option, and post-visit follow-up
- Quotations with immutable sent versions and reconciled payment schedules
- Deal, reservation, SPA, initial-payment, and commission qualification workflows
- Commission dashboard and received/outstanding tracking

## Milestone 5 — Reporting, resilience, and release

- Advanced filters, global search fields, and saved views
- Personal reports and conversion metrics
- Owner-confirmed CSV/JSON exports and restore documentation
- Bounded cache, offline activity drafts, sync queue, retry, and connectivity state
- Full UI/integration test matrix and physical-device QA
- EAS preview/production builds, web hosting, backup runbook, and security review
