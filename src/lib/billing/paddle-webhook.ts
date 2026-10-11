import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isStaleStripeEvent as isStaleEvent } from "./stripe";
import { paddlePlanFromPriceId, paddleStatus, verifyPaddleSignature } from "./paddle";

// Paddle webhook (served by app/api/webhooks/[type]/route.ts as /api/webhooks/paddle): subscription.* events set plan, status and period; transaction.completed
// binds the Paddle customer/subscription to the workspace from custom_data. Events are
// applied in order per workspace (advisory lock + last applied event), like Stripe's.

type PaddleSubscription = { id?: string; customer_id?: string; status?: string; custom_data?: { workspaceId?: string; plan?: string; interval?: string } | null; items?: Array<{ price?: { id?: string } }>; current_billing_period?: { starts_at?: string; ends_at?: string } | null; scheduled_change?: { action?: string } | null; next_billed_at?: string | null };
type PaddleTransaction = { id?: string; customer_id?: string; subscription_id?: string | null; custom_data?: { workspaceId?: string; plan?: string; interval?: string } | null; billing_period?: { starts_at?: string; ends_at?: string } | null };
type PaddleEvent = { event_id?: string; event_type?: string; occurred_at?: string; data?: PaddleSubscription & PaddleTransaction };

async function applyEvent(workspaceId: string, event: { id: string; createdAt: Date }, mutation: (tx: Prisma.TransactionClient) => Promise<void>) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lemiri:billing:${workspaceId}`}, 0))`;
    const rows = await tx.$queryRaw<Array<{ providerEventId: string | null; providerEventCreatedAt: Date | null }>>`SELECT "providerEventId", "providerEventCreatedAt" FROM "Subscription" WHERE "workspaceId"=${workspaceId}`;
    if (isStaleEvent(rows[0] ? { id: rows[0].providerEventId, createdAt: rows[0].providerEventCreatedAt } : undefined, event)) return false;
    await mutation(tx);
    await tx.$executeRaw`UPDATE "Subscription" SET "providerEventId"=${event.id}, "providerEventCreatedAt"=${event.createdAt} WHERE "workspaceId"=${workspaceId}`;
    return true;
  });
}
const date = (value: string | null | undefined, fallback: Date) => { const parsed = value ? new Date(value) : null; return parsed && Number.isFinite(parsed.getTime()) ? parsed : fallback; };

export async function handlePaddleWebhook(request: Request) {
  const raw = await request.text();
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret || !await verifyPaddleSignature(raw, request.headers.get("paddle-signature") ?? "", secret)) return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  let event: PaddleEvent;
  try { event = JSON.parse(raw) as PaddleEvent; } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const data = event.data;
  const occurred = event.occurred_at ? new Date(event.occurred_at) : null;
  if (!event.event_id || !event.event_type || !data || !occurred || !Number.isFinite(occurred.getTime())) return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
  const cursor = { id: event.event_id, createdAt: occurred };

  if (event.event_type === "transaction.completed") {
    const workspaceId = String(data.custom_data?.workspaceId ?? "");
    const plan = data.custom_data?.plan === "STARTER" || data.custom_data?.plan === "CUSTOM" ? data.custom_data.plan : null;
    if (!workspaceId || !plan || !data.subscription_id) return NextResponse.json({ received: true, ignored: "NOT_A_SUBSCRIPTION_CHECKOUT" });
    if (!await db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })) return NextResponse.json({ received: true, ignored: "UNKNOWN_WORKSPACE" });
    // Fallback period when Paddle omits it: a year for yearly checkouts, a month otherwise.
    const end = date(data.billing_period?.ends_at, new Date(Date.now() + (data.custom_data?.interval === "year" ? 365 : 30) * 86400_000));
    const applied = await applyEvent(workspaceId, cursor, async tx => { await tx.subscription.upsert({ where: { workspaceId }, create: { workspaceId, provider: "PADDLE", externalCustomerId: data.customer_id ?? null, externalPlanId: data.subscription_id ?? null, plan, status: "ACTIVE", currentPeriodStart: date(data.billing_period?.starts_at, new Date()), currentPeriodEnd: end }, update: { provider: "PADDLE", externalCustomerId: data.customer_id ?? undefined, externalPlanId: data.subscription_id ?? undefined } }); });
    return NextResponse.json({ received: true, ...(!applied ? { ignored: "STALE_EVENT" } : {}) });
  }

  if (event.event_type.startsWith("subscription.")) {
    const subscriptionId = String(data.id ?? "");
    const customerId = String(data.customer_id ?? "");
    const boundWorkspace = String(data.custom_data?.workspaceId ?? "");
    const existing = await db.subscription.findFirst({ where: { OR: [...(subscriptionId ? [{ externalPlanId: subscriptionId }] : []), ...(customerId ? [{ externalCustomerId: customerId }] : [])] } });
    if (existing && boundWorkspace && existing.workspaceId !== boundWorkspace) return NextResponse.json({ received: true, ignored: "WORKSPACE_BINDING_MISMATCH" });
    const workspaceId = existing?.workspaceId ?? boundWorkspace;
    if (!workspaceId) return NextResponse.json({ received: true, ignored: "MISSING_WORKSPACE_BINDING" });
    if (!existing && !await db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })) return NextResponse.json({ received: true, ignored: "UNKNOWN_WORKSPACE" });
    const status = paddleStatus(String(data.status ?? ""));
    const plan = paddlePlanFromPriceId(String(data.items?.[0]?.price?.id ?? "")) ?? (status !== "ACTIVE" && status !== "TRIALING" && (existing?.plan === "STARTER" || existing?.plan === "CUSTOM") ? existing.plan : null);
    if (!plan) return NextResponse.json({ received: true, ignored: "UNKNOWN_PRICE" });
    const start = date(data.current_billing_period?.starts_at, existing?.currentPeriodStart ?? new Date());
    // A canceled subscription keeps the paid period it already had.
    const end = date(data.current_billing_period?.ends_at, existing?.currentPeriodEnd ?? new Date());
    const values = { provider: "PADDLE", externalCustomerId: customerId || existing?.externalCustomerId || null, externalPlanId: subscriptionId || existing?.externalPlanId || null, plan, status, currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: data.scheduled_change?.action === "cancel" };
    const applied = await applyEvent(workspaceId, cursor, async tx => { await tx.subscription.upsert({ where: { workspaceId }, create: { workspaceId, ...values }, update: values }); });
    if (!applied) return NextResponse.json({ received: true, ignored: "STALE_EVENT" });
  }
  return NextResponse.json({ received: true });
}
