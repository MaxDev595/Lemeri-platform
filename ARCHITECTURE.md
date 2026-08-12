# Lemiri AI — architecture baseline

The product is organized around the lifecycle of a digital employee: hire → teach → connect → test → launch → supervise → improve.

## Boundaries

- `src/app`: Next.js routes and server boundaries.
- `src/components`: reusable presentation components; no provider or database logic.
- `src/features`: future vertical modules for employees, knowledge, conversations, leads and appointments.
- `src/lib/ai`: provider interface and orchestrator. The orchestrator loads employee, context, cited knowledge and permissions; validates output before actions.
- `src/lib/connectors`: website, Telegram, WhatsApp, email and CRM adapters. Missing credentials remain `PENDING`, never presented as production-connected.
- `src/lib/data`: workspace-scoped repositories. Every query takes an authorized `workspaceId` rather than accepting it from an untrusted payload.
- `src/lib/jobs`: document indexing, embeddings, sync, aggregation and reminders.

## Security invariants

All business entities are owned directly or transitively by a workspace. Server actions resolve membership from the session and always scope database queries by the resolved workspace. Connector secrets are encrypted server-side. Action permissions default to disabled. Messages retain citations, executions retain inputs/results/reasons, and handoffs retain summaries.

## MVP order

Foundation → employee onboarding → knowledge → website conversations/handoff → leads and appointments → channels → testing → analytics → billing/team/settings. The current implementation provides the complete navigable product shell, responsive design system, realistic development data, interactions, and the production PostgreSQL relational schema.
