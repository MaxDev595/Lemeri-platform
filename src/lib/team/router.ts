import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { crmSchemaReady, db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit, validateRequestOrigin } from "@/lib/security/request";
import { positionByKey, templateByKey } from "@/lib/team/catalog";
import { assistReport, draftFromActivity, nameStem, runTeamAssistant, summarizeThread, type OpenTask, type TeamMember } from "@/lib/team/ai";
import { activityFacts, customerCard, findCustomers, monthlyLimit, recordUsage, usageFor, workContext, type Viewer } from "@/lib/team/copilot";

// Team hub: messenger between teammates, report requests (tasks) and the team AI.
// Served through the CRM route (/api/crm/team/...) so it shares that route's bundle
// instead of adding another one to the size-limited Worker. Plain SQL keeps it small.

type Auth = NonNullable<Awaited<ReturnType<typeof getApiWorkspace>>>;
class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
type Row = Record<string, unknown>;

const q = <T = Row>(sql: string, ...params: unknown[]) => db.$queryRawUnsafe<T[]>(sql, ...params);
const x = (sql: string, ...params: unknown[]) => db.$executeRawUnsafe(sql, ...params);
const uid = () => crypto.randomUUID();
const isAdmin = (auth: Auth) => ["OWNER", "ADMIN"].includes(auth.membership.role);
const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const dmKey = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;

async function members(workspaceId: string) {
  return q<TeamMember & { aiSeat: boolean; lastSeenAt: Date | null; userId: string }>(
    `SELECT m."id", m."role"::text AS "role", m."position", m."aiSeat", m."lastSeenAt", u."id" AS "userId", COALESCE(NULLIF(u."name", ''), u."email") AS "name", u."email"
     FROM "WorkspaceMember" m JOIN "User" u ON u."id" = m."userId" WHERE m."workspaceId" = $1 ORDER BY (m."role" = 'OWNER') DESC, "name" ASC`, workspaceId);
}
/** Owners and admins always have the AI; other teammates need an AI seat. */
async function aiAllowed(auth: Auth) {
  if (isAdmin(auth)) return true;
  const rows = await q<{ aiSeat: boolean }>(`SELECT "aiSeat" FROM "WorkspaceMember" WHERE "id" = $1`, auth.membership.id);
  return Boolean(rows[0]?.aiSeat);
}
const viewer = (auth: Auth): Viewer => ({ workspaceId: auth.workspaceId, memberId: auth.membership.id, userId: auth.user.id, role: auth.membership.role });
/**
 * Seat check plus the monthly allowance. Returns a meter that adds up the tokens
 * of every model call in this request; call done() once at the end to save them.
 */
async function aiAccess(auth: Auth) {
  const v = viewer(auth);
  const [seat, usage] = await Promise.all([isAdmin(auth) ? Promise.resolve(true) : aiAllowed(auth), q<{ tokens: number }>(`SELECT "tokens" FROM "TeamAiUsage" WHERE "memberId" = $1 AND "month" = $2`, v.memberId, new Date().toISOString().slice(0, 7))]);
  if (!seat) throw new HttpError(402, "AI_SEAT_REQUIRED");
  // Seat holders get a monthly allowance; owners and admins are on the main plan.
  if (!isAdmin(auth) && Number(usage[0]?.tokens ?? 0) >= monthlyLimit()) throw new HttpError(429, "AI_LIMIT_REACHED");
  let tokens = 0;
  return { v, meter: (n: number) => { tokens += n; }, done: () => recordUsage(v, tokens) };
}
/** A thread the current member may read: the general chat or a direct chat they take part in. */
async function threadFor(auth: Auth, thread: string) {
  if (thread === "general") return thread;
  const match = thread.match(/^dm:([\w-]+):([\w-]+)$/);
  if (!match || ![match[1], match[2]].includes(auth.membership.id)) throw new HttpError(403, "FORBIDDEN_THREAD");
  const other = match[1] === auth.membership.id ? match[2]! : match[1]!;
  const found = await q(`SELECT 1 FROM "WorkspaceMember" WHERE "id" = $1 AND "workspaceId" = $2`, other, auth.workspaceId);
  if (!found.length) throw new HttpError(404, "MEMBER_NOT_FOUND");
  return dmKey(match[1]!, match[2]!);
}
const markRead = (auth: Auth, thread: string) => x(`INSERT INTO "TeamRead" ("memberId", "thread", "workspaceId", "readAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT ("memberId", "thread") DO UPDATE SET "readAt" = CURRENT_TIMESTAMP`, auth.membership.id, thread, auth.workspaceId);
async function post(auth: Auth, thread: string, kind: string, body: string, extra: { taskId?: string; aiAssisted?: boolean; meta?: unknown; sender?: string | null } = {}) {
  const id = uid();
  await x(`INSERT INTO "TeamMessage" ("id", "workspaceId", "thread", "senderMemberId", "kind", "body", "taskId", "aiAssisted", "meta") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    id, auth.workspaceId, thread, extra.sender === undefined ? auth.membership.id : extra.sender, kind, body, extra.taskId ?? null, Boolean(extra.aiAssisted), extra.meta === undefined ? null : JSON.stringify(extra.meta));
  return id;
}
const taskSelect = `SELECT "id", "kind", "title", "note", "template", "requesterMemberId", "assigneeMemberId", "status", "dueAt", "report", "aiAssisted", "createdAt", "completedAt", "cancelledAt", "cancelReason" FROM "TeamTask"`;
async function task(auth: Auth, id: string) {
  const rows = await q(`${taskSelect} WHERE "id" = $1 AND "workspaceId" = $2`, id, auth.workspaceId);
  if (!rows[0]) throw new HttpError(404, "TASK_NOT_FOUND");
  return rows[0] as Row & { requesterMemberId: string; assigneeMemberId: string; status: string; title: string; template: string; note: string | null };
}

// ------------------------------------------------------------------ handlers
async function bootstrap(auth: Auth) {
  const me = auth.membership.id;
  const [team, unread, last, tasks, allowed, usage] = await Promise.all([
    members(auth.workspaceId),
    q<{ thread: string; unread: number }>(`SELECT msg."thread", COUNT(*)::int AS "unread" FROM "TeamMessage" msg LEFT JOIN "TeamRead" r ON r."memberId" = $2 AND r."thread" = msg."thread"
      WHERE msg."workspaceId" = $1 AND (msg."thread" = 'general' OR msg."thread" LIKE '%' || $2 || '%') AND msg."senderMemberId" IS DISTINCT FROM $2 AND (r."readAt" IS NULL OR msg."createdAt" > r."readAt") GROUP BY msg."thread"`, auth.workspaceId, me),
    q(`SELECT DISTINCT ON ("thread") "thread", "body", "kind", "createdAt", "senderMemberId" FROM "TeamMessage" WHERE "workspaceId" = $1 AND ("thread" = 'general' OR "thread" LIKE '%' || $2 || '%') ORDER BY "thread", "createdAt" DESC`, auth.workspaceId, me),
    q(`${taskSelect} WHERE "workspaceId" = $1 AND ("assigneeMemberId" = $2 OR "requesterMemberId" = $2) AND ("status" = 'OPEN' OR "createdAt" > CURRENT_TIMESTAMP - INTERVAL '30 days') ORDER BY "createdAt" DESC LIMIT 200`, auth.workspaceId, me),
    aiAllowed(auth),
    usageFor(auth.workspaceId),
    x(`UPDATE "WorkspaceMember" SET "lastSeenAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, me).catch(() => undefined),
  ]);
  const admin = isAdmin(auth), limit = monthlyLimit();
  return {
    me: { id: me, role: auth.membership.role, ai: allowed, name: auth.user.name ?? auth.user.email, usage: { tokens: usage.get(me)?.tokens ?? 0, requests: usage.get(me)?.requests ?? 0, limit: admin ? null : limit } },
    // Teammates' AI usage is visible to owners and admins only (Team → Manage).
    members: team.map(({ userId: _u, ...m }) => { void _u; return admin ? { ...m, usage: usage.get(m.id) ?? { tokens: 0, requests: 0 } } : m; }),
    unread, last, tasks, ...(admin ? { seatLimit: limit } : {}),
  };
}

async function messages(auth: Auth, url: URL) {
  const thread = await threadFor(auth, str(url.searchParams.get("thread"), 200));
  const after = url.searchParams.get("after"), before = url.searchParams.get("before");
  const rows = after
    ? await q(`SELECT * FROM "TeamMessage" WHERE "workspaceId" = $1 AND "thread" = $2 AND "createdAt" > $3::timestamp ORDER BY "createdAt" ASC LIMIT 200`, auth.workspaceId, thread, after)
    : (await q(`SELECT * FROM "TeamMessage" WHERE "workspaceId" = $1 AND "thread" = $2 ${before ? `AND "createdAt" < $3::timestamp` : ""} ORDER BY "createdAt" DESC LIMIT 80`, ...[auth.workspaceId, thread, ...(before ? [before] : [])])).reverse();
  if (url.searchParams.get("read") !== "0") await markRead(auth, thread);
  const peer = thread.startsWith("dm:") ? await q<{ readAt: Date }>(`SELECT "readAt" FROM "TeamRead" WHERE "thread" = $1 AND "memberId" <> $2`, thread, auth.membership.id) : [];
  return { thread, messages: rows, peerReadAt: peer[0]?.readAt ?? null };
}

async function send(auth: Auth, body: Row) {
  const thread = await threadFor(auth, str(body.thread, 200));
  const text = str(body.body, 8000);
  if (!text) throw new HttpError(400, "EMPTY_MESSAGE");
  const id = await post(auth, thread, "TEXT", text, { aiAssisted: body.aiAssisted === true });
  await markRead(auth, thread);
  return { id, thread };
}

async function createTask(auth: Auth, body: Row) {
  if (auth.membership.role === "VIEWER") throw new HttpError(403, "FORBIDDEN");
  const assignee = str(body.assigneeMemberId, 64);
  if (!assignee || assignee === auth.membership.id) throw new HttpError(400, "INVALID_ASSIGNEE");
  const found = await q(`SELECT 1 FROM "WorkspaceMember" WHERE "id" = $1 AND "workspaceId" = $2`, assignee, auth.workspaceId);
  if (!found.length) throw new HttpError(404, "MEMBER_NOT_FOUND");
  const template = templateByKey(str(body.template, 40));
  const title = str(body.title, 160) || template.ru;
  const note = str(body.note, 2000) || null;
  const due = typeof body.dueAt === "string" && !Number.isNaN(Date.parse(body.dueAt)) ? new Date(body.dueAt) : null;
  const id = uid();
  await x(`INSERT INTO "TeamTask" ("id", "workspaceId", "kind", "title", "note", "template", "requesterMemberId", "assigneeMemberId", "dueAt") VALUES ($1, $2, 'REPORT', $3, $4, $5, $6, $7, $8)`,
    id, auth.workspaceId, title, note, template.key, auth.membership.id, assignee, due);
  const thread = dmKey(auth.membership.id, assignee);
  await post(auth, thread, "REPORT_REQUEST", [title, note].filter(Boolean).join("\n"), { taskId: id, meta: { viaAssistant: body.viaAssistant === true } });
  return { id, thread };
}

async function cancelTask(auth: Auth, id: string, body: Row) {
  const t = await task(auth, id);
  // Only the person who asked can withdraw the request.
  if (t.requesterMemberId !== auth.membership.id) throw new HttpError(403, "ONLY_REQUESTER_CAN_CANCEL");
  if (t.status !== "OPEN") throw new HttpError(409, "TASK_CLOSED");
  const reason = str(body.reason, 500) || null;
  await x(`UPDATE "TeamTask" SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "cancelReason" = $2 WHERE "id" = $1`, id, reason);
  await post(auth, dmKey(t.requesterMemberId, t.assigneeMemberId), "TASK_CANCELLED", reason ?? "", { taskId: id });
  return { ok: true };
}

async function submitReport(auth: Auth, id: string, body: Row) {
  const t = await task(auth, id);
  if (t.assigneeMemberId !== auth.membership.id) throw new HttpError(403, "ONLY_ASSIGNEE_CAN_REPORT");
  if (t.status !== "OPEN") throw new HttpError(409, "TASK_CLOSED");
  const template = templateByKey(t.template);
  const raw = (body.fields && typeof body.fields === "object" ? body.fields : {}) as Record<string, unknown>;
  const fields = Object.fromEntries(template.fields.map(f => [f.key, str(raw[f.key], 6000)]));
  if (template.fields.some(f => f.required && !fields[f.key])) throw new HttpError(400, "REQUIRED_FIELDS");
  // "Done with AI" is only shown when the AI really edited this report.
  const viaAi = (await q<{ viaAi: boolean }>(`SELECT "viaAi" FROM "TeamTask" WHERE "id" = $1`, id))[0]?.viaAi === true;
  const aiAssisted = body.aiAssisted === true && viaAi;
  await x(`UPDATE "TeamTask" SET "status" = 'DONE', "completedAt" = CURRENT_TIMESTAMP, "report" = $2::jsonb, "aiAssisted" = $3 WHERE "id" = $1`, id, JSON.stringify({ template: template.key, fields }), aiAssisted);
  await post(auth, dmKey(t.requesterMemberId, t.assigneeMemberId), "REPORT", template.fields.map(f => fields[f.key] ? `${f.ru}: ${fields[f.key]}` : "").filter(Boolean).join("\n\n").slice(0, 8000), { taskId: id, aiAssisted });
  return { ok: true };
}

const timezoneOf = async (workspaceId: string) => (await q<{ timezone: string }>(`SELECT "timezone" FROM "WorkspaceSettings" WHERE "workspaceId" = $1`, workspaceId))[0]?.timezone || "UTC";

async function aiChat(auth: Auth, body: Row) {
  const access = await aiAccess(auth);
  const text = str(body.text, 2000);
  if (!text) throw new HttpError(400, "EMPTY_MESSAGE");
  const history = Array.isArray(body.history) ? (body.history as Row[]).slice(-10).map(t => ({ role: t.role === "assistant" ? "assistant" as const : "user" as const, content: str(t.content, 2000) })).filter(t => t.content) : [];
  const [team, timezone, open, mine, work] = await Promise.all([
    members(auth.workspaceId),
    timezoneOf(auth.workspaceId),
    q<{ title: string; assigneeMemberId: string; dueAt: Date | null }>(`SELECT "title", "assigneeMemberId", "dueAt" FROM "TeamTask" WHERE "workspaceId" = $1 AND "requesterMemberId" = $2 AND "status" = 'OPEN' ORDER BY "createdAt" ASC LIMIT 30`, auth.workspaceId, auth.membership.id),
    q<{ id: string; title: string; requesterMemberId: string; dueAt: Date | null }>(`SELECT "id", "title", "requesterMemberId", "dueAt" FROM "TeamTask" WHERE "workspaceId" = $1 AND "assigneeMemberId" = $2 AND "status" = 'OPEN' ORDER BY "dueAt" ASC NULLS LAST LIMIT 20`, auth.workspaceId, auth.membership.id),
    workContext(access.v),
  ]);
  const me = team.find(m => m.id === auth.membership.id) ?? { id: auth.membership.id, name: auth.user.name ?? auth.user.email, email: auth.user.email, role: auth.membership.role, position: null };
  const nameOf = (id: string) => team.find(m => m.id === id)?.name ?? "—";
  const tasks: OpenTask[] = open.map(t => ({ title: t.title, assignee: nameOf(t.assigneeMemberId), dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null, overdue: Boolean(t.dueAt && new Date(t.dueAt) < new Date()) }));
  const myTasks = mine.map(t => ({ id: t.id, title: t.title, requester: nameOf(t.requesterMemberId), dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null }));
  const lookup = async (query: string) => {
    let found = await findCustomers(auth.workspaceId, query);
    if (!found.length && nameStem(query) !== query) found = await findCustomers(auth.workspaceId, nameStem(query));
    const exact = found.filter(c => c.name.toLowerCase() === query.toLowerCase());
    const pick = exact.length === 1 ? exact[0] : found.length === 1 ? found[0] : undefined;
    return { card: pick ? await customerCard(auth.workspaceId, pick.id) : null, candidates: found.map(c => ({ id: c.id, name: [c.name, c.phone, c.email].filter(Boolean).join(" · ") })) };
  };
  try {
    return await runTeamAssistant({ text, history, members: team, me, locale: auth.locale, timezone, tasks, myTasks, work, canWrite: auth.membership.role !== "VIEWER", lookup, meter: access.meter });
  } finally { await access.done(); }
}

async function aiReport(auth: Auth, body: Row) {
  const access = await aiAccess(auth);
  const t = await task(auth, str(body.taskId, 64));
  if (t.assigneeMemberId !== auth.membership.id) throw new HttpError(403, "ONLY_ASSIGNEE_CAN_REPORT");
  const draft = str(body.draft, 12000);
  const raw = (body.fields && typeof body.fields === "object" ? body.fields : {}) as Record<string, unknown>;
  const fields = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, str(v, 6000)]));
  if (!draft && !Object.values(fields).some(Boolean)) throw new HttpError(400, "EMPTY_DRAFT");
  try {
    const result = await assistReport({ template: templateByKey(t.template), draft, fields, title: t.title, note: t.note, author: auth.user.name ?? auth.user.email, locale: auth.locale, meter: access.meter });
    if (result.mode === "model") await x(`UPDATE "TeamTask" SET "viaAi" = true WHERE "id" = $1`, t.id);
    return result;
  } finally { await access.done(); }
}

/** Report on autopilot: a draft built from what the person did in CRM and chats during the period. */
async function aiAutodraft(auth: Auth, body: Row) {
  const access = await aiAccess(auth);
  const t = await task(auth, str(body.taskId, 64));
  if (t.assigneeMemberId !== auth.membership.id) throw new HttpError(403, "ONLY_ASSIGNEE_CAN_REPORT");
  const period = ["day", "week", "month"].includes(String(body.period)) ? String(body.period) : ["weekly", "project", "marketing", "finance"].includes(t.template) ? "week" : "day";
  const since = new Date(Date.now() - (period === "month" ? 30 : period === "week" ? 7 : 1) * 86400_000);
  const [facts, timezone] = await Promise.all([activityFacts(access.v, since), timezoneOf(auth.workspaceId)]);
  const label = auth.locale === "ru" ? { day: "последние 24 часа", week: "последние 7 дней", month: "последние 30 дней" }[period]! : { day: "last 24 hours", week: "last 7 days", month: "last 30 days" }[period]!;
  try {
    const result = await draftFromActivity({ template: templateByKey(t.template), facts, extra: str(body.extra, 6000), title: t.title, note: t.note, author: auth.user.name ?? auth.user.email, period: label, locale: auth.locale, timezone, meter: access.meter });
    if (result.mode === "model") await x(`UPDATE "TeamTask" SET "viaAi" = true WHERE "id" = $1`, t.id);
    return { ...result, period, facts: { activities: facts.activities.length, tasksDone: facts.tasksDone.length, deals: facts.dealsCreated.length + facts.dealsWon.length + facts.dealsLost.length, replies: facts.replies } };
  } finally { await access.done(); }
}

/** Summary of a chat: what was discussed and decided, and what is expected from me. */
async function aiSummary(auth: Auth, body: Row) {
  const access = await aiAccess(auth);
  const thread = await threadFor(auth, str(body.thread, 200));
  const days = Math.min(30, Math.max(1, Number(body.days) || 7));
  const [rows, team, timezone] = await Promise.all([
    q<{ senderMemberId: string | null; body: string; kind: string; createdAt: Date }>(`SELECT "senderMemberId", "body", "kind", "createdAt" FROM "TeamMessage" WHERE "workspaceId" = $1 AND "thread" = $2 AND "createdAt" > CURRENT_TIMESTAMP - make_interval(days => $3::int) ORDER BY "createdAt" DESC LIMIT 200`, auth.workspaceId, thread, days),
    members(auth.workspaceId),
    timezoneOf(auth.workspaceId),
  ]);
  if (!rows.length) return { summary: auth.locale === "ru" ? "За этот период сообщений нет." : "No messages in this period.", decisions: [], forMe: [], questions: [], mode: "rules", count: 0 };
  const nameOf = (id: string | null) => (id ? team.find(m => m.id === id)?.name ?? "—" : "Lemeri");
  const messages = rows.reverse().map(m => ({ sender: nameOf(m.senderMemberId), mine: m.senderMemberId === auth.membership.id, text: m.body, kind: m.kind, at: new Date(m.createdAt).toISOString() }));
  const title = thread === "general" ? (auth.locale === "ru" ? "Общий чат" : "General") : nameOf(thread.replace(/^dm:/, "").split(":").find(id => id !== auth.membership.id) ?? null);
  try {
    return { ...(await summarizeThread({ messages, me: auth.user.name ?? auth.user.email, title, locale: auth.locale, timezone, meter: access.meter })), count: messages.length };
  } finally { await access.done(); }
}

// ------------------------------------------------------------------ admin: seats, positions, joining
async function updateMember(auth: Auth, memberId: string, body: Row) {
  if (!isAdmin(auth)) throw new HttpError(403, "FORBIDDEN");
  const rows = await q<{ role: string }>(`SELECT "role"::text AS "role" FROM "WorkspaceMember" WHERE "id" = $1 AND "workspaceId" = $2`, memberId, auth.workspaceId);
  if (!rows[0]) throw new HttpError(404, "MEMBER_NOT_FOUND");
  if (typeof body.aiSeat === "boolean") await x(`UPDATE "WorkspaceMember" SET "aiSeat" = $2 WHERE "id" = $1`, memberId, body.aiSeat);
  if (typeof body.position === "string") await x(`UPDATE "WorkspaceMember" SET "position" = $2 WHERE "id" = $1`, memberId, positionByKey(body.position)?.key ?? (str(body.position, 80) || null));
  return { ok: true };
}
const newCode = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "").toUpperCase().slice(0, 8).padEnd(8, "7");
async function joinAdmin(auth: Auth) {
  if (!isAdmin(auth)) throw new HttpError(403, "FORBIDDEN");
  let code = (await q<{ code: string }>(`SELECT "code" FROM "WorkspaceJoinCode" WHERE "workspaceId" = $1`, auth.workspaceId))[0]?.code;
  if (!code) { code = newCode(); await x(`INSERT INTO "WorkspaceJoinCode" ("workspaceId", "code") VALUES ($1, $2) ON CONFLICT ("workspaceId") DO NOTHING`, auth.workspaceId, code); code = (await q<{ code: string }>(`SELECT "code" FROM "WorkspaceJoinCode" WHERE "workspaceId" = $1`, auth.workspaceId))[0]?.code ?? code; }
  const requests = await q(`SELECT r."id", r."position", r."status", r."createdAt", COALESCE(NULLIF(u."name", ''), u."email") AS "name", u."email" FROM "JoinRequest" r JOIN "User" u ON u."id" = r."userId" WHERE r."workspaceId" = $1 AND r."status" = 'PENDING' ORDER BY r."createdAt" ASC`, auth.workspaceId);
  return { code, requests };
}
async function rotateCode(auth: Auth) {
  if (!isAdmin(auth)) throw new HttpError(403, "FORBIDDEN");
  await x(`INSERT INTO "WorkspaceJoinCode" ("workspaceId", "code") VALUES ($1, $2) ON CONFLICT ("workspaceId") DO UPDATE SET "code" = EXCLUDED."code", "createdAt" = CURRENT_TIMESTAMP`, auth.workspaceId, newCode());
  return joinAdmin(auth);
}
async function decideJoin(auth: Auth, requestId: string, body: Row) {
  if (!isAdmin(auth)) throw new HttpError(403, "FORBIDDEN");
  const rows = await q<{ userId: string; position: string | null; status: string }>(`SELECT "userId", "position", "status" FROM "JoinRequest" WHERE "id" = $1 AND "workspaceId" = $2`, requestId, auth.workspaceId);
  const request = rows[0];
  if (!request) throw new HttpError(404, "REQUEST_NOT_FOUND");
  if (request.status !== "PENDING") throw new HttpError(409, "ALREADY_DECIDED");
  if (body.decision === "approve") {
    const role = ["ADMIN", "MANAGER", "VIEWER"].includes(String(body.role)) ? String(body.role) : positionByKey(request.position)?.role ?? "MANAGER";
    await x(`INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "position") VALUES ($1, $2, $3, $4::"MemberRole", $5) ON CONFLICT ("workspaceId", "userId") DO NOTHING`, uid(), auth.workspaceId, request.userId, role, request.position);
  }
  await x(`UPDATE "JoinRequest" SET "status" = $2, "decidedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, requestId, body.decision === "approve" ? "APPROVED" : "REJECTED");
  return joinAdmin(auth);
}


// ------------------------------------------------------------------ employee accounts (no company yet)
// Pick a position and ask to join a company by its code; the owner approves in Team → Manage.
async function employeeState(userId: string) {
  const [user, requests, memberships] = await Promise.all([
    db.$queryRawUnsafe<Array<{ accountType: string; position: string | null }>>(`SELECT "accountType", "position" FROM "User" WHERE "id" = $1`, userId),
    db.$queryRawUnsafe<Row[]>(`SELECT r."id", r."status", r."position", r."createdAt", w."name" AS "workspace" FROM "JoinRequest" r JOIN "Workspace" w ON w."id" = r."workspaceId" WHERE r."userId" = $1 ORDER BY r."createdAt" DESC LIMIT 5`, userId),
    db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT COUNT(*)::int AS "n" FROM "WorkspaceMember" WHERE "userId" = $1`, userId),
  ]);
  return { accountType: user[0]?.accountType ?? "OWNER", position: user[0]?.position ?? null, requests, member: (memberships[0]?.n ?? 0) > 0 };
}

async function employeeJoin(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await crmSchemaReady();
  if (request.method === "GET") return NextResponse.json(await employeeState(user.id), { headers: { "cache-control": "no-store" } });
  if (!validateRequestOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const body = ((await request.json().catch(() => null)) ?? {}) as Row;
  const position = positionByKey(typeof body.position === "string" ? body.position : null)?.key ?? null;
  if (position) await db.$executeRawUnsafe(`UPDATE "User" SET "position" = $2 WHERE "id" = $1`, user.id, position);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (code) {
    const limit = await checkRateLimit("team:join", user.id, 20, 15 * 60);
    if (!limit.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    const found = await db.$queryRawUnsafe<Array<{ workspaceId: string }>>(`SELECT "workspaceId" FROM "WorkspaceJoinCode" WHERE "code" = $1`, code);
    const workspaceId = found[0]?.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: "CODE_NOT_FOUND" }, { status: 404 });
    const saved = position ?? (await db.$queryRawUnsafe<Array<{ position: string | null }>>(`SELECT "position" FROM "User" WHERE "id" = $1`, user.id))[0]?.position ?? null;
    await db.$executeRawUnsafe(`INSERT INTO "JoinRequest" ("id", "workspaceId", "userId", "position", "status") VALUES ($1, $2, $3, $4, 'PENDING')
      ON CONFLICT ("workspaceId", "userId") DO UPDATE SET "position" = EXCLUDED."position", "status" = CASE WHEN "JoinRequest"."status" = 'APPROVED' THEN 'APPROVED' ELSE 'PENDING' END, "createdAt" = CURRENT_TIMESTAMP, "decidedAt" = NULL`,
      crypto.randomUUID(), workspaceId, user.id, saved);
    const who = user.name ?? user.email;
    await db.$executeRawUnsafe(`INSERT INTO "Notification" ("id", "workspaceId", "type", "title", "body") VALUES ($1, $2, 'TEAM', $3, $4)`,
      crypto.randomUUID(), workspaceId, "Новый сотрудник хочет присоединиться", `${who} (${positionByKey(saved)?.ru ?? "должность не указана"}) ждёт подтверждения в разделе «Команда».`).catch(() => undefined);
  }
  return NextResponse.json(await employeeState(user.id));
}

// ------------------------------------------------------------------ router
type Handler = (auth: Auth, ctx: { url: URL; body: Row; params: string[] }) => Promise<unknown>;
const routes: Array<[string, RegExp, Handler]> = [
  ["GET", /^bootstrap$/, a => bootstrap(a)],
  ["GET", /^messages$/, (a, c) => messages(a, c.url)],
  ["POST", /^messages$/, (a, c) => send(a, c.body)],
  ["POST", /^read$/, async (a, c) => { await markRead(a, await threadFor(a, str(c.body.thread, 200))); return { ok: true }; }],
  ["POST", /^tasks$/, (a, c) => createTask(a, c.body)],
  ["POST", /^tasks\/([\w-]+)\/cancel$/, (a, c) => cancelTask(a, c.params[0]!, c.body)],
  ["POST", /^tasks\/([\w-]+)\/report$/, (a, c) => submitReport(a, c.params[0]!, c.body)],
  ["POST", /^ai\/chat$/, (a, c) => aiChat(a, c.body)],
  ["POST", /^ai\/report$/, (a, c) => aiReport(a, c.body)],
  ["POST", /^ai\/autodraft$/, (a, c) => aiAutodraft(a, c.body)],
  ["POST", /^ai\/summary$/, (a, c) => aiSummary(a, c.body)],
  ["PATCH", /^members\/([\w-]+)$/, (a, c) => updateMember(a, c.params[0]!, c.body)],
  ["GET", /^join$/, a => joinAdmin(a)],
  ["POST", /^join\/rotate$/, a => rotateCode(a)],
  ["POST", /^join\/([\w-]+)$/, (a, c) => decideJoin(a, c.params[0]!, c.body)],
];

export async function handleTeam(request: Request, segments: string[]) {
  if (segments.join("/") === "employee/join" && ["GET", "POST"].includes(request.method)) return employeeJoin(request);
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (request.method !== "GET" && !validateRequestOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const path = segments.join("/");
  const route = routes.find(([method, pattern]) => method === request.method && pattern.test(path));
  if (!route) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const body = request.method === "GET" ? {} : ((await request.json().catch(() => null)) ?? {}) as Row;
  try {
    await crmSchemaReady();
    const result = await route[2](auth, { url: new URL(request.url), body, params: path.match(route[1])!.slice(1) });
    return NextResponse.json(result ?? { ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.code }, { status: error.status });
    const message = error instanceof Error ? error.message : String(error);
    console.error("Team request failed", request.method, path, message);
    return NextResponse.json({ error: "TEAM_FAILED", detail: message.split("\n").filter(Boolean).slice(-1)[0]?.slice(0, 240) }, { status: 500 });
  }
}

