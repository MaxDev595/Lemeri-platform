import { db } from "@/lib/db";
import { planPriceUsd, normalizePlan, type BillingInterval } from "./plans";
import { cryptoConfig, paymentCode, type P2PPlan } from "./p2p";
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
    `SELECT p."txId", p."id", p."plan", p."status", w."name" AS "workspace", (SELECT u."email" FROM "WorkspaceMember" m JOIN "User" u ON u."id" = m."userId" WHERE m."workspaceId" = p."workspaceId" AND m."role" = 'OWNER' ORDER BY m."createdAt" LIMIT 1) AS "ownerEmail"
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
    `SELECT m."workspaceId", m."userId" FROM "WorkspaceMember" m JOIN "User" u ON u."id" = m."userId" WHERE lower(u."email") = $1 ORDER BY CASE WHEN m."role" = 'OWNER' THEN 0 ELSE 1 END, m."createdAt" LIMIT 1`, email);
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

export type PaymentStats = { total: number; month: number; count: number; monthCount: number; active: { STARTER: number; CUSTOM: number }; accounts: number };
/** Admin panel: confirmed payments (USDT ≈ USD) and paying accounts right now. */
export async function paymentStats(): Promise<PaymentStats> {
  await ensureTable();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [sums, subs, accounts] = await Promise.all([
    db.$queryRawUnsafe<Array<{ total: string | number | null; month: string | number | null; count: number | bigint; monthCount: number | bigint }>>(
      `SELECT COALESCE(SUM("amount"),0) AS "total", COALESCE(SUM("amount") FILTER (WHERE "decidedAt" > $1),0) AS "month", COUNT(*) AS "count", COUNT(*) FILTER (WHERE "decidedAt" > $1) AS "monthCount" FROM "PaymentRequest" WHERE "status" = 'CONFIRMED' AND "amount" > 0`, since),
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
  return { total: Number(s?.total ?? 0), month: Number(s?.month ?? 0), count: Number(s?.count ?? 0), monthCount: Number(s?.monthCount ?? 0), active, accounts };
}

