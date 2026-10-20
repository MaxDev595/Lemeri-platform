import { db } from "@/lib/db";
import { planPriceUsd, normalizePlan, type BillingInterval } from "./plans";
import { cryptoConfig, paymentCode, SUPPORT_EMAIL, type P2PPlan } from "./p2p";
import { decidePayment, ensureTable, fetchTonTransfers, type PaymentMethod } from "./p2p-store";

// Admin-only billing views (sales stats, wallet deposits, manual grants). Kept out
// of p2p-store so the code is bundled with the admin endpoint only.

export type WalletTransfer = { txId: string; amount: number; time: string; fromName: string | null; from: string | null; requestId: string | null; workspace: string | null; ownerEmail: string | null; plan: string | null; status: string | null };
/** Admin panel: the latest incoming USDT transfers and which payment (account) each one paid. */
export async function walletTransfers(limit = 30): Promise<WalletTransfer[] | null> {
  const config = cryptoConfig();
  if (!config.configured) return [];
  const transfers = await fetchTonTransfers(config.address, undefined, limit);
  if (!transfers) return null;
  await ensureTable();
  const ids = transfers.map(t => t.id);
  const linked = ids.length ? await db.$queryRawUnsafe<Array<{ txId: string; id: string; plan: string; status: string; workspace: string; ownerEmail: string | null }>>(
    `SELECT p."txId", p."id", p."plan", p."status", w."name" AS "workspace", (SELECT u."email" FROM "WorkspaceMember" m JOIN "User" u ON u."id" = m."userId" WHERE m."workspaceId" = p."workspaceId" AND m."role" = 'OWNER' ORDER BY m."id" LIMIT 1) AS "ownerEmail"
     FROM "PaymentRequest" p JOIN "Workspace" w ON w."id" = p."workspaceId" WHERE p."txId" = ANY($1::text[])`, ids) : [];
  const byTx = new Map(linked.map(row => [row.txId, row]));
  return transfers.sort((a, b) => b.time - a.time).map(t => {
    const row = byTx.get(t.id);
    return { txId: t.id, amount: Number(t.value) / 1_000_000, time: new Date(t.time).toISOString(), fromName: t.fromName ?? null, from: t.from ?? null, requestId: row?.id ?? null, workspace: row?.workspace ?? null, ownerEmail: row?.ownerEmail ?? null, plan: row?.plan ?? null, status: row?.status ?? null };
  });
}

/**
 * Admin: switch a plan on for an account by its email — for a transfer that came
 * without an invoice (or with a wrong amount), or as a manual grant. With `txId`
 * the transfer must be a real incoming USDT transfer not used before.
 */
export async function grantPlan(input: { email: string; plan: P2PPlan; interval: BillingInterval; txId?: string; adminUserId: string }) {
  await ensureTable();
  const email = input.email.trim().toLowerCase();
  const member = await db.$queryRawUnsafe<Array<{ workspaceId: string; userId: string }>>(
    `SELECT m."workspaceId", m."userId" FROM "WorkspaceMember" m JOIN "User" u ON u."id" = m."userId" WHERE lower(u."email") = $1 ORDER BY CASE WHEN m."role" = 'OWNER' THEN 0 ELSE 1 END, m."id" LIMIT 1`, email);
  if (!member[0]) return { error: "USER_NOT_FOUND" as const };
  let amount = planPriceUsd(input.plan, input.interval), method: PaymentMethod = "transfer", txId: string | null = null;
  if (input.txId) {
    const config = cryptoConfig();
    const transfer = config.configured ? (await fetchTonTransfers(config.address))?.find(t => t.id === input.txId) : undefined;
    if (!transfer) return { error: "TX_NOT_FOUND" as const };
    const used = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "PaymentRequest" WHERE "txId" = $1`, transfer.id);
    if (used.length) return { error: "TX_USED" as const };
    amount = Number(transfer.value) / 1_000_000; method = "crypto"; txId = transfer.id;
  }
  const id = crypto.randomUUID();
  await db.$executeRawUnsafe(`INSERT INTO "PaymentRequest" ("id","workspaceId","userId","plan","interval","amount","currency","code","payerName","note","method","txId") VALUES ($1,$2,$3,$4,$5,$6,'USDT',$7,'',$8,$9,$10)`,
    id, member[0].workspaceId, member[0].userId, input.plan, input.interval, amount, paymentCode(member[0].workspaceId), txId ? "привязано админом" : "выдано админом", method, txId);
  const request = await decidePayment(id, "confirm", input.adminUserId);
  return request ? { ok: true as const, id } : { error: "FAILED" as const };
}

export type AdminRefund = { id: string; workspace: string; ownerEmail: string | null; plan: string; interval: string; amount: number; currency: string; comment: string; status: string; createdAt: string; decidedAt: string | null; paidMethod: string | null; paidTx: string | null; paidFrom: string | null; periodEnd: string | null };
/** Admin panel: refund requests, open ones first, with the payment being cancelled. */
export async function refundRequests(limit = 20): Promise<AdminRefund[]> {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<Array<{ id: string; workspace: string; ownerEmail: string | null; plan: string; interval: string; amount: string | number; currency: string; note: string | null; status: string; createdAt: Date; decidedAt: Date | null; paidMethod: string | null; paidTx: string | null; paidFrom: string | null; periodEnd: Date | null }>>(
    `SELECT r."id", w."name" AS "workspace", r."plan", r."interval", r."amount", r."currency", r."note", r."status", r."createdAt", r."decidedAt",
       (SELECT u."email" FROM "WorkspaceMember" m JOIN "User" u ON u."id" = m."userId" WHERE m."workspaceId" = r."workspaceId" AND m."role" = 'OWNER' ORDER BY m."id" LIMIT 1) AS "ownerEmail",
       p."method" AS "paidMethod", p."txId" AS "paidTx", p."payerName" AS "paidFrom", s."currentPeriodEnd" AS "periodEnd"
     FROM "PaymentRequest" r JOIN "Workspace" w ON w."id" = r."workspaceId"
     LEFT JOIN LATERAL (SELECT "method", "txId", "payerName" FROM "PaymentRequest" x WHERE x."workspaceId" = r."workspaceId" AND x."status" IN ('CONFIRMED','REFUNDED') AND x."method" <> 'refund' AND x."createdAt" < r."createdAt" ORDER BY x."createdAt" DESC LIMIT 1) p ON true
     LEFT JOIN "Subscription" s ON s."workspaceId" = r."workspaceId"
     WHERE r."method" = 'refund' AND r."status" <> 'CANCELED'
     ORDER BY CASE WHEN r."status" = 'PENDING' THEN 0 ELSE 1 END, r."createdAt" DESC LIMIT $1`, limit);
  return rows.map(row => ({ id: row.id, workspace: row.workspace, ownerEmail: row.ownerEmail, plan: row.plan, interval: row.interval, amount: Number(row.amount), currency: row.currency, comment: row.note ?? "", status: row.status, createdAt: new Date(row.createdAt).toISOString(), decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : null, paidMethod: row.paidMethod, paidTx: row.paidTx, paidFrom: row.paidFrom || null, periodEnd: row.periodEnd ? new Date(row.periodEnd).toISOString() : null }));
}

/**
 * Admin decision on a refund request. Approving ends the plan now and marks the
 * cancelled payment REFUNDED (the money itself is returned by hand); rejecting
 * keeps the plan and tells the customer to write to support.
 */
export async function decideRefund(id: string, decision: "approve" | "reject", adminUserId: string, reason = "") {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<Array<{ workspaceId: string; createdAt: Date }>>(`UPDATE "PaymentRequest" SET "status" = $2, "decidedAt" = CURRENT_TIMESTAMP, "decidedBy" = $3 WHERE "id" = $1 AND "method" = 'refund' AND "status" = 'PENDING' RETURNING "workspaceId", "createdAt"`, id, decision === "approve" ? "CONFIRMED" : "REJECTED", adminUserId);
  const request = rows[0];
  if (!request) return null;
  const ru = !(await db.workspaceSettings.findUnique({ where: { workspaceId: request.workspaceId }, select: { locale: true } }).catch(() => null))?.locale?.startsWith("en");
  if (decision === "approve") {
    const now = new Date();
    await db.subscription.updateMany({ where: { workspaceId: request.workspaceId, provider: "P2P" }, data: { status: "CANCELED", currentPeriodEnd: now, cancelAtPeriodEnd: false } });
    await db.$executeRawUnsafe(`UPDATE "PaymentRequest" SET "status" = 'REFUNDED' WHERE "id" = (SELECT "id" FROM "PaymentRequest" WHERE "workspaceId" = $1 AND "status" = 'CONFIRMED' AND "method" <> 'refund' AND "createdAt" < $2 ORDER BY "createdAt" DESC LIMIT 1)`, request.workspaceId, request.createdAt);
    await db.notification.create({ data: { workspaceId: request.workspaceId, type: "BILLING", title: ru ? "Оплата отменена" : "Payment cancelled", body: ru ? `Подписка отменена, деньги вернём тем же способом, которым вы платили.${reason ? ` ${reason}` : ""}` : `The subscription is cancelled; we'll return the money the way you paid.${reason ? ` ${reason}` : ""}` } }).catch(() => undefined);
  } else {
    await db.notification.create({ data: { workspaceId: request.workspaceId, type: "BILLING", title: ru ? "Отмена не прошла" : "Cancellation declined", body: ru ? `Запрос на отмену оплаты отклонён.${reason ? ` ${reason}` : ""} Если не согласны — напишите на ${SUPPORT_EMAIL}.` : `Your cancellation request was declined.${reason ? ` ${reason}` : ""} If you disagree, write to ${SUPPORT_EMAIL}.` } }).catch(() => undefined);
  }
  if (reason) await db.$executeRawUnsafe(`UPDATE "PaymentRequest" SET "note" = COALESCE("note", '') || $2 WHERE "id" = $1`, id, `\n— ${reason}`);
  await db.auditLog.create({ data: { workspaceId: request.workspaceId, userId: adminUserId, actorType: "USER", action: decision === "approve" ? "BILLING_REFUND_APPROVED" : "BILLING_REFUND_REJECTED", entityType: "Subscription", metadata: { requestId: id, reason } } }).catch(() => undefined);
  return { ok: true };
}

export type PaymentStats = { total: number; month: number; count: number; monthCount: number; active: { STARTER: number; CUSTOM: number }; accounts: number; refunded: number; refunds: number };
/** Admin panel: confirmed payments (USDT ≈ USD) and paying accounts right now. */
export async function paymentStats(): Promise<PaymentStats> {
  await ensureTable();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [sums, subs, accounts] = await Promise.all([
    db.$queryRawUnsafe<Array<{ total: string | number | null; month: string | number | null; count: number | bigint; monthCount: number | bigint; refunded: string | number | null; refunds: number | bigint }>>(
      `SELECT COALESCE(SUM("amount") FILTER (WHERE "status" = 'CONFIRMED'),0) AS "total", COALESCE(SUM("amount") FILTER (WHERE "status" = 'CONFIRMED' AND "decidedAt" > $1),0) AS "month", COUNT(*) FILTER (WHERE "status" = 'CONFIRMED') AS "count", COUNT(*) FILTER (WHERE "status" = 'CONFIRMED' AND "decidedAt" > $1) AS "monthCount", COALESCE(SUM("amount") FILTER (WHERE "status" = 'REFUNDED'),0) AS "refunded", COUNT(*) FILTER (WHERE "status" = 'REFUNDED') AS "refunds" FROM "PaymentRequest" WHERE "status" IN ('CONFIRMED','REFUNDED') AND "amount" > 0 AND "method" <> 'refund'`, since),
    db.$queryRawUnsafe<Array<{ plan: string; provider: string; n: number | bigint }>>(`SELECT "plan", "provider", COUNT(*) AS "n" FROM "Subscription" WHERE "status" IN ('ACTIVE','TRIALING') AND ("currentPeriodEnd" IS NULL OR "currentPeriodEnd" > now()) GROUP BY "plan", "provider"`),
    db.workspace.count(),
  ]);
  const active = { STARTER: 0, CUSTOM: 0 };
  for (const row of subs) {
    if (row.provider === "platform") continue;
    const plan = normalizePlan(row.plan);
    if (plan === "STARTER" || plan === "CUSTOM") active[plan] += Number(row.n);
  }
  const s = sums[0];
  return { total: Number(s?.total ?? 0), month: Number(s?.month ?? 0), count: Number(s?.count ?? 0), monthCount: Number(s?.monthCount ?? 0), active, accounts, refunded: Number(s?.refunded ?? 0), refunds: Number(s?.refunds ?? 0) };
}

