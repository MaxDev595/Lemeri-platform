import { db } from "@/lib/db";
import { AI_SEAT_MONTHLY_TOKENS } from "./catalog";

// Data the employee AI works with. Everything is scoped to one workspace and,
// where it is personal (tasks, deals, activity), to the current teammate.
// Plain SQL keeps the Worker bundle small and every list is capped.

type Row = Record<string, unknown>;
const q = <T = Row>(sql: string, ...params: unknown[]) => db.$queryRawUnsafe<T[]>(sql, ...params);
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);

export type Viewer = { workspaceId: string; memberId: string; userId: string; role: string };

export type CrmTaskRow = { id: string; title: string; type: string; dueAt: string | null; customer: string | null; customerId: string | null; deal: string | null };
export type DealRow = { id: string; title: string; amount: number; currency: string; stage: string; stageId: string; pipelineId: string; customer: string | null; customerId: string | null; expectedCloseAt: string | null };
export type StageRow = { id: string; name: string; kind: string; pipelineId: string };
export type WorkContext = { crmTasks: CrmTaskRow[]; deals: DealRow[]; stages: StageRow[]; waiting: Array<{ customer: string; channel: string; updatedAt: string | null }>; unread: Array<{ thread: string; unread: number }> };

/** What's on the teammate's plate: CRM tasks, own open deals, chats waiting for a human, unread team chats. */
export async function workContext(v: Viewer): Promise<WorkContext> {
  const [tasks, deals, waiting, unread] = await Promise.all([
    q(`SELECT t."id", t."title", t."type", t."dueAt", c."name" AS "customer", t."customerId", d."title" AS "deal" FROM "CrmTask" t LEFT JOIN "Customer" c ON c."id" = t."customerId" LEFT JOIN "Deal" d ON d."id" = t."dealId"
       WHERE t."workspaceId" = $1 AND t."assigneeMemberId" = $2 AND t."completedAt" IS NULL ORDER BY t."dueAt" ASC NULLS LAST LIMIT 25`, v.workspaceId, v.memberId),
    q(`SELECT d."id", d."title", d."amount", d."currency", s."name" AS "stage", d."stageId", d."pipelineId", c."name" AS "customer", d."customerId", d."expectedCloseAt" FROM "Deal" d JOIN "PipelineStage" s ON s."id" = d."stageId" LEFT JOIN "Customer" c ON c."id" = d."customerId"
       WHERE d."workspaceId" = $1 AND d."ownerMemberId" = $2 AND d."status" = 'OPEN' ORDER BY d."updatedAt" DESC LIMIT 15`, v.workspaceId, v.memberId),
    q(`SELECT c."name" AS "customer", v."channelType" AS "channel", v."updatedAt" FROM "Conversation" v JOIN "Customer" c ON c."id" = v."customerId"
       WHERE v."workspaceId" = $1 AND v."status" = 'HUMAN_ACTIVE' AND (v."assignedMemberId" = $2 OR v."assignedMemberId" IS NULL) ORDER BY v."updatedAt" DESC LIMIT 8`, v.workspaceId, v.memberId),
    q<{ thread: string; unread: number }>(`SELECT msg."thread", COUNT(*)::int AS "unread" FROM "TeamMessage" msg LEFT JOIN "TeamRead" r ON r."memberId" = $2 AND r."thread" = msg."thread"
       WHERE msg."workspaceId" = $1 AND (msg."thread" = 'general' OR msg."thread" LIKE '%' || $2 || '%') AND msg."senderMemberId" IS DISTINCT FROM $2 AND (r."readAt" IS NULL OR msg."createdAt" > r."readAt") GROUP BY msg."thread"`, v.workspaceId, v.memberId),
  ]);
  const pipelines = [...new Set(deals.map(d => String(d.pipelineId)))];
  const stages = pipelines.length ? await q<StageRow>(`SELECT "id", "name", "kind", "pipelineId" FROM "PipelineStage" WHERE "pipelineId" = ANY($1::text[]) ORDER BY "pipelineId", "sort"`, pipelines) : [];
  return {
    crmTasks: tasks.map(t => ({ id: String(t.id), title: String(t.title), type: String(t.type), dueAt: iso(t.dueAt), customer: (t.customer as string) ?? null, customerId: (t.customerId as string) ?? null, deal: (t.deal as string) ?? null })),
    deals: deals.map(d => ({ id: String(d.id), title: String(d.title), amount: Number(d.amount ?? 0), currency: String(d.currency ?? "RUB"), stage: String(d.stage), stageId: String(d.stageId), pipelineId: String(d.pipelineId), customer: (d.customer as string) ?? null, customerId: (d.customerId as string) ?? null, expectedCloseAt: iso(d.expectedCloseAt) })),
    stages,
    waiting: waiting.map(w => ({ customer: String(w.customer), channel: String(w.channel), updatedAt: iso(w.updatedAt) })),
    unread,
  };
}

export type CustomerCard = {
  id: string; name: string; phone: string | null; email: string | null; company: string | null; tags: string[]; notes: string | null; source: string | null;
  deals: Array<{ id: string; title: string; amount: number; currency: string; stage: string; stageId: string; pipelineId: string; status: string }>;
  tasks: Array<{ id: string; title: string; dueAt: string | null }>;
  activity: Array<{ type: string; body: string; author: string | null; at: string | null }>;
  messages: Array<{ from: "client" | "us"; text: string; at: string | null }>;
  stages: StageRow[];
};

/** Customers matching a name, phone or email (best first). */
export async function findCustomers(workspaceId: string, query: string) {
  const term = query.trim().replace(/[%_\\]/g, "").slice(0, 80);
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  return q<{ id: string; name: string; phone: string | null; email: string | null }>(
    `SELECT "id", "name", "phone", "email" FROM "Customer" WHERE "workspaceId" = $1 AND ("name" ILIKE '%' || $2 || '%' OR "email" ILIKE '%' || $2 || '%' OR ($3 <> '' AND length($3) >= 5 AND regexp_replace(COALESCE("phone", ''), '\\D', '', 'g') LIKE '%' || $3 || '%'))
     ORDER BY ("name" ILIKE $2 || '%') DESC, "lastActivityAt" DESC NULLS LAST LIMIT 6`, workspaceId, term, digits);
}

/** Everything a teammate needs to talk about one client: deals, tasks, history and the latest chat. */
export async function customerCard(workspaceId: string, customerId: string): Promise<CustomerCard | null> {
  const [base, deals, tasks, activity, messages] = await Promise.all([
    q(`SELECT c."id", c."name", c."phone", c."email", c."tags", c."notes", c."source", co."name" AS "company" FROM "Customer" c LEFT JOIN "Company" co ON co."id" = c."companyId" WHERE c."id" = $1 AND c."workspaceId" = $2`, customerId, workspaceId),
    q(`SELECT d."id", d."title", d."amount", d."currency", d."status", d."stageId", d."pipelineId", s."name" AS "stage" FROM "Deal" d JOIN "PipelineStage" s ON s."id" = d."stageId" WHERE d."customerId" = $1 AND d."workspaceId" = $2 ORDER BY (d."status" = 'OPEN') DESC, d."updatedAt" DESC LIMIT 8`, customerId, workspaceId),
    q(`SELECT "id", "title", "dueAt" FROM "CrmTask" WHERE "customerId" = $1 AND "workspaceId" = $2 AND "completedAt" IS NULL ORDER BY "dueAt" ASC NULLS LAST LIMIT 8`, customerId, workspaceId),
    q(`SELECT "type", "body", "authorName", "createdAt" FROM "CrmActivity" WHERE "customerId" = $1 AND "workspaceId" = $2 ORDER BY "createdAt" DESC LIMIT 10`, customerId, workspaceId),
    q(`SELECT m."direction", m."content", m."createdAt" FROM "Message" m JOIN "Conversation" v ON v."id" = m."conversationId" WHERE v."customerId" = $1 AND v."workspaceId" = $2 ORDER BY m."createdAt" DESC LIMIT 8`, customerId, workspaceId),
  ]);
  const c = base[0];
  if (!c) return null;
  const pipelines = [...new Set(deals.filter(d => d.status === "OPEN").map(d => String(d.pipelineId)))];
  const stages = pipelines.length ? await q<StageRow>(`SELECT "id", "name", "kind", "pipelineId" FROM "PipelineStage" WHERE "pipelineId" = ANY($1::text[]) ORDER BY "pipelineId", "sort"`, pipelines) : [];
  return {
    id: String(c.id), name: String(c.name), phone: (c.phone as string) ?? null, email: (c.email as string) ?? null, company: (c.company as string) ?? null,
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [], notes: (c.notes as string) ?? null, source: (c.source as string) ?? null,
    deals: deals.map(d => ({ id: String(d.id), title: String(d.title), amount: Number(d.amount ?? 0), currency: String(d.currency ?? "RUB"), stage: String(d.stage), stageId: String(d.stageId), pipelineId: String(d.pipelineId), status: String(d.status) })),
    tasks: tasks.map(t => ({ id: String(t.id), title: String(t.title), dueAt: iso(t.dueAt) })),
    activity: activity.map(a => ({ type: String(a.type), body: String(a.body ?? "").slice(0, 400), author: (a.authorName as string) ?? null, at: iso(a.createdAt) })),
    messages: messages.reverse().map(m => ({ from: m.direction === "INBOUND" ? "client" as const : "us" as const, text: String(m.content ?? "").replace(/^Subject: .*\n+/, "").slice(0, 500), at: iso(m.createdAt) })),
    stages,
  };
}

export type ActivityFacts = {
  since: string;
  activities: Array<{ type: string; body: string; customer: string | null; at: string | null }>;
  tasksDone: Array<{ title: string; customer: string | null }>;
  dealsCreated: Array<{ title: string; amount: number; currency: string }>;
  dealsWon: Array<{ title: string; amount: number; currency: string }>;
  dealsLost: Array<{ title: string; reason: string | null }>;
  stageMoves: number;
  replies: number;
  conversations: number;
  teamMessages: number;
  reportsDone: number;
};

/** What the teammate actually did in the period — the raw material for an automatic report. */
export async function activityFacts(v: Viewer, since: Date): Promise<ActivityFacts> {
  const [activities, tasksDone, deals, replies, team] = await Promise.all([
    q(`SELECT a."type", a."body", c."name" AS "customer", a."createdAt" FROM "CrmActivity" a LEFT JOIN "Customer" c ON c."id" = a."customerId" WHERE a."workspaceId" = $1 AND a."authorUserId" = $2 AND a."createdAt" >= $3 ORDER BY a."createdAt" ASC LIMIT 80`, v.workspaceId, v.userId, since),
    q(`SELECT t."title", c."name" AS "customer" FROM "CrmTask" t LEFT JOIN "Customer" c ON c."id" = t."customerId" WHERE t."workspaceId" = $1 AND t."assigneeMemberId" = $2 AND t."completedAt" >= $3 ORDER BY t."completedAt" ASC LIMIT 60`, v.workspaceId, v.memberId, since),
    q(`SELECT "title", "amount", "currency", "status", "lostReason", ("createdAt" >= $3) AS "created", ("closedAt" >= $3) AS "closed" FROM "Deal" WHERE "workspaceId" = $1 AND "ownerMemberId" = $2 AND ("createdAt" >= $3 OR "closedAt" >= $3 OR "stageChangedAt" >= $3) LIMIT 80`, v.workspaceId, v.memberId, since),
    q<{ replies: number; conversations: number }>(`SELECT COUNT(*)::int AS "replies", COUNT(DISTINCT m."conversationId")::int AS "conversations" FROM "Message" m JOIN "Conversation" c ON c."id" = m."conversationId" WHERE c."workspaceId" = $1 AND m."direction" = 'OUTBOUND' AND m."sources"->>'memberId' = $2 AND m."createdAt" >= $3`, v.workspaceId, v.memberId, since),
    q<{ messages: number; reports: number }>(`SELECT (SELECT COUNT(*)::int FROM "TeamMessage" WHERE "workspaceId" = $1 AND "senderMemberId" = $2 AND "kind" = 'TEXT' AND "createdAt" >= $3) AS "messages", (SELECT COUNT(*)::int FROM "TeamTask" WHERE "workspaceId" = $1 AND "assigneeMemberId" = $2 AND "status" = 'DONE' AND "completedAt" >= $3) AS "reports"`, v.workspaceId, v.memberId, since),
  ]);
  const money = (d: Row) => ({ title: String(d.title), amount: Number(d.amount ?? 0), currency: String(d.currency ?? "RUB") });
  const systemTypes = new Set(["DEAL_CREATED", "STAGE_CHANGED", "DEAL_WON", "DEAL_LOST", "TASK_CREATED", "TASK_DONE", "FIELD_CHANGED"]);
  return {
    since: since.toISOString(),
    activities: activities.filter(a => !systemTypes.has(String(a.type))).map(a => ({ type: String(a.type), body: String(a.body ?? "").slice(0, 300), customer: (a.customer as string) ?? null, at: iso(a.createdAt) })),
    tasksDone: tasksDone.map(t => ({ title: String(t.title), customer: (t.customer as string) ?? null })),
    dealsCreated: deals.filter(d => d.created).map(money),
    dealsWon: deals.filter(d => d.closed && d.status === "WON").map(money),
    dealsLost: deals.filter(d => d.closed && d.status === "LOST").map(d => ({ title: String(d.title), reason: (d.lostReason as string) ?? null })),
    stageMoves: activities.filter(a => a.type === "STAGE_CHANGED").length,
    replies: replies[0]?.replies ?? 0,
    conversations: replies[0]?.conversations ?? 0,
    teamMessages: team[0]?.messages ?? 0,
    reportsDone: team[0]?.reports ?? 0,
  };
}

// ------------------------------------------------------------------ usage and limits
export const usageMonth = (date = new Date()) => date.toISOString().slice(0, 7);
export const monthlyLimit = () => Number(process.env.TEAM_AI_MONTHLY_TOKENS) || AI_SEAT_MONTHLY_TOKENS;

export async function usageFor(workspaceId: string) {
  const rows = await q<{ memberId: string; tokens: number; requests: number }>(`SELECT "memberId", "tokens", "requests" FROM "TeamAiUsage" WHERE "workspaceId" = $1 AND "month" = $2`, workspaceId, usageMonth());
  return new Map(rows.map(r => [r.memberId, { tokens: Number(r.tokens), requests: Number(r.requests) }]));
}

export async function recordUsage(v: Viewer, tokens: number) {
  if (!tokens) return;
  await db.$executeRawUnsafe(`INSERT INTO "TeamAiUsage" ("memberId", "month", "workspaceId", "tokens", "requests") VALUES ($1, $2, $3, $4, 1)
    ON CONFLICT ("memberId", "month") DO UPDATE SET "tokens" = "TeamAiUsage"."tokens" + EXCLUDED."tokens", "requests" = "TeamAiUsage"."requests" + 1, "updatedAt" = CURRENT_TIMESTAMP`,
    v.memberId, usageMonth(), v.workspaceId, Math.min(Math.round(tokens), 1_000_000)).catch(error => console.error("AI usage not recorded", error instanceof Error ? error.message : error));
}
