import { z } from "zod";
import { db } from "@/lib/db";
import { canWorkspace } from "@/lib/auth/permissions";
import { SECTION_IDS, SECTION_TITLES, searchGuide, type SectionId } from "./guide";

export type AssistantLocale = "ru" | "en";
export type AssistantContext = { workspaceId: string; role: string; locale: AssistantLocale; userName: string; timezone: string };
/** A change the assistant prepared. The browser executes `request` only after the user presses "Confirm". */
export type ActionProposal = {
  id: string; kind: string; title: string; details: string[]; danger?: boolean;
  request: { method: "POST" | "PATCH" | "PUT" | "DELETE"; path: string; body?: unknown };
  effect?: { theme?: "light" | "dark" | "system"; locale?: AssistantLocale; navigate?: SectionId };
};
export type ToolOutcome = { data: unknown; navigate?: SectionId; proposal?: ActionProposal };
type ToolDef = { name: string; description: string; parameters: Record<string, unknown>; run: (ctx: AssistantContext, args: Record<string, unknown>) => Promise<ToolOutcome> };

const CHANNELS = ["WEBSITE", "TELEGRAM", "WHATSAPP", "EMAIL"] as const;
const ACTION_KEYS = { createLead: { ru: "Создавать лиды", en: "Create leads" }, createAppointment: { ru: "Создавать записи", en: "Create appointments" }, notifyManager: { ru: "Уведомлять менеджера", en: "Notify a manager" }, handoffToHuman: { ru: "Передавать человеку", en: "Hand off to a human" } } as const;
const LEAD_STAGE = { NEW: { ru: "Новый", en: "New" }, QUALIFIED: { ru: "Квалифицирован", en: "Qualified" }, WON: { ru: "Сделка", en: "Won" }, LOST: { ru: "Потерян", en: "Lost" } } as const;
const APPT_STATUS = { SCHEDULED: { ru: "Запланирована", en: "Scheduled" }, CONFIRMED: { ru: "Подтверждена", en: "Confirmed" }, COMPLETED: { ru: "Завершена", en: "Completed" }, CANCELLED: { ru: "Отменена", en: "Cancelled" } } as const;
const THEMES = { light: { ru: "светлая", en: "light" }, dark: { ru: "тёмная", en: "dark" }, system: { ru: "как в системе", en: "system" } } as const;
const ROLES = { ADMIN: { ru: "администратор", en: "admin" }, MANAGER: { ru: "менеджер", en: "manager" }, VIEWER: { ru: "наблюдатель", en: "viewer" } } as const;

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const int = (description: string) => ({ type: "integer", description, minimum: 1, maximum: 50 });
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const idSchema = z.string().min(10).max(64).regex(/^[A-Za-z0-9_-]+$/);
const limitOf = (value: unknown, fallback = 10) => Math.min(Math.max(Number.isInteger(value) ? Number(value) : fallback, 1), 50);
const tr = (ctx: AssistantContext, ru: string, en: string) => (ctx.locale === "ru" ? ru : en);
const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
const clip = (value: string | null | undefined, n = 280) => { if (!value) return null; const flat = value.replace(/\s+/g, " ").trim(); return flat.length > n ? `${flat.slice(0, n)}…` : flat; };

class ToolError extends Error {}
function deny(ctx: AssistantContext): never { throw new ToolError(tr(ctx, "У вашей роли нет прав на это действие.", "Your role is not allowed to do this.")); }
function proposal(ctx: AssistantContext, value: Omit<ActionProposal, "id">): ToolOutcome {
  const p = { ...value, id: crypto.randomUUID() };
  return { proposal: p, data: { status: "AWAITING_USER_CONFIRMATION", summary: p.title, note: "Shown to the user as a card with a Confirm button. It is NOT done yet — tell the user to confirm." } };
}
async function customerName(workspaceId: string, customerId: string) { return (await db.customer.findFirst({ where: { id: customerId, workspaceId }, select: { name: true } }))?.name ?? "—"; }

export const TOOLS: ToolDef[] = [
  {
    name: "platform_help",
    description: "How-to and feature documentation of the Lemiri platform (sections, connecting channels, CRM, knowledge, settings, the assistant card itself). Use for any 'how do I / what can the platform do' question.",
    parameters: obj({ query: str("The user's question or topic keywords") }, ["query"]),
    async run(ctx, args) {
      const found = searchGuide(String(args.query ?? ""));
      const entries = (found.length ? found : searchGuide("платформа")).map(e => ({ section: e.section, sectionTitle: SECTION_TITLES[e.section][ctx.locale], text: e[ctx.locale] }));
      return { data: { entries, sections: SECTION_IDS.map(id => ({ id, title: SECTION_TITLES[id][ctx.locale] })) }, navigate: found[0]?.section };
    },
  },
  {
    name: "open_section",
    description: "Open a section of the dashboard for the user (navigation, no confirmation needed).",
    parameters: obj({ section: str("Section id", { enum: SECTION_IDS }) }, ["section"]),
    async run(ctx, args) {
      const section = z.enum(SECTION_IDS as [SectionId, ...SectionId[]]).parse(args.section);
      return { navigate: section, data: { opened: SECTION_TITLES[section][ctx.locale] } };
    },
  },
  {
    name: "workspace_overview",
    description: "Snapshot of the whole workspace: AI employees and their status, connected channels (website, Telegram, WhatsApp, Email) with errors, CRM integration state, counts of customers/conversations/leads/appointments, knowledge sources, unread notifications and open knowledge gaps.",
    parameters: obj({}),
    async run(ctx) {
      const w = ctx.workspaceId, now = new Date();
      const [employees, channels, integrations, customers, openConversations, needManager, leads, upcoming, sources, unread, gaps, settings] = await Promise.all([
        db.aIEmployee.findMany({ where: { workspaceId: w }, select: { id: true, name: true, role: true, status: true, permissions: { select: { actionKey: true, enabled: true } } }, orderBy: { createdAt: "asc" } }),
        db.channel.findMany({ where: { workspaceId: w }, select: { id: true, type: true, status: true, lastError: true, employee: { select: { name: true } } } }),
        db.integration.findMany({ where: { workspaceId: w }, select: { id: true, provider: true, status: true, lastSyncAt: true, lastError: true } }),
        db.customer.count({ where: { workspaceId: w } }),
        db.conversation.count({ where: { workspaceId: w, status: { not: "CLOSED" } } }),
        db.conversation.count({ where: { workspaceId: w, status: { in: ["NEEDS_ATTENTION", "HUMAN_ACTIVE"] } } }),
        db.lead.groupBy({ by: ["stage"], where: { workspaceId: w }, _count: { _all: true } }),
        db.appointment.count({ where: { workspaceId: w, startsAt: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } } }),
        db.knowledgeSource.groupBy({ by: ["status"], where: { workspaceId: w }, _count: { _all: true } }),
        db.notification.count({ where: { workspaceId: w, readAt: null } }),
        db.knowledgeGap.findMany({ where: { workspaceId: w, status: "OPEN" }, orderBy: { occurrences: "desc" }, take: 5, select: { question: true, occurrences: true } }),
        db.workspaceSettings.findUnique({ where: { workspaceId: w }, select: { theme: true, locale: true, timezone: true } }),
      ]);
      return { data: {
        employees: employees.map(e => ({ id: e.id, name: e.name, role: e.role, status: e.status, allowedActions: e.permissions.filter(p => p.enabled).map(p => p.actionKey) })),
        channels: channels.map(c => ({ id: c.id, type: c.type, status: c.status, employee: c.employee?.name ?? null, lastError: clip(c.lastError, 160) })),
        missingChannels: CHANNELS.filter(t => !channels.some(c => c.type === t && c.status === "CONNECTED")),
        crm: integrations.map(i => ({ id: i.id, provider: i.provider, status: i.status, lastSyncAt: iso(i.lastSyncAt), lastError: clip(i.lastError, 160) })),
        counts: { customers, openConversations, conversationsNeedingOrWithManager: needManager, upcomingAppointments: upcoming, unreadNotifications: unread },
        leadsByStage: Object.fromEntries(leads.map(l => [l.stage, l._count._all])),
        knowledgeByStatus: Object.fromEntries(sources.map(s => [s.status, s._count._all])),
        topKnowledgeGaps: gaps,
        settings,
      } };
    },
  },
  {
    name: "search_customers",
    description: "Find customers (people who wrote via any channel) by name, phone or email. Empty query returns the most recent customers. Includes their channels and counts of leads/appointments.",
    parameters: obj({ query: str("Name, phone or email fragment; may be empty"), limit: int("Max rows (default 10)") }),
    async run(ctx, args) {
      const q = String(args.query ?? "").trim();
      const rows = await db.customer.findMany({
        where: { workspaceId: ctx.workspaceId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
        select: { id: true, name: true, phone: true, email: true, conversations: { select: { channelType: true, updatedAt: true }, orderBy: { updatedAt: "desc" } }, _count: { select: { leads: true, appointments: true } } },
        orderBy: { id: "desc" }, take: limitOf(args.limit),
      });
      return { data: rows.map(c => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, channels: [...new Set(c.conversations.map(v => v.channelType))], lastContactAt: iso(c.conversations[0]?.updatedAt), leads: c._count.leads, appointments: c._count.appointments })) };
    },
  },
  {
    name: "customer_profile",
    description: "Everything about one customer: contacts, conversations per channel with summaries and latest messages, leads and appointments. Use to 'collect information about a client'.",
    parameters: obj({ customerId: str("Customer id from search_customers") }, ["customerId"]),
    async run(ctx, args) {
      const id = idSchema.parse(args.customerId);
      const c = await db.customer.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: {
        id: true, name: true, phone: true, email: true,
        conversations: { orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, channelType: true, status: true, summary: true, updatedAt: true, messages: { orderBy: { createdAt: "desc" }, take: 6, select: { direction: true, content: true, createdAt: true } } } },
        leads: { orderBy: { createdAt: "desc" }, select: { id: true, stage: true, interest: true, createdAt: true } },
        appointments: { orderBy: { startsAt: "desc" }, select: { id: true, service: true, startsAt: true, status: true } },
      } });
      if (!c) throw new ToolError(tr(ctx, "Клиент не найден.", "Customer not found."));
      return { navigate: "conversations", data: { ...c, conversations: c.conversations.map(v => ({ id: v.id, channel: v.channelType, status: v.status, summary: clip(v.summary), updatedAt: iso(v.updatedAt), lastMessages: v.messages.reverse().map(m => ({ from: m.direction === "INBOUND" ? "customer" : "business", text: clip(m.content, 240), at: iso(m.createdAt) })) })) } };
    },
  },
  {
    name: "list_conversations",
    description: "Recent conversations, optionally filtered by channel (WEBSITE, TELEGRAM, WHATSAPP, EMAIL) and status (AI_ACTIVE, NEEDS_ATTENTION = AI asked for a manager, HUMAN_ACTIVE = a manager took over, CLOSED). Shows customer, last message and summary.",
    parameters: obj({ channel: str("Channel filter", { enum: [...CHANNELS] }), status: str("Status filter", { enum: ["AI_ACTIVE", "NEEDS_ATTENTION", "HUMAN_ACTIVE", "CLOSED"] }), limit: int("Max rows (default 10)") }),
    async run(ctx, args) {
      const channel = args.channel && CHANNELS.includes(args.channel as (typeof CHANNELS)[number]) ? String(args.channel) : undefined;
      const status = typeof args.status === "string" && ["AI_ACTIVE", "NEEDS_ATTENTION", "HUMAN_ACTIVE", "CLOSED"].includes(args.status) ? args.status : undefined;
      const rows = await db.conversation.findMany({ where: { workspaceId: ctx.workspaceId, ...(channel ? { channelType: channel } : {}), ...(status ? { status } : {}) }, orderBy: { updatedAt: "desc" }, take: limitOf(args.limit),
        select: { id: true, channelType: true, status: true, summary: true, updatedAt: true, customer: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, content: true } } } });
      return { navigate: "conversations", data: rows.map(v => ({ id: v.id, channel: v.channelType, status: v.status, customer: v.customer, updatedAt: iso(v.updatedAt), summary: clip(v.summary, 200), lastMessage: v.messages[0] ? { from: v.messages[0].direction === "INBOUND" ? "customer" : "business", text: clip(v.messages[0].content, 200) } : null })) };
    },
  },
  {
    name: "conversation_messages",
    description: "Full message history of one conversation (oldest first).",
    parameters: obj({ conversationId: str("Conversation id"), limit: int("Max messages (default 30)") }, ["conversationId"]),
    async run(ctx, args) {
      const id = idSchema.parse(args.conversationId);
      const v = await db.conversation.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, channelType: true, status: true, customer: { select: { name: true, phone: true, email: true } }, messages: { orderBy: { createdAt: "desc" }, take: limitOf(args.limit, 30), select: { direction: true, content: true, createdAt: true } } } });
      if (!v) throw new ToolError(tr(ctx, "Диалог не найден.", "Conversation not found."));
      return { navigate: "conversations", data: { ...v, messages: v.messages.reverse().map(m => ({ from: m.direction === "INBOUND" ? "customer" : "business", text: clip(m.content, 600), at: iso(m.createdAt) })) } };
    },
  },
  {
    name: "list_leads",
    description: "Leads created by the AI employee, optionally filtered by stage (NEW, QUALIFIED, WON, LOST) and recency in days.",
    parameters: obj({ stage: str("Stage filter", { enum: Object.keys(LEAD_STAGE) }), days: int("Only leads from the last N days"), limit: int("Max rows (default 15)") }),
    async run(ctx, args) {
      const stage = typeof args.stage === "string" && args.stage in LEAD_STAGE ? args.stage : undefined;
      const since = Number.isInteger(args.days) ? new Date(Date.now() - Number(args.days) * 86_400_000) : undefined;
      const rows = await db.lead.findMany({ where: { workspaceId: ctx.workspaceId, ...(stage ? { stage } : {}), ...(since ? { createdAt: { gte: since } } : {}) }, orderBy: { createdAt: "desc" }, take: limitOf(args.limit, 15), select: { id: true, stage: true, interest: true, createdAt: true, customer: { select: { id: true, name: true, phone: true, email: true } } } });
      return { navigate: "leads", data: rows.map(l => ({ ...l, createdAt: iso(l.createdAt) })) };
    },
  },
  {
    name: "list_appointments",
    description: "Appointments booked by the AI employee. period: upcoming (default), today, past or all; optional status filter.",
    parameters: obj({ period: str("Time window", { enum: ["upcoming", "today", "past", "all"] }), status: str("Status filter", { enum: Object.keys(APPT_STATUS) }), limit: int("Max rows (default 15)") }),
    async run(ctx, args) {
      const now = new Date(), period = String(args.period ?? "upcoming");
      const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0); const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const startsAt = period === "today" ? { gte: dayStart, lt: dayEnd } : period === "past" ? { lt: now } : period === "all" ? undefined : { gte: now };
      const status = typeof args.status === "string" && args.status in APPT_STATUS ? args.status : undefined;
      const rows = await db.appointment.findMany({ where: { workspaceId: ctx.workspaceId, ...(startsAt ? { startsAt } : {}), ...(status ? { status } : {}) }, orderBy: { startsAt: period === "past" ? "desc" : "asc" }, take: limitOf(args.limit, 15), select: { id: true, service: true, startsAt: true, status: true, customer: { select: { id: true, name: true, phone: true } } } });
      return { navigate: "appointments", data: { timezone: ctx.timezone, rows: rows.map(a => ({ ...a, startsAt: iso(a.startsAt) })) } };
    },
  },
  {
    name: "crm_status",
    description: "CRM webhook integration state and delivery queue: connection status, last sync, last error, pending and failed CRM events.",
    parameters: obj({}),
    async run(ctx) {
      const [integrations, pending, failed, recent] = await Promise.all([
        db.integration.findMany({ where: { workspaceId: ctx.workspaceId }, select: { id: true, provider: true, status: true, lastSyncAt: true, lastError: true, updatedAt: true } }),
        db.backgroundJob.count({ where: { workspaceId: ctx.workspaceId, type: "CRM_EVENT", status: { in: ["PENDING", "RUNNING"] } } }),
        db.backgroundJob.count({ where: { workspaceId: ctx.workspaceId, type: "CRM_EVENT", status: "FAILED" } }),
        db.backgroundJob.findMany({ where: { workspaceId: ctx.workspaceId, type: "CRM_EVENT" }, orderBy: { createdAt: "desc" }, take: 5, select: { status: true, attempts: true, lastError: true, createdAt: true } }),
      ]);
      return { navigate: "integrations", data: { integrations: integrations.map(i => ({ ...i, lastSyncAt: iso(i.lastSyncAt), updatedAt: iso(i.updatedAt), lastError: clip(i.lastError, 200) })), queue: { pending, failed }, recentEvents: recent.map(j => ({ ...j, lastError: clip(j.lastError, 160), createdAt: iso(j.createdAt) })) } };
    },
  },
  {
    name: "knowledge_overview",
    description: "Knowledge base sources (text, FAQ, website, documents) with processing status, and questions customers asked that the AI could not answer (knowledge gaps).",
    parameters: obj({}),
    async run(ctx) {
      const [sources, gaps] = await Promise.all([
        db.knowledgeSource.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, title: true, type: true, status: true, uri: true, createdAt: true } }),
        db.knowledgeGap.findMany({ where: { workspaceId: ctx.workspaceId, status: "OPEN" }, orderBy: { occurrences: "desc" }, take: 10, select: { question: true, occurrences: true, lastSeenAt: true } }),
      ]);
      return { navigate: "knowledge", data: { sources: sources.map(s => ({ ...s, createdAt: iso(s.createdAt) })), gaps: gaps.map(g => ({ ...g, lastSeenAt: iso(g.lastSeenAt) })) } };
    },
  },
  // ---- Changes: each returns a proposal the user must confirm in the card. ----
  {
    name: "propose_set_lead_stage",
    description: "Prepare moving a lead to another stage (requires user confirmation).",
    parameters: obj({ leadId: str("Lead id"), stage: str("New stage", { enum: Object.keys(LEAD_STAGE) }) }, ["leadId", "stage"]),
    async run(ctx, args) {
      if (!canWorkspace(ctx.role, "OPERATE_CRM")) deny(ctx);
      const id = idSchema.parse(args.leadId), stage = z.enum(["NEW", "QUALIFIED", "WON", "LOST"]).parse(args.stage);
      const lead = await db.lead.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { stage: true, customerId: true, interest: true } });
      if (!lead) throw new ToolError(tr(ctx, "Лид не найден.", "Lead not found."));
      const name = await customerName(ctx.workspaceId, lead.customerId);
      return proposal(ctx, { kind: "lead.stage", title: tr(ctx, `Перевести лид «${name}» в этап «${LEAD_STAGE[stage].ru}»`, `Move lead “${name}” to “${LEAD_STAGE[stage].en}”`), details: [tr(ctx, `Сейчас: ${LEAD_STAGE[lead.stage as keyof typeof LEAD_STAGE]?.ru ?? lead.stage}`, `Now: ${LEAD_STAGE[lead.stage as keyof typeof LEAD_STAGE]?.en ?? lead.stage}`), ...(lead.interest ? [lead.interest] : [])], request: { method: "PATCH", path: `/api/leads/${id}`, body: { stage } }, effect: { navigate: "leads" } });
    },
  },
  {
    name: "propose_set_appointment_status",
    description: "Prepare confirming, completing or cancelling an appointment (requires user confirmation).",
    parameters: obj({ appointmentId: str("Appointment id"), status: str("New status", { enum: Object.keys(APPT_STATUS) }) }, ["appointmentId", "status"]),
    async run(ctx, args) {
      if (!canWorkspace(ctx.role, "OPERATE_CRM")) deny(ctx);
      const id = idSchema.parse(args.appointmentId), status = z.enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"]).parse(args.status);
      const a = await db.appointment.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { service: true, startsAt: true, customerId: true } });
      if (!a) throw new ToolError(tr(ctx, "Запись не найдена.", "Appointment not found."));
      const when = a.startsAt.toLocaleString(ctx.locale === "ru" ? "ru-RU" : "en-GB", { timeZone: ctx.timezone, dateStyle: "medium", timeStyle: "short" });
      return proposal(ctx, { kind: "appointment.status", danger: status === "CANCELLED", title: tr(ctx, `Запись «${a.service}» → ${APPT_STATUS[status].ru.toLowerCase()}`, `Appointment “${a.service}” → ${APPT_STATUS[status].en.toLowerCase()}`), details: [await customerName(ctx.workspaceId, a.customerId), when], request: { method: "PATCH", path: `/api/appointments/${id}`, body: { status } }, effect: { navigate: "appointments" } });
    },
  },
  {
    name: "propose_set_employee_status",
    description: "Prepare starting (ACTIVE) or pausing (PAUSED) an AI employee (requires user confirmation).",
    parameters: obj({ employeeId: str("AI employee id"), status: str("New status", { enum: ["ACTIVE", "PAUSED"] }) }, ["employeeId", "status"]),
    async run(ctx, args) {
      if (!canWorkspace(ctx.role, "CONFIGURE_AI")) deny(ctx);
      const id = idSchema.parse(args.employeeId), status = z.enum(["ACTIVE", "PAUSED"]).parse(args.status);
      const e = await db.aIEmployee.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { name: true, status: true } });
      if (!e) throw new ToolError(tr(ctx, "Сотрудник не найден.", "Employee not found."));
      return proposal(ctx, { kind: "employee.status", danger: status === "PAUSED", title: status === "ACTIVE" ? tr(ctx, `Запустить сотрудника «${e.name}»`, `Start employee “${e.name}”`) : tr(ctx, `Поставить на паузу «${e.name}»`, `Pause “${e.name}”`), details: [status === "PAUSED" ? tr(ctx, "Сотрудник перестанет отвечать клиентам во всех каналах.", "The employee stops replying in every channel.") : tr(ctx, "Сотрудник начнёт отвечать клиентам.", "The employee starts replying to customers.")], request: { method: "PATCH", path: `/api/employees/${id}`, body: { status } }, effect: { navigate: "employees" } });
    },
  },
  {
    name: "propose_add_knowledge",
    description: "Prepare adding a knowledge source: TEXT or FAQ (content required, at least 10 characters) or WEBSITE (url required). Requires user confirmation.",
    parameters: obj({ type: str("Source type", { enum: ["TEXT", "FAQ", "WEBSITE"] }), title: str("Short title"), content: str("Text or FAQ pairs (for TEXT/FAQ)"), url: str("https URL (for WEBSITE)") }, ["type", "title"]),
    async run(ctx, args) {
      if (!canWorkspace(ctx.role, "MANAGE_KNOWLEDGE")) deny(ctx);
      const type = z.enum(["TEXT", "FAQ", "WEBSITE"]).parse(args.type), title = z.string().trim().min(2).max(160).parse(args.title);
      if (type === "WEBSITE") {
        const uri = z.string().url().refine(v => v.startsWith("https://") || v.startsWith("http://")).parse(args.url);
        return proposal(ctx, { kind: "knowledge.add", title: tr(ctx, `Добавить сайт в знания: ${title}`, `Add website to knowledge: ${title}`), details: [uri], request: { method: "POST", path: "/api/knowledge", body: { type, title, uri } }, effect: { navigate: "knowledge" } });
      }
      const content = z.string().trim().min(10).max(20000).parse(args.content);
      return proposal(ctx, { kind: "knowledge.add", title: tr(ctx, `Добавить в знания: ${title}`, `Add to knowledge: ${title}`), details: [clip(content, 400) ?? ""], request: { method: "POST", path: "/api/knowledge", body: { type, title, content } }, effect: { navigate: "knowledge" } });
    },
  },
  {
    name: "propose_toggle_employee_action",
    description: "Prepare allowing or forbidding an AI employee action: createLead, createAppointment, notifyManager, handoffToHuman (requires user confirmation).",
    parameters: obj({ employeeId: str("AI employee id"), actionKey: str("Action key", { enum: Object.keys(ACTION_KEYS) }), enabled: { type: "boolean" } }, ["employeeId", "actionKey", "enabled"]),
    async run(ctx, args) {
      if (!canWorkspace(ctx.role, "CONFIGURE_AI")) deny(ctx);
      const id = idSchema.parse(args.employeeId), key = z.enum(Object.keys(ACTION_KEYS) as [keyof typeof ACTION_KEYS]).parse(args.actionKey), enabled = z.boolean().parse(args.enabled);
      const e = await db.aIEmployee.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { name: true } });
      if (!e) throw new ToolError(tr(ctx, "Сотрудник не найден.", "Employee not found."));
      return proposal(ctx, { kind: "action.permission", title: tr(ctx, `${enabled ? "Разрешить" : "Запретить"} «${ACTION_KEYS[key].ru}» для «${e.name}»`, `${enabled ? "Allow" : "Forbid"} “${ACTION_KEYS[key].en}” for “${e.name}”`), details: [], request: { method: "PUT", path: "/api/actions/permissions", body: { employeeId: id, actionKey: key, enabled } }, effect: { navigate: "actions" } });
    },
  },
  {
    name: "propose_set_theme",
    description: "Prepare switching the dashboard theme: light, dark or system (requires user confirmation).",
    parameters: obj({ theme: str("Theme", { enum: ["light", "dark", "system"] }) }, ["theme"]),
    async run(ctx, args) {
      const theme = z.enum(["light", "dark", "system"]).parse(args.theme);
      if (!["OWNER", "ADMIN"].includes(ctx.role)) deny(ctx);
      return proposal(ctx, { kind: "settings.theme", title: tr(ctx, `Сменить тему: ${THEMES[theme].ru}`, `Switch theme: ${THEMES[theme].en}`), details: [], request: { method: "PATCH", path: "/api/settings", body: { theme } }, effect: { theme } });
    },
  },
  {
    name: "propose_set_language",
    description: "Prepare switching the workspace language: ru or en (requires user confirmation).",
    parameters: obj({ locale: str("Language", { enum: ["ru", "en"] }) }, ["locale"]),
    async run(ctx, args) {
      const locale = z.enum(["ru", "en"]).parse(args.locale);
      if (!["OWNER", "ADMIN"].includes(ctx.role)) deny(ctx);
      return proposal(ctx, { kind: "settings.locale", title: tr(ctx, `Сменить язык: ${locale === "ru" ? "русский" : "английский"}`, `Switch language: ${locale === "ru" ? "Russian" : "English"}`), details: [], request: { method: "PATCH", path: "/api/settings", body: { locale } }, effect: { locale } });
    },
  },
  {
    name: "propose_mark_notifications_read",
    description: "Prepare marking all notifications as read (requires user confirmation).",
    parameters: obj({}),
    async run(ctx) {
      const count = await db.notification.count({ where: { workspaceId: ctx.workspaceId, readAt: null } });
      return proposal(ctx, { kind: "notifications.read", title: tr(ctx, `Отметить прочитанными уведомления (${count})`, `Mark notifications as read (${count})`), details: [], request: { method: "PATCH", path: "/api/notifications" }, effect: { navigate: "notifications" } });
    },
  },
  {
    name: "propose_takeover_conversation",
    description: "Prepare taking a conversation over from the AI (take=true) or returning it to the AI (take=false). Requires confirmation.",
    parameters: obj({ conversationId: str("Conversation id"), take: { type: "boolean" } }, ["conversationId", "take"]),
    async run(ctx, args) {
      if (!canWorkspace(ctx.role, "TAKE_OVER_CONVERSATION")) deny(ctx);
      const id = idSchema.parse(args.conversationId), take = z.boolean().parse(args.take);
      const v = await db.conversation.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { channelType: true, customerId: true } });
      if (!v) throw new ToolError(tr(ctx, "Диалог не найден.", "Conversation not found."));
      const name = await customerName(ctx.workspaceId, v.customerId);
      return proposal(ctx, { kind: "conversation.takeover", title: take ? tr(ctx, `Перехватить диалог с «${name}»`, `Take over the chat with “${name}”`) : tr(ctx, `Вернуть диалог с «${name}» ИИ-сотруднику`, `Return the chat with “${name}” to the AI`), details: [v.channelType], request: { method: take ? "POST" : "DELETE", path: `/api/conversations/${id}/takeover` }, effect: { navigate: "conversations" } });
    },
  },
  {
    name: "propose_reply_to_conversation",
    description: "Prepare sending a manager message to the customer in a conversation (delivered via its channel). Only after the user asked to write to the customer. Requires confirmation.",
    parameters: obj({ conversationId: str("Conversation id"), text: str("Message text for the customer") }, ["conversationId", "text"]),
    async run(ctx, args) {
      if (!canWorkspace(ctx.role, "TAKE_OVER_CONVERSATION")) deny(ctx);
      const id = idSchema.parse(args.conversationId), content = z.string().trim().min(1).max(4000).parse(args.text);
      const v = await db.conversation.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { channelType: true, customerId: true } });
      if (!v) throw new ToolError(tr(ctx, "Диалог не найден.", "Conversation not found."));
      const name = await customerName(ctx.workspaceId, v.customerId);
      return proposal(ctx, { kind: "conversation.reply", title: tr(ctx, `Отправить сообщение клиенту «${name}» (${v.channelType})`, `Send a message to “${name}” (${v.channelType})`), details: [content], request: { method: "POST", path: `/api/conversations/${id}/messages`, body: { content } }, effect: { navigate: "conversations" } });
    },
  },
  {
    name: "propose_invite_teammate",
    description: "Prepare inviting a teammate by email with role ADMIN, MANAGER or VIEWER (sends an email; requires confirmation).",
    parameters: obj({ email: str("Email"), role: str("Role", { enum: Object.keys(ROLES) }) }, ["email"]),
    async run(ctx, args) {
      if (!["OWNER", "ADMIN"].includes(ctx.role)) deny(ctx);
      const email = z.string().trim().toLowerCase().email().parse(args.email), role = z.enum(["ADMIN", "MANAGER", "VIEWER"]).catch("MANAGER").parse(args.role);
      return proposal(ctx, { kind: "team.invite", title: tr(ctx, `Пригласить ${email} (${ROLES[role].ru})`, `Invite ${email} (${ROLES[role].en})`), details: [tr(ctx, "На почту уйдёт приглашение.", "An invitation email will be sent.")], request: { method: "POST", path: "/api/team", body: { email, role } }, effect: { navigate: "team" } });
    },
  },
  {
    name: "propose_create_test_case",
    description: "Prepare a test case for an AI employee: a customer message and an expected answer fragment (requires confirmation).",
    parameters: obj({ employeeId: str("AI employee id"), name: str("Test name"), customerMessage: str("What the customer writes"), expectedContains: str("Fragment the answer must contain (optional)") }, ["employeeId", "name", "customerMessage"]),
    async run(ctx, args) {
      if (!canWorkspace(ctx.role, "RUN_AI_TESTS")) deny(ctx);
      const employeeId = idSchema.parse(args.employeeId), name = z.string().trim().min(2).max(120).parse(args.name), customerMessage = z.string().trim().min(1).max(4000).parse(args.customerMessage);
      const expected = typeof args.expectedContains === "string" && args.expectedContains.trim() ? args.expectedContains.trim().slice(0, 500) : undefined;
      const e = await db.aIEmployee.findFirst({ where: { id: employeeId, workspaceId: ctx.workspaceId }, select: { name: true } });
      if (!e) throw new ToolError(tr(ctx, "Сотрудник не найден.", "Employee not found."));
      return proposal(ctx, { kind: "test.create", title: tr(ctx, `Создать тест «${name}» для «${e.name}»`, `Create test “${name}” for “${e.name}”`), details: [customerMessage, ...(expected ? [tr(ctx, `Ожидается: ${expected}`, `Expects: ${expected}`)] : [])], request: { method: "POST", path: "/api/test-cases", body: { employeeId, name, customerMessage, ...(expected ? { expectedContains: expected } : {}) } }, effect: { navigate: "testing" } });
    },
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map(tool => [tool.name, tool]));
export { ToolError, LEAD_STAGE, APPT_STATUS };

export async function runTool(ctx: AssistantContext, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return { data: { error: `Unknown tool ${name}` } };
  try { return await tool.run(ctx, args ?? {}); }
  catch (error) {
    if (error instanceof ToolError) return { data: { error: error.message } };
    if (error instanceof z.ZodError) return { data: { error: "INVALID_ARGUMENTS", issues: error.issues.map(i => `${i.path.join(".")}: ${i.message}`) } };
    console.error("Assistant tool failed", name, error instanceof Error ? error.message : error);
    return { data: { error: "TOOL_FAILED" } };
  }
}
