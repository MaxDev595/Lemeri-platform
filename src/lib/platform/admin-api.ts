// Admin panel endpoints, served through /api/settings (?scope=platform and POST)
// so the size-limited Worker gets no new route. Only platform admins pass.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isPlatformAdmin, readPlatformAssistant, savePlatformAssistant } from "./settings";

type Auth = { user: { id: string; email: string }; workspaceId: string; locale: "ru" | "en" };

async function status(auth: Auth) {
  const settings = await readPlatformAssistant();
  const employee = settings.employeeId ? await db.aIEmployee.findUnique({ where: { id: settings.employeeId }, select: { id: true, name: true, status: true, workspaceId: true, workspace: { select: { name: true } } } }) : null;
  const channel = employee ? await db.channel.findFirst({ where: { workspaceId: employee.workspaceId, type: "WEBSITE" }, select: { status: true } }) : null;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [dialogs, leads] = employee ? await Promise.all([
    db.conversation.count({ where: { employeeId: employee.id, createdAt: { gte: since } } }),
    db.lead.count({ where: { workspaceId: employee.workspaceId, createdAt: { gte: since } } }),
  ]) : [0, 0];
  return {
    settings,
    employee: employee ? { id: employee.id, name: employee.name, status: employee.status, workspace: employee.workspace.name } : null,
    cardConnected: channel?.status === "CONNECTED",
    inThisWorkspace: Boolean(employee && employee.workspaceId === auth.workspaceId),
    stats: { dialogs, leads },
    model: { provider: process.env.AI_PROVIDER ?? "mock", configured: Boolean(process.env.OPENAI_API_KEY?.trim()), name: process.env.OPENAI_RESPONSE_MODEL || "gpt-4.1-mini" },
    // P2P transfers waiting for a decision, then the latest decisions.
    ...await Promise.all([import("@/lib/billing/p2p-store"), import("@/lib/billing/p2p-admin")]).then(async ([store, admin]) => {
      const [payments, stats, transfers, refunds] = await Promise.all([store.adminPayments().catch(() => []), admin.paymentStats().catch(() => null), admin.walletTransfers().catch(() => null), admin.refundRequests().catch(() => [])]);
      return { payments, sales: stats, transfers, refunds };
    }),
    p2pConfigured: await import("@/lib/billing/p2p").then(m => m.p2pConfig().configured || m.cryptoConfig().configured),
    // Who uses the AI seller and on which sites (null when the query fails).
    usage: await import("./usage").then(m => m.assistantUsage(settings.workspaceId)).catch(error => { console.error("Admin usage failed", error instanceof Error ? error.message : error); return null; }),
  };
}

export async function platformAdminGet(auth: Auth) {
  if (!isPlatformAdmin(auth.user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await status(auth), { headers: { "cache-control": "private, no-store" } });
}

export async function platformAdminPost(auth: Auth, body: unknown) {
  if (!isPlatformAdmin(auth.user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const v = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (v.action === "provision") {
    const { provisionAdminWorkspace } = await import("./admin");
    await provisionAdminWorkspace({ userId: auth.user.id, workspaceId: auth.workspaceId, locale: auth.locale });
  } else if (v.action === "payment") {
    if (typeof v.id !== "string" || (v.decision !== "confirm" && v.decision !== "reject")) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const { decidePayment } = await import("@/lib/billing/p2p-store");
    const decided = await decidePayment(v.id, v.decision, auth.user.id);
    if (!decided) return NextResponse.json({ error: "ALREADY_DECIDED" }, { status: 409 });
    return NextResponse.json(await status(auth));
  } else if (v.action === "refund") {
    if (typeof v.id !== "string" || (v.decision !== "approve" && v.decision !== "reject") || (v.reason !== undefined && (typeof v.reason !== "string" || v.reason.length > 300))) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const { decideRefund } = await import("@/lib/billing/p2p-admin");
    const decided = await decideRefund(v.id, v.decision, auth.user.id, typeof v.reason === "string" ? v.reason.trim() : "");
    if (!decided) return NextResponse.json({ error: "ALREADY_DECIDED" }, { status: 409 });
    return NextResponse.json(await status(auth));
  } else if (v.action === "grant") {
    // Switch a plan on by account email (optionally for a received USDT transfer).
    const plan = v.plan === "CUSTOM" ? "CUSTOM" : v.plan === "STARTER" ? "STARTER" : null;
    const interval = v.interval === "year" ? "year" : v.interval === "month" ? "month" : null;
    if (typeof v.email !== "string" || !v.email.includes("@") || v.email.length > 200 || !plan || !interval || (v.txId !== undefined && (typeof v.txId !== "string" || !/^[0-9a-f]{64}$/i.test(v.txId)))) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const { grantPlan } = await import("@/lib/billing/p2p-admin");
    const result = await grantPlan({ email: v.email, plan, interval, txId: typeof v.txId === "string" ? v.txId.toLowerCase() : undefined, adminUserId: auth.user.id });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error === "USER_NOT_FOUND" || result.error === "TX_NOT_FOUND" ? 404 : 409 });
    return NextResponse.json(await status(auth));
  } else if (v.action === "assistant") {
    const patch: { landing?: boolean; app?: boolean } = {};
    if (typeof v.landing === "boolean") patch.landing = v.landing;
    if (typeof v.app === "boolean") patch.app = v.app;
    await savePlatformAssistant(patch);
  } else return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "PLATFORM_ASSISTANT_UPDATED", entityType: "Platform", entityId: "assistant", metadata: { action: String(v.action) } } });
  return NextResponse.json(await status(auth));
}
