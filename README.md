# Lemiri AI Platform

Production-oriented multi-tenant SaaS for AI employees: authenticated workspaces, RAG knowledge sources, website/Telegram/WhatsApp/email conversations, human handoff, leads, appointments, automations, CRM webhooks, analytics, team roles and Stripe billing.

## Local development

Requirements: Node.js 22+, Docker Desktop and npm.

1. Copy `.env.example` to `.env` and fill provider secrets.
2. Start PostgreSQL with pgvector: `docker compose up -d postgres`. It is exposed on host port `55432` to avoid conflicts with a system PostgreSQL on `5432`.
3. Install dependencies: `npm ci`.
4. Apply migrations: `npm run db:deploy`.
5. Generate Prisma Client: `npm run db:generate`.
6. Start the app: `npm run dev` and open `http://localhost:3000`.

Use `AI_PROVIDER=mock` only for local interface development. Production responses support `AI_PROVIDER=groq` with `GROQ_CHAT_MODEL=openai/gpt-oss-120b`, while semantic embeddings continue to use the OpenAI embedding configuration.

## Verification

```text
npm run typecheck
npm test
npm audit --omit=dev --audit-level moderate
npm run build
```

Liveness is exposed at `/api/health/live`. Readiness at `/api/health/ready` verifies both the production configuration and PostgreSQL connection.

### Production-like local smoke

Build and run the standalone Linux image with the isolated local PostgreSQL service:

```text
docker compose --profile smoke up -d --build app
```

The app is then available at `http://localhost:3100`. The `LEMIRI_LOCAL_SMOKE` bypass is accepted only with an explicit flag and a loopback `PUBLIC_APP_URL`; it cannot weaken configuration validation on an external origin.

Run the persistent database integration smoke and the full HTTP flow:

```text
$env:DATABASE_URL="postgresql://lemiri:lemiri_dev_password@127.0.0.1:55432/lemiri?schema=public"
npm run test:db-smoke
npm run test:http-smoke
```

The HTTP smoke covers registration, session cookies, onboarding preview and publication, knowledge indexing, public widget authentication, AI response, manager takeover/reply, lead and appointment creation. Both smoke scripts remove their generated records.

## Production deployment

The multi-stage `Dockerfile` builds a non-root Next.js standalone container. Configure every variable in `.env.example`, use an HTTPS value for `PUBLIC_APP_URL`, run `npm run db:deploy` as a release command, and start the container only after migrations succeed.

Trigger `POST /api/internal/jobs/run` on a short interval with `Authorization: Bearer <CRON_SECRET>`. This processes indexing, retention, CRM delivery and outbound channel messages. Provider webhooks must point to the relevant `/api/webhooks/...` endpoints. Configure Stripe to deliver subscription events to `/api/webhooks/stripe`.

Never commit `.env` or provider credentials. Rotate `CREDENTIALS_ENCRYPTION_KEY` only through a planned credential re-encryption procedure.

### Cloudflare Workers

Build the OpenNext Worker bundle before uploading it to Cloudflare:

```text
npm run build:cloudflare
npm run deploy:cloudflare
```

Use `npm run preview:cloudflare` to verify the application locally in the Workers runtime before deployment.
