import { NextResponse } from "next/server";
import { z } from "zod";
import { crmSchemaReady, db } from "@/lib/db";
import { schemaStatus } from "@/lib/crm/schema";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { validateRequestOrigin } from "@/lib/security/request";
import { enqueueCrmEvent } from "@/lib/integrations/queue";
import { drainJobsAfterResponse } from "@/lib/jobs/kick";
import { csvEscape, emitDealEvent, ensureDefaultPipeline, logActivity, normalizePhone } from "@/lib/crm/service";

export const runtime = "nodejs";

type Auth = NonNullable<Awaited<ReturnType<typeof getApiWorkspace>>>;
type Ctx = { auth: Auth; request: Request; url: URL; params: string[]; body: unknown };
class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }

const id = z.string().min(10).max(64).regex(/^[A-Za-z0-9_-]+$/);
const optId = id.nullish();
const text = (max = 500) => z.string().trim().max(max);
const optText = (max = 500) => z.string().trim().max(max).nullish().transform(v => (v ? v : null));
const tags = z.array(z.string().trim().min(1).max(40)).max(30).optional();
const customFields = z.record(z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])).optional();
const dateish = z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullish().transform(v => (v ? new Date(v) : null));
const money = z.coerce.number().min(0).max(1e12);

function need(ctx: Ctx, level: "write" | "admin") {
  const role = ctx.auth.membership.role;
  if (level === "write" && !canWorkspace(role, "OPERATE_CRM")) throw new HttpError(403, "FORBIDDEN");
  if (level === "admin" && !["OWNER", "ADMIN"].includes(role)) throw new HttpError(403, "FORBIDDEN");
}
function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "INVALID_REQUEST");
  return result.data;
}
const ws = (ctx: Ctx) => ctx.auth.workspaceId;
const author = (ctx: Ctx) => ({ authorUserId: ctx.auth.user.id, authorName: ctx.auth.user.name ?? ctx.auth.user.email });
async function member(ctx: Ctx, memberId: string | null | undefined) {
  if (!memberId) return null;
  const found = await db.workspaceMember.findFirst({ where: { id: memberId, workspaceId: ws(ctx) }, select: { id: true } });
  if (!found) throw new HttpError(400, "UNKNOWN_MEMBER");
  return found.id;
}
async function owned<T>(promise: Promise<T | null>): Promise<T> { const value = await promise; if (!value) throw new HttpError(404, "NOT_FOUND"); return value; }
const contactSelect = { id: true, name: true, phone: true, email: true } as const;
const memberSelect = { id: true, role: true, user: { select: { name: true, email: true } } } as const;

// ------------------------------------------------------------------ bootstrap
async function bootstrap(ctx: Ctx) {
  const pipeline = await ensureDefaultPipeline(ws(ctx));
  const [pipelines, members, fields, products, tagRows] = await Promise.all([
    db.pipeline.findMany({ where: { workspaceId: ws(ctx) }, orderBy: [{ isDefault: "desc" }, { sort: "asc" }, { createdAt: "asc" }], include: { stages: { orderBy: { sort: "asc" } } } }),
    db.workspaceMember.findMany({ where: { workspaceId: ws(ctx) }, select: memberSelect }),
    db.crmFieldDefinition.findMany({ where: { workspaceId: ws(ctx) }, orderBy: [{ entity: "asc" }, { sort: "asc" }] }),
    db.product.findMany({ where: { workspaceId: ws(ctx), active: true }, orderBy: { name: "asc" }, take: 500 }),
    db.$queryRawUnsafe<Array<{ tag: string }>>(`SELECT DISTINCT unnest(tags) AS tag FROM "Customer" WHERE "workspaceId" = $1 UNION SELECT DISTINCT unnest(tags) FROM "Deal" WHERE "workspaceId" = $1 UNION SELECT DISTINCT unnest(tags) FROM "Company" WHERE "workspaceId" = $1 LIMIT 300`, ws(ctx)),
  ]);
  return { pipelines: pipelines.length ? pipelines : [pipeline], members: members.map(m => ({ id: m.id, role: m.role, name: m.user.name ?? m.user.email, email: m.user.email, me: m.id === ctx.auth.membership.id })), fields, products, tags: tagRows.map(r => r.tag).filter(Boolean).sort(), role: ctx.auth.membership.role };
}

// ------------------------------------------------------------------ pipelines
const stageInput = z.object({ id: id.optional(), name: text(60).min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6254e8"), kind: z.enum(["OPEN", "WON", "LOST"]).default("OPEN"), probability: z.coerce.number().int().min(0).max(100).default(0) });
async function createPipeline(ctx: Ctx) {
  need(ctx, "admin");
  const input = parse(z.object({ name: text(80).min(1), stages: z.array(stageInput).min(2).max(20).optional() }), ctx.body);
  const stages = input.stages ?? [{ name: "Новая", color: "#6254e8", kind: "OPEN" as const, probability: 10 }, { name: "В работе", color: "#2f7fd8", kind: "OPEN" as const, probability: 50 }, { name: "Успешно", color: "#1f9d6b", kind: "WON" as const, probability: 100 }, { name: "Отказ", color: "#d0424f", kind: "LOST" as const, probability: 0 }];
  const count = await db.pipeline.count({ where: { workspaceId: ws(ctx) } });
  return db.pipeline.create({ data: { workspaceId: ws(ctx), name: input.name, sort: count, stages: { create: stages.map(({ id: _ignored, ...stage }, sort) => { void _ignored; return { ...stage, sort }; }) } }, include: { stages: { orderBy: { sort: "asc" } } } });
}
async function updatePipeline(ctx: Ctx, pipelineId: string) {
  need(ctx, "admin");
  const input = parse(z.object({ name: text(80).min(1).optional(), isDefault: z.boolean().optional(), stages: z.array(stageInput).min(2).max(20).optional() }), ctx.body);
  const pipeline = await owned(db.pipeline.findFirst({ where: { id: pipelineId, workspaceId: ws(ctx) }, include: { stages: true } }));
  if (input.isDefault) await db.pipeline.updateMany({ where: { workspaceId: ws(ctx), NOT: { id: pipeline.id } }, data: { isDefault: false } });
  await db.pipeline.update({ where: { id: pipeline.id }, data: { name: input.name, isDefault: input.isDefault } });
  if (input.stages) {
    if (!input.stages.some(s => s.kind === "OPEN")) throw new HttpError(400, "OPEN_STAGE_REQUIRED");
    const keep = new Set(input.stages.map(s => s.id).filter(Boolean));
    const ids: string[] = [];
    for (const [sort, stage] of input.stages.entries()) {
      if (stage.id && pipeline.stages.some(s => s.id === stage.id)) { await db.pipelineStage.update({ where: { id: stage.id }, data: { name: stage.name, color: stage.color, kind: stage.kind, probability: stage.probability, sort } }); ids.push(stage.id); }
      else ids.push((await db.pipelineStage.create({ data: { pipelineId: pipeline.id, name: stage.name, color: stage.color, kind: stage.kind, probability: stage.probability, sort } })).id);
    }
    const removed = pipeline.stages.filter(s => !keep.has(s.id));
    if (removed.length) {
      // Deals on a removed stage move to the first stage instead of disappearing.
      await db.deal.updateMany({ where: { stageId: { in: removed.map(s => s.id) } }, data: { stageId: ids[0], status: "OPEN", closedAt: null } });
      await db.pipelineStage.deleteMany({ where: { id: { in: removed.map(s => s.id) } } });
    }
  }
  return db.pipeline.findFirst({ where: { id: pipeline.id }, include: { stages: { orderBy: { sort: "asc" } } } });
}
async function deletePipeline(ctx: Ctx, pipelineId: string) {
  need(ctx, "admin");
  const pipelines = await db.pipeline.findMany({ where: { workspaceId: ws(ctx) }, select: { id: true, isDefault: true }, orderBy: { sort: "asc" } });
  if (pipelines.length < 2) throw new HttpError(409, "LAST_PIPELINE");
  const target = pipelines.find(p => p.id === pipelineId);
  if (!target) throw new HttpError(404, "NOT_FOUND");
  await db.pipeline.delete({ where: { id: target.id } });
  if (target.isDefault) await db.pipeline.update({ where: { id: pipelines.find(p => p.id !== target.id)!.id }, data: { isDefault: true } });
  return { ok: true };
}

// ------------------------------------------------------------------ deals
const dealInput = z.object({
  title: text(200).min(1), amount: money.optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  pipelineId: id.optional(), stageId: id.optional(), customerId: optId, companyId: optId, ownerMemberId: optId,
  expectedCloseAt: dateish, source: optText(80), tags, customFields,
});
async function listDeals(ctx: Ctx) {
  const q = ctx.url.searchParams;
  const pipelineId = q.get("pipelineId") ?? (await ensureDefaultPipeline(ws(ctx))).id;
  const search = q.get("q")?.trim();
  const where = {
    workspaceId: ws(ctx), pipelineId,
    ...(q.get("status") && q.get("status") !== "ALL" ? { status: q.get("status")! } : {}),
    ...(q.get("owner") === "me" ? { ownerMemberId: ctx.auth.membership.id } : q.get("owner") ? { ownerMemberId: q.get("owner")! } : {}),
    ...(q.get("tag") ? { tags: { has: q.get("tag")! } } : {}),
    ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { customer: { name: { contains: search, mode: "insensitive" as const } } }, { customer: { phone: { contains: search } } }, { company: { name: { contains: search, mode: "insensitive" as const } } }] } : {}),
  };
  const deals = await db.deal.findMany({ where, orderBy: [{ sort: "asc" }, { createdAt: "desc" }], take: 1000, include: { customer: { select: contactSelect }, company: { select: { id: true, name: true } }, owner: { select: memberSelect }, _count: { select: { crmTasks: { where: { completedAt: null } } } } } });
  const overdue = await db.crmTask.groupBy({ by: ["dealId"], where: { workspaceId: ws(ctx), dealId: { in: deals.map(d => d.id) }, completedAt: null, dueAt: { lt: new Date() } }, _count: { _all: true } });
  const overdueMap = new Map(overdue.map(o => [o.dealId, o._count._all]));
  return deals.map(({ _count, owner, ...deal }) => ({ ...deal, owner: owner ? { id: owner.id, name: owner.user.name ?? owner.user.email } : null, openTasks: _count.crmTasks, overdueTasks: overdueMap.get(deal.id) ?? 0 }));
}
async function dealDetail(ctx: Ctx, dealId: string) {
  const deal = await owned(db.deal.findFirst({ where: { id: dealId, workspaceId: ws(ctx) }, include: {
    stage: true, pipeline: { include: { stages: { orderBy: { sort: "asc" } } } }, customer: { select: { ...contactSelect, companyId: true } }, company: { select: { id: true, name: true } },
    owner: { select: memberSelect }, items: { orderBy: { id: "asc" } },
    crmTasks: { orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }], include: { assignee: { select: memberSelect } } },
    crmActivities: { orderBy: { createdAt: "desc" }, take: 100 },
  } }));
  return { ...deal, owner: deal.owner ? { id: deal.owner.id, name: deal.owner.user.name ?? deal.owner.user.email } : null, crmTasks: deal.crmTasks.map(t => ({ ...t, assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.user.name ?? t.assignee.user.email } : null })) };
}
async function resolveLinks(ctx: Ctx, input: { customerId?: string | null; companyId?: string | null; ownerMemberId?: string | null }) {
  if (input.customerId) await owned(db.customer.findFirst({ where: { id: input.customerId, workspaceId: ws(ctx) }, select: { id: true } }));
  if (input.companyId) await owned(db.company.findFirst({ where: { id: input.companyId, workspaceId: ws(ctx) }, select: { id: true } }));
  if (input.ownerMemberId !== undefined) await member(ctx, input.ownerMemberId);
}
async function createDeal(ctx: Ctx) {
  need(ctx, "write");
  const input = parse(dealInput.extend({ items: z.array(z.object({ productId: optId, name: text(200).min(1), price: money, quantity: z.coerce.number().min(0.001).max(1e6).default(1), discount: z.coerce.number().min(0).max(100).default(0) })).max(100).optional() }), ctx.body);
  await resolveLinks(ctx, input);
  const pipeline = input.pipelineId ? await owned(db.pipeline.findFirst({ where: { id: input.pipelineId, workspaceId: ws(ctx) }, include: { stages: { orderBy: { sort: "asc" } } } })) : await ensureDefaultPipeline(ws(ctx));
  const stage = (input.stageId ? pipeline.stages.find(s => s.id === input.stageId) : undefined) ?? pipeline.stages[0];
  let companyId = input.companyId ?? null;
  if (!companyId && input.customerId) companyId = (await db.customer.findFirst({ where: { id: input.customerId }, select: { companyId: true } }))?.companyId ?? null;
  const itemsTotal = input.items?.reduce((sum, item) => sum + item.price * item.quantity * (1 - item.discount / 100), 0);
  const deal = await db.deal.create({ data: {
    workspaceId: ws(ctx), pipelineId: pipeline.id, stageId: stage.id, title: input.title, amount: input.amount ?? itemsTotal ?? 0, currency: input.currency ?? "RUB",
    customerId: input.customerId ?? null, companyId, ownerMemberId: input.ownerMemberId ?? ctx.auth.membership.id, expectedCloseAt: input.expectedCloseAt, source: input.source ?? "manual",
    tags: input.tags ?? [], customFields: input.customFields, status: stage.kind, closedAt: stage.kind === "OPEN" ? null : new Date(), sort: -Date.now() / 1000,
    items: input.items?.length ? { create: input.items.map(item => ({ productId: item.productId ?? null, name: item.name, price: item.price, quantity: item.quantity, discount: item.discount })) } : undefined,
  } });
  await logActivity({ workspaceId: ws(ctx), type: "DEAL_CREATED", body: input.title, dealId: deal.id, customerId: deal.customerId, companyId: deal.companyId, ...author(ctx) });
  await emitDealEvent(ws(ctx), "deal.created", deal.id); drainJobsAfterResponse();
  return deal;
}
async function applyStage(ctx: Ctx, deal: { id: string; stageId: string; pipelineId: string; customerId: string | null; companyId: string | null }, stageId: string, extra: { lostReason?: string | null } = {}) {
  if (stageId === deal.stageId) return false;
  const [from, to] = await Promise.all([db.pipelineStage.findFirst({ where: { id: deal.stageId } }), db.pipelineStage.findFirst({ where: { id: stageId, pipeline: { workspaceId: ws(ctx) } } })]);
  if (!to) throw new HttpError(400, "UNKNOWN_STAGE");
  await db.deal.update({ where: { id: deal.id }, data: { stageId: to.id, pipelineId: to.pipelineId, status: to.kind, stageChangedAt: new Date(), closedAt: to.kind === "OPEN" ? null : new Date(), lostReason: to.kind === "LOST" ? (extra.lostReason ?? null) : null } });
  const type = to.kind === "WON" ? "DEAL_WON" : to.kind === "LOST" ? "DEAL_LOST" : "STAGE_CHANGED";
  await logActivity({ workspaceId: ws(ctx), type, body: to.kind === "LOST" ? (extra.lostReason ?? null) : null, meta: { from: from?.name ?? null, to: to.name }, dealId: deal.id, customerId: deal.customerId, companyId: deal.companyId, ...author(ctx) });
  await emitDealEvent(ws(ctx), to.kind === "WON" ? "deal.won" : to.kind === "LOST" ? "deal.lost" : "deal.updated", deal.id);
  return true;
}
async function updateDeal(ctx: Ctx, dealId: string) {
  need(ctx, "write");
  const input = parse(dealInput.partial().extend({ lostReason: optText(300) }), ctx.body);
  const deal = await owned(db.deal.findFirst({ where: { id: dealId, workspaceId: ws(ctx) } }));
  await resolveLinks(ctx, input);
  const { stageId, pipelineId, lostReason, ...fields } = input;
  void pipelineId;
  await db.deal.update({ where: { id: deal.id }, data: { ...fields, customFields: fields.customFields ?? undefined } });
  const moved = stageId ? await applyStage(ctx, deal, stageId, { lostReason }) : false;
  if (!moved && lostReason !== undefined && deal.status === "LOST") await db.deal.update({ where: { id: deal.id }, data: { lostReason } });
  if (!moved && Object.keys(fields).length) await emitDealEvent(ws(ctx), "deal.updated", deal.id);
  drainJobsAfterResponse();
  return dealDetail(ctx, deal.id);
}
async function moveDeal(ctx: Ctx, dealId: string) {
  need(ctx, "write");
  const input = parse(z.object({ stageId: id, sort: z.number().finite().optional(), lostReason: optText(300) }), ctx.body);
  const deal = await owned(db.deal.findFirst({ where: { id: dealId, workspaceId: ws(ctx) } }));
  await applyStage(ctx, deal, input.stageId, { lostReason: input.lostReason });
  if (input.sort !== undefined) await db.deal.update({ where: { id: deal.id }, data: { sort: input.sort } });
  drainJobsAfterResponse();
  return { ok: true };
}
async function dealItems(ctx: Ctx, dealId: string) {
  need(ctx, "write");
  const input = parse(z.object({ items: z.array(z.object({ productId: optId, name: text(200).min(1), price: money, quantity: z.coerce.number().min(0.001).max(1e6), discount: z.coerce.number().min(0).max(100).default(0) })).max(100), syncAmount: z.boolean().default(true) }), ctx.body);
  const deal = await owned(db.deal.findFirst({ where: { id: dealId, workspaceId: ws(ctx) }, select: { id: true } }));
  const productIds = input.items.map(i => i.productId).filter((v): v is string => Boolean(v));
  if (productIds.length && (await db.product.count({ where: { id: { in: productIds }, workspaceId: ws(ctx) } })) !== new Set(productIds).size) throw new HttpError(400, "UNKNOWN_PRODUCT");
  await db.dealItem.deleteMany({ where: { dealId: deal.id } });
  if (input.items.length) await db.dealItem.createMany({ data: input.items.map(item => ({ dealId: deal.id, productId: item.productId ?? null, name: item.name, price: item.price, quantity: item.quantity, discount: item.discount })) });
  if (input.syncAmount) await db.deal.update({ where: { id: deal.id }, data: { amount: Math.round(input.items.reduce((sum, item) => sum + item.price * item.quantity * (1 - item.discount / 100), 0) * 100) / 100 } });
  return dealDetail(ctx, deal.id);
}
async function deleteDeal(ctx: Ctx, dealId: string) {
  need(ctx, "write");
  const deal = await owned(db.deal.findFirst({ where: { id: dealId, workspaceId: ws(ctx) }, select: { id: true } }));
  await db.deal.delete({ where: { id: deal.id } });
  return { ok: true };
}

// ------------------------------------------------------------------ contacts
const contactInput = z.object({ name: text(120).min(1), phone: optText(40), email: z.string().trim().toLowerCase().email().max(200).nullish().or(z.literal("")).transform(v => (v ? v : null)), companyId: optId, ownerMemberId: optId, position: optText(120), source: optText(80), notes: optText(5000), tags, customFields });
async function listContacts(ctx: Ctx) {
  const q = ctx.url.searchParams;
  const page = Math.max(1, Number(q.get("page")) || 1), pageSize = Math.min(200, Math.max(10, Number(q.get("pageSize")) || 50));
  const search = q.get("q")?.trim();
  const where = {
    workspaceId: ws(ctx),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { phone: { contains: search } }, { email: { contains: search, mode: "insensitive" as const } }, { company: { name: { contains: search, mode: "insensitive" as const } } }] } : {}),
    ...(q.get("tag") ? { tags: { has: q.get("tag")! } } : {}),
    ...(q.get("owner") === "me" ? { ownerMemberId: ctx.auth.membership.id } : q.get("owner") === "none" ? { ownerMemberId: null } : q.get("owner") ? { ownerMemberId: q.get("owner")! } : {}),
    ...(q.get("companyId") ? { companyId: q.get("companyId")! } : {}),
    ...(q.get("channel") ? { conversations: { some: { channelType: q.get("channel")! } } } : {}),
    ...(q.get("hasDeals") === "open" ? { deals: { some: { status: "OPEN" } } } : q.get("hasDeals") === "none" ? { deals: { none: {} } } : {}),
  };
  const sort = q.get("sort") ?? "recent";
  const orderBy = sort === "name" ? [{ name: "asc" as const }] : sort === "created" ? [{ createdAt: "desc" as const }] : [{ lastActivityAt: { sort: "desc" as const, nulls: "last" as const } }, { createdAt: "desc" as const }];
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { company: { select: { id: true, name: true } }, owner: { select: memberSelect }, conversations: { select: { channelType: true }, distinct: ["channelType"] }, _count: { select: { deals: true, crmTasks: { where: { completedAt: null } } } } } }),
  ]);
  const dealSums = await db.deal.groupBy({ by: ["customerId"], where: { workspaceId: ws(ctx), customerId: { in: rows.map(r => r.id) }, status: { in: ["OPEN", "WON"] } }, _sum: { amount: true } });
  const sums = new Map(dealSums.map(d => [d.customerId, d._sum.amount ?? 0]));
  return { total, page, pageSize, rows: rows.map(({ conversations, owner, _count, ...c }) => ({ ...c, channels: conversations.map(v => v.channelType), owner: owner ? { id: owner.id, name: owner.user.name ?? owner.user.email } : null, deals: _count.deals, openTasks: _count.crmTasks, dealsAmount: sums.get(c.id) ?? 0 })) };
}
async function contactDetail(ctx: Ctx, contactId: string) {
  const c = await owned(db.customer.findFirst({ where: { id: contactId, workspaceId: ws(ctx) }, include: {
    company: { select: { id: true, name: true } }, owner: { select: memberSelect },
    conversations: { orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, channelType: true, status: true, summary: true, updatedAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, content: true, createdAt: true } } } },
    deals: { orderBy: { createdAt: "desc" }, include: { stage: { select: { name: true, color: true, kind: true } } } },
    crmTasks: { orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }], include: { assignee: { select: memberSelect } } },
    appointments: { orderBy: { startsAt: "desc" }, take: 20 },
    leads: { orderBy: { createdAt: "desc" }, take: 20 },
    crmActivities: { orderBy: { createdAt: "desc" }, take: 100 },
  } }));
  return { ...c, owner: c.owner ? { id: c.owner.id, name: c.owner.user.name ?? c.owner.user.email } : null, crmTasks: c.crmTasks.map(t => ({ ...t, assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.user.name ?? t.assignee.user.email } : null })) };
}
async function createContact(ctx: Ctx) {
  need(ctx, "write");
  const input = parse(contactInput, ctx.body);
  await resolveLinks(ctx, input);
  const contact = await db.customer.create({ data: { workspaceId: ws(ctx), name: input.name, phone: input.phone, email: input.email, companyId: input.companyId ?? null, ownerMemberId: input.ownerMemberId ?? ctx.auth.membership.id, position: input.position, source: input.source ?? "manual", notes: input.notes, tags: input.tags ?? [], customFields: input.customFields, lastActivityAt: new Date() } });
  await logActivity({ workspaceId: ws(ctx), type: "CONTACT_CREATED", customerId: contact.id, companyId: contact.companyId, ...author(ctx) });
  await enqueueCrmEvent(ws(ctx), "contact.created", contact); drainJobsAfterResponse();
  return contact;
}
async function updateContact(ctx: Ctx, contactId: string) {
  need(ctx, "write");
  const input = parse(contactInput.partial(), ctx.body);
  const contact = await owned(db.customer.findFirst({ where: { id: contactId, workspaceId: ws(ctx) }, select: { id: true } }));
  await resolveLinks(ctx, input);
  const updated = await db.customer.update({ where: { id: contact.id }, data: { ...input, customFields: input.customFields ?? undefined } });
  await enqueueCrmEvent(ws(ctx), "contact.updated", updated); drainJobsAfterResponse();
  return contactDetail(ctx, contact.id);
}
async function deleteContact(ctx: Ctx, contactId: string) {
  need(ctx, "admin");
  const contact = await owned(db.customer.findFirst({ where: { id: contactId, workspaceId: ws(ctx) }, select: { id: true } }));
  await db.customer.delete({ where: { id: contact.id } });
  return { ok: true };
}
async function bulkContacts(ctx: Ctx) {
  need(ctx, "write");
  const input = parse(z.object({ ids: z.array(id).min(1).max(500), action: z.enum(["tag", "untag", "assign", "company", "delete"]), value: z.string().trim().max(80).nullish() }), ctx.body);
  const rows = await db.customer.findMany({ where: { id: { in: input.ids }, workspaceId: ws(ctx) }, select: { id: true, tags: true } });
  if (input.action === "delete") { need(ctx, "admin"); await db.customer.deleteMany({ where: { id: { in: rows.map(r => r.id) } } }); return { updated: rows.length }; }
  if (input.action === "assign") { const ownerMemberId = await member(ctx, input.value || null); await db.customer.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { ownerMemberId } }); return { updated: rows.length }; }
  if (input.action === "company") { if (input.value) await owned(db.company.findFirst({ where: { id: input.value, workspaceId: ws(ctx) }, select: { id: true } })); await db.customer.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { companyId: input.value || null } }); return { updated: rows.length }; }
  const tag = input.value?.trim(); if (!tag) throw new HttpError(400, "TAG_REQUIRED");
  for (const row of rows) {
    const next = input.action === "tag" ? [...new Set([...row.tags, tag])] : row.tags.filter(t => t !== tag);
    if (next.length !== row.tags.length || next.some((t, i) => t !== row.tags[i])) await db.customer.update({ where: { id: row.id }, data: { tags: next } });
  }
  return { updated: rows.length };
}
async function mergeContacts(ctx: Ctx) {
  need(ctx, "admin");
  const input = parse(z.object({ targetId: id, sourceIds: z.array(id).min(1).max(20) }), ctx.body);
  const target = await owned(db.customer.findFirst({ where: { id: input.targetId, workspaceId: ws(ctx) } }));
  const sources = await db.customer.findMany({ where: { id: { in: input.sourceIds.filter(s => s !== target.id) }, workspaceId: ws(ctx) } });
  if (!sources.length) throw new HttpError(400, "NOTHING_TO_MERGE");
  const sourceIds = sources.map(s => s.id), where = { customerId: { in: sourceIds } };
  await db.conversation.updateMany({ where, data: { customerId: target.id } });
  await db.lead.updateMany({ where, data: { customerId: target.id } });
  await db.appointment.updateMany({ where, data: { customerId: target.id } });
  await db.deal.updateMany({ where, data: { customerId: target.id } });
  await db.crmTask.updateMany({ where, data: { customerId: target.id } });
  await db.crmActivity.updateMany({ where, data: { customerId: target.id } });
  const pick = <K extends "phone" | "email" | "position" | "companyId" | "ownerMemberId" | "notes">(key: K) => target[key] ?? sources.find(s => s[key])?.[key] ?? null;
  const fields = Object.assign({}, ...sources.map(s => (s.customFields && typeof s.customFields === "object" ? s.customFields : {})), target.customFields && typeof target.customFields === "object" ? target.customFields : {});
  await db.customer.deleteMany({ where: { id: { in: sourceIds } } });
  await db.customer.update({ where: { id: target.id }, data: { phone: pick("phone"), email: pick("email"), position: pick("position"), companyId: pick("companyId"), ownerMemberId: pick("ownerMemberId"), notes: [target.notes, ...sources.map(s => s.notes)].filter(Boolean).join("\n\n") || null, tags: [...new Set([...target.tags, ...sources.flatMap(s => s.tags)])], customFields: fields } });
  await logActivity({ workspaceId: ws(ctx), type: "CONTACT_MERGED", body: sources.map(s => s.name).join(", "), customerId: target.id, ...author(ctx) });
  return contactDetail(ctx, target.id);
}
async function duplicates(ctx: Ctx) {
  const rows = await db.customer.findMany({ where: { workspaceId: ws(ctx) }, select: { id: true, name: true, phone: true, email: true, createdAt: true }, take: 5000 });
  const groups = new Map<string, typeof rows>();
  for (const row of rows) for (const key of [row.phone ? `p:${normalizePhone(row.phone)}` : "", row.email ? `e:${row.email.toLowerCase()}` : ""].filter(k => k.length > 4)) { const list = groups.get(key) ?? []; list.push(row); groups.set(key, list); }
  const seen = new Set<string>();
  return [...groups.entries()].filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, contacts: list })).filter(g => { const sig = g.contacts.map(c => c.id).sort().join(","); if (seen.has(sig)) return false; seen.add(sig); return true; }).slice(0, 100);
}
async function importContacts(ctx: Ctx) {
  need(ctx, "write");
  const row = z.object({ name: z.string().trim().max(120).optional(), phone: z.string().trim().max(40).optional(), email: z.string().trim().max(200).optional(), company: z.string().trim().max(160).optional(), position: z.string().trim().max(120).optional(), tags: z.string().max(400).optional(), notes: z.string().max(5000).optional(), source: z.string().trim().max(80).optional() });
  const input = parse(z.object({ rows: z.array(row).min(1).max(2000), updateExisting: z.boolean().default(true) }), ctx.body);
  const existing = await db.customer.findMany({ where: { workspaceId: ws(ctx) }, select: { id: true, phone: true, email: true, tags: true } });
  const byPhone = new Map(existing.filter(e => e.phone).map(e => [normalizePhone(e.phone), e])), byEmail = new Map(existing.filter(e => e.email).map(e => [e.email!.toLowerCase(), e]));
  const companies = new Map((await db.company.findMany({ where: { workspaceId: ws(ctx) }, select: { id: true, name: true } })).map(c => [c.name.toLowerCase(), c.id]));
  let created = 0, updated = 0, skipped = 0;
  for (const r of input.rows) {
    const email = r.email && z.string().email().safeParse(r.email.toLowerCase()).success ? r.email.toLowerCase() : null;
    const phone = r.phone ? r.phone : null;
    const name = r.name || email || phone;
    if (!name) { skipped++; continue; }
    let companyId: string | null = null;
    if (r.company) { companyId = companies.get(r.company.toLowerCase()) ?? null; if (!companyId) { companyId = (await db.company.create({ data: { workspaceId: ws(ctx), name: r.company } })).id; companies.set(r.company.toLowerCase(), companyId); } }
    const rowTags = (r.tags ?? "").split(/[;,|]/).map(t => t.trim()).filter(Boolean).slice(0, 30);
    const match = (phone && byPhone.get(normalizePhone(phone))) || (email && byEmail.get(email));
    if (match) {
      if (!input.updateExisting) { skipped++; continue; }
      await db.customer.update({ where: { id: match.id }, data: { ...(r.name ? { name: r.name } : {}), ...(phone && !match.phone ? { phone } : {}), ...(email && !match.email ? { email } : {}), ...(companyId ? { companyId } : {}), ...(r.position ? { position: r.position } : {}), ...(r.notes ? { notes: r.notes } : {}), tags: [...new Set([...match.tags, ...rowTags])] } });
      updated++;
    } else {
      const c = await db.customer.create({ data: { workspaceId: ws(ctx), name, phone, email, companyId, position: r.position || null, notes: r.notes || null, tags: rowTags, source: r.source || "import", ownerMemberId: ctx.auth.membership.id } });
      if (phone) byPhone.set(normalizePhone(phone), { id: c.id, phone, email, tags: rowTags });
      if (email) byEmail.set(email, { id: c.id, phone, email, tags: rowTags });
      created++;
    }
  }
  return { created, updated, skipped };
}
async function exportContacts(ctx: Ctx) {
  const rows = await db.customer.findMany({ where: { workspaceId: ws(ctx) }, orderBy: { createdAt: "asc" }, take: 20000, include: { company: { select: { name: true } }, owner: { select: memberSelect } } });
  const header = ["name", "phone", "email", "company", "position", "tags", "source", "owner", "notes", "createdAt"];
  const lines = rows.map(r => [r.name, r.phone, r.email, r.company?.name, r.position, r.tags, r.source, r.owner?.user.name ?? r.owner?.user.email, r.notes, r.createdAt].map(csvEscape).join(","));
  return new NextResponse("﻿" + [header.join(","), ...lines].join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"` } });
}

// ------------------------------------------------------------------ companies
const companyInput = z.object({ name: text(160).min(1), website: optText(300), phone: optText(40), email: optText(200), address: optText(300), industry: optText(120), taxId: optText(40), notes: optText(5000), ownerMemberId: optId, tags, customFields });
async function listCompanies(ctx: Ctx) {
  const search = ctx.url.searchParams.get("q")?.trim();
  const rows = await db.company.findMany({ where: { workspaceId: ws(ctx), ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }, { email: { contains: search, mode: "insensitive" } }, { taxId: { contains: search } }] } : {}), ...(ctx.url.searchParams.get("tag") ? { tags: { has: ctx.url.searchParams.get("tag")! } } : {}) }, orderBy: { name: "asc" }, take: 1000, include: { owner: { select: memberSelect }, _count: { select: { contacts: true, deals: true } } } });
  const sums = new Map((await db.deal.groupBy({ by: ["companyId"], where: { workspaceId: ws(ctx), companyId: { in: rows.map(r => r.id) }, status: "WON" }, _sum: { amount: true } })).map(s => [s.companyId, s._sum.amount ?? 0]));
  return rows.map(({ owner, _count, ...c }) => ({ ...c, owner: owner ? { id: owner.id, name: owner.user.name ?? owner.user.email } : null, contacts: _count.contacts, deals: _count.deals, wonAmount: sums.get(c.id) ?? 0 }));
}
async function companyDetail(ctx: Ctx, companyId: string) {
  const c = await owned(db.company.findFirst({ where: { id: companyId, workspaceId: ws(ctx) }, include: { owner: { select: memberSelect }, contacts: { select: { ...contactSelect, position: true } }, deals: { orderBy: { createdAt: "desc" }, include: { stage: { select: { name: true, color: true, kind: true } } } }, crmTasks: { orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }] }, crmActivities: { orderBy: { createdAt: "desc" }, take: 100 } } }));
  return { ...c, owner: c.owner ? { id: c.owner.id, name: c.owner.user.name ?? c.owner.user.email } : null };
}
async function createCompany(ctx: Ctx) {
  need(ctx, "write");
  const input = parse(companyInput, ctx.body);
  if (input.ownerMemberId) await member(ctx, input.ownerMemberId);
  return db.company.create({ data: { ...input, workspaceId: ws(ctx), ownerMemberId: input.ownerMemberId ?? ctx.auth.membership.id, tags: input.tags ?? [] } });
}
async function updateCompany(ctx: Ctx, companyId: string) {
  need(ctx, "write");
  const input = parse(companyInput.partial(), ctx.body);
  const company = await owned(db.company.findFirst({ where: { id: companyId, workspaceId: ws(ctx) }, select: { id: true } }));
  if (input.ownerMemberId) await member(ctx, input.ownerMemberId);
  await db.company.update({ where: { id: company.id }, data: { ...input, customFields: input.customFields ?? undefined } });
  return companyDetail(ctx, company.id);
}
async function deleteCompany(ctx: Ctx, companyId: string) {
  need(ctx, "admin");
  const company = await owned(db.company.findFirst({ where: { id: companyId, workspaceId: ws(ctx) }, select: { id: true } }));
  await db.company.delete({ where: { id: company.id } });
  return { ok: true };
}

// ------------------------------------------------------------------ tasks
const taskInput = z.object({ title: text(200).min(1), description: optText(5000), type: z.enum(["TODO", "CALL", "MEETING", "EMAIL"]).default("TODO"), priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"), dueAt: dateish, assigneeMemberId: optId, customerId: optId, companyId: optId, dealId: optId });
async function listTasks(ctx: Ctx) {
  const q = ctx.url.searchParams;
  const status = q.get("status") ?? "open";
  return (await db.crmTask.findMany({
    where: { workspaceId: ws(ctx), ...(status === "open" ? { completedAt: null } : status === "done" ? { completedAt: { not: null } } : {}), ...(q.get("scope") === "mine" ? { assigneeMemberId: ctx.auth.membership.id } : q.get("assignee") ? { assigneeMemberId: q.get("assignee")! } : {}), ...(q.get("customerId") ? { customerId: q.get("customerId")! } : {}), ...(q.get("dealId") ? { dealId: q.get("dealId")! } : {}), ...(q.get("companyId") ? { companyId: q.get("companyId")! } : {}) },
    orderBy: status === "done" ? [{ completedAt: "desc" }] : [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], take: 500,
    include: { assignee: { select: memberSelect }, customer: { select: { id: true, name: true } }, deal: { select: { id: true, title: true } }, company: { select: { id: true, name: true } } },
  })).map(t => ({ ...t, assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.user.name ?? t.assignee.user.email } : null }));
}
async function checkTaskLinks(ctx: Ctx, input: { customerId?: string | null; companyId?: string | null; dealId?: string | null; assigneeMemberId?: string | null }) {
  await resolveLinks(ctx, { customerId: input.customerId, companyId: input.companyId });
  if (input.dealId) await owned(db.deal.findFirst({ where: { id: input.dealId, workspaceId: ws(ctx) }, select: { id: true } }));
  if (input.assigneeMemberId) await member(ctx, input.assigneeMemberId);
}
async function createTask(ctx: Ctx) {
  need(ctx, "write");
  const input = parse(taskInput, ctx.body);
  await checkTaskLinks(ctx, input);
  let customerId = input.customerId ?? null;
  if (!customerId && input.dealId) customerId = (await db.deal.findFirst({ where: { id: input.dealId }, select: { customerId: true } }))?.customerId ?? null;
  const task = await db.crmTask.create({ data: { ...input, customerId, workspaceId: ws(ctx), assigneeMemberId: input.assigneeMemberId ?? ctx.auth.membership.id, createdByUserId: ctx.auth.user.id } });
  await logActivity({ workspaceId: ws(ctx), type: "TASK_CREATED", body: task.title, meta: { dueAt: task.dueAt?.toISOString() ?? null }, customerId: task.customerId, companyId: task.companyId, dealId: task.dealId, ...author(ctx) });
  return task;
}
async function updateTask(ctx: Ctx, taskId: string) {
  need(ctx, "write");
  const input = parse(taskInput.partial().extend({ done: z.boolean().optional() }), ctx.body);
  const task = await owned(db.crmTask.findFirst({ where: { id: taskId, workspaceId: ws(ctx) } }));
  await checkTaskLinks(ctx, input);
  const { done, ...fields } = input;
  const updated = await db.crmTask.update({ where: { id: task.id }, data: { ...fields, ...(done === undefined ? {} : { completedAt: done ? new Date() : null }), ...(fields.dueAt !== undefined ? { remindedAt: null } : {}) } });
  if (done && !task.completedAt) await logActivity({ workspaceId: ws(ctx), type: "TASK_DONE", body: task.title, customerId: task.customerId, companyId: task.companyId, dealId: task.dealId, ...author(ctx) });
  return updated;
}
async function deleteTask(ctx: Ctx, taskId: string) {
  need(ctx, "write");
  const task = await owned(db.crmTask.findFirst({ where: { id: taskId, workspaceId: ws(ctx) }, select: { id: true } }));
  await db.crmTask.delete({ where: { id: task.id } });
  return { ok: true };
}

// ------------------------------------------------------------------ products
const productInput = z.object({ name: text(200).min(1), sku: optText(80), category: optText(120), description: optText(2000), price: money, currency: z.string().regex(/^[A-Z]{3}$/).default("RUB"), durationMin: z.coerce.number().int().min(0).max(24 * 60).nullish(), active: z.boolean().default(true) });
async function listProducts(ctx: Ctx) { return db.product.findMany({ where: { workspaceId: ws(ctx) }, orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }], take: 2000 }); }
async function createProduct(ctx: Ctx) { need(ctx, "write"); const input = parse(productInput, ctx.body); return db.product.create({ data: { ...input, workspaceId: ws(ctx) } }); }
async function updateProduct(ctx: Ctx, productId: string) { need(ctx, "write"); const input = parse(productInput.partial(), ctx.body); const p = await owned(db.product.findFirst({ where: { id: productId, workspaceId: ws(ctx) }, select: { id: true } })); return db.product.update({ where: { id: p.id }, data: input }); }
async function deleteProduct(ctx: Ctx, productId: string) { need(ctx, "write"); const p = await owned(db.product.findFirst({ where: { id: productId, workspaceId: ws(ctx) }, select: { id: true } })); await db.product.delete({ where: { id: p.id } }); return { ok: true }; }

// ------------------------------------------------------------------ activities & fields
async function createActivity(ctx: Ctx) {
  need(ctx, "write");
  const input = parse(z.object({ type: z.enum(["NOTE", "CALL", "MEETING", "EMAIL"]), body: text(10000).min(1), customerId: optId, companyId: optId, dealId: optId }), ctx.body);
  if (!input.customerId && !input.companyId && !input.dealId) throw new HttpError(400, "TARGET_REQUIRED");
  await resolveLinks(ctx, { customerId: input.customerId, companyId: input.companyId });
  let customerId = input.customerId ?? null;
  if (input.dealId) { const deal = await owned(db.deal.findFirst({ where: { id: input.dealId, workspaceId: ws(ctx) }, select: { customerId: true } })); customerId ??= deal.customerId; }
  await logActivity({ workspaceId: ws(ctx), type: input.type, body: input.body, customerId, companyId: input.companyId ?? null, dealId: input.dealId ?? null, ...author(ctx) });
  return { ok: true };
}
async function deleteActivity(ctx: Ctx, activityId: string) {
  need(ctx, "write");
  const activity = await owned(db.crmActivity.findFirst({ where: { id: activityId, workspaceId: ws(ctx) }, select: { id: true, type: true, authorUserId: true } }));
  if (!["NOTE", "CALL", "MEETING", "EMAIL"].includes(activity.type)) throw new HttpError(409, "SYSTEM_ACTIVITY");
  if (activity.authorUserId !== ctx.auth.user.id) need(ctx, "admin");
  await db.crmActivity.delete({ where: { id: activity.id } });
  return { ok: true };
}
const fieldInput = z.object({ entity: z.enum(["CUSTOMER", "DEAL", "COMPANY"]), label: text(80).min(1), type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN", "URL"]).default("TEXT"), options: z.array(z.string().trim().min(1).max(80)).max(50).default([]) });
async function createField(ctx: Ctx) {
  need(ctx, "admin");
  const input = parse(fieldInput, ctx.body);
  const base = input.label.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
  const count = await db.crmFieldDefinition.count({ where: { workspaceId: ws(ctx), entity: input.entity } });
  return db.crmFieldDefinition.create({ data: { ...input, workspaceId: ws(ctx), key: `${base}_${Date.now().toString(36)}`, sort: count } });
}
async function updateField(ctx: Ctx, fieldId: string) { need(ctx, "admin"); const input = parse(fieldInput.omit({ entity: true }).partial().extend({ sort: z.number().int().min(0).max(1000).optional() }), ctx.body); const f = await owned(db.crmFieldDefinition.findFirst({ where: { id: fieldId, workspaceId: ws(ctx) }, select: { id: true } })); return db.crmFieldDefinition.update({ where: { id: f.id }, data: input }); }
async function deleteField(ctx: Ctx, fieldId: string) { need(ctx, "admin"); const f = await owned(db.crmFieldDefinition.findFirst({ where: { id: fieldId, workspaceId: ws(ctx) }, select: { id: true } })); await db.crmFieldDefinition.delete({ where: { id: f.id } }); return { ok: true }; }

// ------------------------------------------------------------------ reports
async function reports(ctx: Ctx) {
  const q = ctx.url.searchParams;
  const days = Math.min(730, Math.max(7, Number(q.get("days")) || 90));
  const since = new Date(Date.now() - days * 86_400_000);
  const pipeline = q.get("pipelineId") ? await owned(db.pipeline.findFirst({ where: { id: q.get("pipelineId")!, workspaceId: ws(ctx) }, include: { stages: { orderBy: { sort: "asc" } } } })) : await ensureDefaultPipeline(ws(ctx));
  const [byStage, deals, tasksOverdue, tasksOpen, newContacts, activities] = await Promise.all([
    db.deal.groupBy({ by: ["stageId"], where: { workspaceId: ws(ctx), pipelineId: pipeline.id }, _count: { _all: true }, _sum: { amount: true } }),
    db.deal.findMany({ where: { workspaceId: ws(ctx), pipelineId: pipeline.id, OR: [{ createdAt: { gte: since } }, { closedAt: { gte: since } }] }, select: { amount: true, status: true, source: true, createdAt: true, closedAt: true, ownerMemberId: true, lostReason: true } }),
    db.crmTask.count({ where: { workspaceId: ws(ctx), completedAt: null, dueAt: { lt: new Date() } } }),
    db.crmTask.count({ where: { workspaceId: ws(ctx), completedAt: null } }),
    db.customer.count({ where: { workspaceId: ws(ctx), createdAt: { gte: since } } }),
    db.crmActivity.count({ where: { workspaceId: ws(ctx), createdAt: { gte: since }, type: { in: ["NOTE", "CALL", "MEETING", "EMAIL"] } } }),
  ]);
  const stageMap = new Map(byStage.map(s => [s.stageId, s]));
  const won = deals.filter(d => d.status === "WON" && d.closedAt && d.closedAt >= since), lost = deals.filter(d => d.status === "LOST" && d.closedAt && d.closedAt >= since);
  const sum = (list: typeof deals) => Math.round(list.reduce((s, d) => s + d.amount, 0) * 100) / 100;
  const months: Array<{ month: string; won: number; count: number }> = [];
  for (let i = Math.min(11, Math.ceil(days / 30)); i >= 0; i--) { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); months.push({ month: d.toISOString().slice(0, 7), won: 0, count: 0 }); }
  for (const d of won) { const m = months.find(x => x.month === d.closedAt!.toISOString().slice(0, 7)); if (m) { m.won += d.amount; m.count++; } }
  const group = <K extends string>(list: typeof deals, key: (d: (typeof deals)[number]) => K) => { const map = new Map<K, { count: number; amount: number; won: number }>(); for (const d of list) { const k = key(d); const v = map.get(k) ?? { count: 0, amount: 0, won: 0 }; v.count++; v.amount += d.amount; if (d.status === "WON") v.won++; map.set(k, v); } return [...map.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.count - a.count); };
  const members = await db.workspaceMember.findMany({ where: { workspaceId: ws(ctx) }, select: memberSelect });
  const memberName = new Map(members.map(m => [m.id, m.user.name ?? m.user.email]));
  const cycle = won.filter(d => d.closedAt).map(d => (d.closedAt!.getTime() - d.createdAt.getTime()) / 86_400_000);
  return {
    pipeline: { id: pipeline.id, name: pipeline.name }, days,
    funnel: pipeline.stages.map(s => ({ stageId: s.id, name: s.name, color: s.color, kind: s.kind, count: stageMap.get(s.id)?._count._all ?? 0, amount: stageMap.get(s.id)?._sum.amount ?? 0, probability: s.probability })),
    forecast: pipeline.stages.filter(s => s.kind === "OPEN").reduce((acc, s) => acc + (stageMap.get(s.id)?._sum.amount ?? 0) * s.probability / 100, 0),
    totals: { created: deals.filter(d => d.createdAt >= since).length, won: won.length, lost: lost.length, wonAmount: sum(won), lostAmount: sum(lost), winRate: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null, avgDeal: won.length ? Math.round(sum(won) / won.length) : 0, avgCycleDays: cycle.length ? Math.round(cycle.reduce((a, b) => a + b, 0) / cycle.length * 10) / 10 : null, tasksOverdue, tasksOpen, newContacts, activities },
    revenueByMonth: months,
    bySource: group(deals.filter(d => d.createdAt >= since), d => d.source || "—"),
    byOwner: group(deals, d => d.ownerMemberId ?? "none").map(r => ({ ...r, name: r.key === "none" ? "—" : memberName.get(r.key) ?? "—" })),
    lostReasons: group(lost, d => (d.lostReason || "—") as string).slice(0, 8),
  };
}

// ------------------------------------------------------------------ health (diagnostics for owners)
async function health(ctx: Ctx) {
  need(ctx, "admin");
  const started = Date.now();
  await crmSchemaReady();
  const probe = async <T,>(run: () => Promise<T>) => { const t = Date.now(); try { return { ok: true, ms: Date.now() - t, value: await run() }; } catch (error) { return { ok: false, ms: Date.now() - t, error: errorText(error) }; } };
  const crmTables = ["Company", "Pipeline", "PipelineStage", "Deal", "DealItem", "Product", "CrmTask", "CrmActivity", "CrmFieldDefinition"];
  const [tables, customerColumns, idTypes, marker, read, write] = await Promise.all([
    probe(() => db.$queryRawUnsafe<Array<{ table_name: string }>>(`SELECT table_name::text AS table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, crmTables).then(r => crmTables.map(name => ({ name, exists: r.some(x => x.table_name === name) })))),
    probe(() => db.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(`SELECT column_name::text AS column_name, data_type::text AS data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Customer' ORDER BY ordinal_position`)),
    probe(() => db.$queryRawUnsafe<Array<{ table_name: string; data_type: string }>>(`SELECT table_name::text AS table_name, data_type::text AS data_type FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'id' AND table_name IN ('Workspace','WorkspaceMember','Lead','Customer','User','Conversation')`)),
    probe(() => db.$queryRawUnsafe<Array<{ version: string }>>(`SELECT "version" FROM "_lemiri_schema"`)),
    probe(() => db.pipeline.count({ where: { workspaceId: ws(ctx) } })),
    probe(() => db.$transaction(async tx => (tx as unknown as { $queryRawUnsafe: (q: string) => Promise<unknown> }).$queryRawUnsafe("SELECT 1 AS ok"))),
  ]);
  return { ms: Date.now() - started, schema: schemaStatus, marker, tables, customerColumns, idTypes, read, write };
}
function errorText(error: unknown) {
  const e = error as { code?: string; message?: string; meta?: unknown };
  return { code: e?.code ?? "", message: String(e?.message ?? error).replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgres://***").slice(0, 500), meta: e?.meta ? JSON.stringify(e.meta).slice(0, 300) : undefined };
}

// ------------------------------------------------------------------ router
type Handler = (ctx: Ctx, ...args: string[]) => Promise<unknown>;
const routes: Array<[string, RegExp, Handler]> = [
  ["GET", /^bootstrap$/, bootstrap], ["GET", /^health$/, health],
  ["POST", /^pipelines$/, createPipeline], ["PATCH", /^pipelines\/([^/]+)$/, updatePipeline], ["DELETE", /^pipelines\/([^/]+)$/, deletePipeline],
  ["GET", /^deals$/, listDeals], ["POST", /^deals$/, createDeal], ["GET", /^deals\/([^/]+)$/, dealDetail], ["PATCH", /^deals\/([^/]+)$/, updateDeal], ["DELETE", /^deals\/([^/]+)$/, deleteDeal], ["POST", /^deals\/([^/]+)\/move$/, moveDeal], ["PUT", /^deals\/([^/]+)\/items$/, dealItems],
  ["GET", /^contacts$/, listContacts], ["POST", /^contacts$/, createContact], ["GET", /^contacts\/export$/, exportContacts], ["GET", /^contacts\/duplicates$/, duplicates], ["POST", /^contacts\/import$/, importContacts], ["POST", /^contacts\/bulk$/, bulkContacts], ["POST", /^contacts\/merge$/, mergeContacts],
  ["GET", /^contacts\/([^/]+)$/, contactDetail], ["PATCH", /^contacts\/([^/]+)$/, updateContact], ["DELETE", /^contacts\/([^/]+)$/, deleteContact],
  ["GET", /^companies$/, listCompanies], ["POST", /^companies$/, createCompany], ["GET", /^companies\/([^/]+)$/, companyDetail], ["PATCH", /^companies\/([^/]+)$/, updateCompany], ["DELETE", /^companies\/([^/]+)$/, deleteCompany],
  ["GET", /^tasks$/, listTasks], ["POST", /^tasks$/, createTask], ["PATCH", /^tasks\/([^/]+)$/, updateTask], ["DELETE", /^tasks\/([^/]+)$/, deleteTask],
  ["GET", /^products$/, listProducts], ["POST", /^products$/, createProduct], ["PATCH", /^products\/([^/]+)$/, updateProduct], ["DELETE", /^products\/([^/]+)$/, deleteProduct],
  ["POST", /^activities$/, createActivity], ["DELETE", /^activities\/([^/]+)$/, deleteActivity],
  ["POST", /^fields$/, createField], ["PATCH", /^fields\/([^/]+)$/, updateField], ["DELETE", /^fields\/([^/]+)$/, deleteField],
  ["GET", /^reports$/, reports],
];

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (request.method !== "GET" && !validateRequestOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const path = (await params).path.join("/");
  const route = routes.find(([method, pattern]) => method === request.method && pattern.test(path));
  if (!route) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const match = path.match(route[1])!;
  const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.json().catch(() => null);
  try {
    const result = await route[2]({ auth, request, url: new URL(request.url), params: match.slice(1), body }, ...match.slice(1));
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true }, { status: request.method === "POST" ? 201 : 200 });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.code }, { status: error.status });
    const detail = errorText(error);
    console.error("CRM request failed", request.method, path, detail.code, detail.message);
    // The short reason is shown to signed-in users on the error card, so a failure can be reported precisely.
    return NextResponse.json({ error: "CRM_FAILED", code: detail.code || undefined, detail: detail.message.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 240) }, { status: 500 });
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
