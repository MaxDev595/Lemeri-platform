import { db } from "@/lib/db";
import { enqueueCrmEvent } from "@/lib/integrations/queue";

export type CrmLocale = "ru" | "en";
export type ActivityType = "NOTE" | "CALL" | "MEETING" | "EMAIL" | "DEAL_CREATED" | "STAGE_CHANGED" | "DEAL_WON" | "DEAL_LOST" | "TASK_CREATED" | "TASK_DONE" | "CONTACT_CREATED" | "CONTACT_MERGED" | "AI_LEAD" | "APPOINTMENT" | "FIELD_CHANGED";

const DEFAULT_STAGES: Record<CrmLocale, Array<{ name: string; color: string; kind: "OPEN" | "WON" | "LOST"; probability: number }>> = {
  ru: [
    { name: "Новая заявка", color: "#6254e8", kind: "OPEN", probability: 10 },
    { name: "Квалификация", color: "#2f7fd8", kind: "OPEN", probability: 25 },
    { name: "Предложение", color: "#b7791f", kind: "OPEN", probability: 50 },
    { name: "Переговоры", color: "#8b5cf6", kind: "OPEN", probability: 75 },
    { name: "Успешно", color: "#1f9d6b", kind: "WON", probability: 100 },
    { name: "Отказ", color: "#d0424f", kind: "LOST", probability: 0 },
  ],
  en: [
    { name: "New", color: "#6254e8", kind: "OPEN", probability: 10 },
    { name: "Qualified", color: "#2f7fd8", kind: "OPEN", probability: 25 },
    { name: "Proposal", color: "#b7791f", kind: "OPEN", probability: 50 },
    { name: "Negotiation", color: "#8b5cf6", kind: "OPEN", probability: 75 },
    { name: "Won", color: "#1f9d6b", kind: "WON", probability: 100 },
    { name: "Lost", color: "#d0424f", kind: "LOST", probability: 0 },
  ],
};

export async function workspaceLocale(workspaceId: string): Promise<CrmLocale> {
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId }, select: { locale: true } });
  return settings?.locale === "en" ? "en" : "ru";
}

/** Every workspace gets a sales pipeline on first CRM use; existing AI leads become deals. */
export async function ensureDefaultPipeline(workspaceId: string, locale?: CrmLocale) {
  const existing = await db.pipeline.findFirst({ where: { workspaceId }, orderBy: [{ isDefault: "desc" }, { sort: "asc" }], include: { stages: { orderBy: { sort: "asc" } } } });
  if (existing) return existing;
  const lang = locale ?? await workspaceLocale(workspaceId);
  const pipeline = await db.pipeline.create({
    data: { workspaceId, name: lang === "ru" ? "Продажи" : "Sales", isDefault: true, stages: { create: DEFAULT_STAGES[lang].map((stage, sort) => ({ ...stage, sort })) } },
    include: { stages: { orderBy: { sort: "asc" } } },
  });
  // Backfill: leads the AI created before the CRM existed appear in the pipeline.
  const leads = await db.lead.findMany({ where: { workspaceId, deal: null }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 500 });
  const first = pipeline.stages[0], qualified = pipeline.stages[1] ?? first, won = pipeline.stages.find(s => s.kind === "WON"), lost = pipeline.stages.find(s => s.kind === "LOST");
  // One statement for all of them: a query per lead used to exhaust the Worker's CPU budget.
  if (leads.length) await db.deal.createMany({ skipDuplicates: true, data: leads.map((lead, index) => {
    const stage = lead.stage === "WON" && won ? won : lead.stage === "LOST" && lost ? lost : lead.stage === "QUALIFIED" ? qualified : first;
    return { workspaceId, pipelineId: pipeline.id, stageId: stage.id, title: (lead.interest || lead.customer.name).slice(0, 200), customerId: lead.customerId, leadId: lead.id, ownerMemberId: lead.assignedMemberId, source: "AI", status: stage.kind, closedAt: stage.kind === "OPEN" ? null : lead.createdAt, sort: index, createdAt: lead.createdAt };
  }) }).catch(error => console.error("CRM backfill failed", error instanceof Error ? error.message : error));
  return pipeline;
}

export async function logActivity(input: { workspaceId: string; type: ActivityType; body?: string | null; meta?: Record<string, unknown>; customerId?: string | null; companyId?: string | null; dealId?: string | null; authorUserId?: string | null; authorName?: string | null }) {
  const { meta, ...rest } = input;
  await db.crmActivity.create({ data: { ...rest, meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined } });
  if (input.customerId) await db.customer.update({ where: { id: input.customerId }, data: { lastActivityAt: new Date() } }).catch(() => undefined);
}

export async function emitDealEvent(workspaceId: string, event: "deal.created" | "deal.updated" | "deal.won" | "deal.lost", dealId: string) {
  const deal = await db.deal.findFirst({ where: { id: dealId, workspaceId }, include: { stage: { select: { name: true, kind: true } }, pipeline: { select: { name: true } }, customer: { select: { id: true, name: true, phone: true, email: true } }, company: { select: { id: true, name: true } }, items: true } });
  if (deal) await enqueueCrmEvent(workspaceId, event, deal);
}

/** Called when the AI employee creates a lead: the lead also becomes a deal in the default pipeline. */
export async function createDealFromLead(input: { workspaceId: string; leadId: string; customerId: string; interest?: string | null; stage?: string; channelType?: string | null }) {
  const pipeline = await ensureDefaultPipeline(input.workspaceId);
  const existing = await db.deal.findFirst({ where: { leadId: input.leadId }, select: { id: true } });
  if (existing) return existing;
  const stage = (input.stage === "QUALIFIED" ? pipeline.stages[1] : undefined) ?? pipeline.stages[0];
  const customer = await db.customer.findFirst({ where: { id: input.customerId }, select: { name: true, ownerMemberId: true, companyId: true } });
  const deal = await db.deal.create({ data: { workspaceId: input.workspaceId, pipelineId: pipeline.id, stageId: stage.id, title: input.interest || customer?.name || "Lead", customerId: input.customerId, companyId: customer?.companyId, ownerMemberId: customer?.ownerMemberId, leadId: input.leadId, source: input.channelType ? `AI · ${input.channelType}` : "AI", sort: Date.now() / 1000 } });
  await logActivity({ workspaceId: input.workspaceId, type: "AI_LEAD", body: input.interest ?? null, customerId: input.customerId, dealId: deal.id, authorName: "AI", meta: { channel: input.channelType ?? null } });
  await emitDealEvent(input.workspaceId, "deal.created", deal.id);
  return deal;
}

export function csvEscape(value: unknown) {
  const text = value == null ? "" : Array.isArray(value) ? value.join("; ") : value instanceof Date ? value.toISOString() : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function normalizePhone(value?: string | null) { return (value ?? "").replace(/[^\d+]/g, "").replace(/^8(\d{10})$/, "+7$1").replace(/^7(\d{10})$/, "+7$1"); }

/** Cron: one notification per task when it becomes due (15 minutes ahead). */
export async function remindDueTasks(limit = 50) {
  const tasks = await db.crmTask.findMany({ where: { completedAt: null, remindedAt: null, dueAt: { lte: new Date(Date.now() + 15 * 60_000) } }, take: limit, include: { customer: { select: { name: true } }, deal: { select: { title: true } } } });
  for (const task of tasks) {
    const lang = await workspaceLocale(task.workspaceId);
    const overdue = task.dueAt && task.dueAt.getTime() < Date.now() - 60_000;
    await db.notification.create({ data: { workspaceId: task.workspaceId, type: "TASK", title: `${lang === "ru" ? (overdue ? "Просрочена задача" : "Задача") : (overdue ? "Overdue task" : "Task due")}: ${task.title}`.slice(0, 120), body: [task.deal?.title, task.customer?.name].filter(Boolean).join(" · ").slice(0, 1000) || task.title } });
    await db.crmTask.update({ where: { id: task.id }, data: { remindedAt: new Date() } });
  }
  return tasks.length;
}
