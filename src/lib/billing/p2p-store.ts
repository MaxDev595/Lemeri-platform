import { db } from "@/lib/db";
import { adminEmails } from "@/lib/platform/access";
import { normalizePlan, planPriceUsd, type BillingInterval } from "./plans";
import { CRYPTO_INVOICE_MS, cryptoAmount, cryptoConfig, formatAmount, matchCryptoPayments, p2pAmount, p2pConfig, p2pPeriod, parseTonTransfers, paymentCode, pickTail, tonRawAddress, USDT_TON_MASTER, USDT_TON_RAW, type ChainTransfer, type P2PPlan } from "./p2p";

// Payment requests for P2P transfers: the customer says «Я оплатил», an admin
// confirms (plan switched on) or rejects. The table is additive and created on
// first use (raw SQL, no Prisma migration).

export type PaymentStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELED";
export type PaymentMethod = "transfer" | "crypto";
export type PaymentRequest = { id: string; workspaceId: string; plan: P2PPlan; interval: BillingInterval; amount: number; currency: string; code: string; payerName: string; note: string; status: PaymentStatus; createdAt: string; decidedAt: string | null; method: PaymentMethod; txId: string | null };
type Row = { id: string; workspaceId: string; plan: string; interval: string; amount: string | number; currency: string; code: string; payerName: string; note: string | null; status: string; createdAt: Date; decidedAt: Date | null; method: string | null; txId: string | null };

let ready: Promise<unknown> | undefined;
export function ensureTable() {
  ready ??= db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PaymentRequest" ("id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "userId" TEXT, "plan" TEXT NOT NULL, "interval" TEXT NOT NULL, "amount" NUMERIC(14,2) NOT NULL, "currency" TEXT NOT NULL, "code" TEXT NOT NULL, "payerName" TEXT NOT NULL, "note" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3), "decidedBy" TEXT)`)
    .then(() => db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentRequest_workspace_status" ON "PaymentRequest" ("workspaceId", "status", "createdAt")`))
    // Crypto invoices: method, the paying transaction (used once) and 4-decimal amounts.
    .then(() => db.$executeRawUnsafe(`ALTER TABLE "PaymentRequest" ADD COLUMN IF NOT EXISTS "method" TEXT NOT NULL DEFAULT 'transfer', ADD COLUMN IF NOT EXISTS "txId" TEXT`))
    .then(() => db.$executeRawUnsafe(`DO $$ BEGIN IF (SELECT numeric_scale FROM information_schema.columns WHERE table_name = 'PaymentRequest' AND column_name = 'amount') < 6 THEN ALTER TABLE "PaymentRequest" ALTER COLUMN "amount" TYPE NUMERIC(18,6); END IF; END $$`))
    .then(() => db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PaymentRequest_txId" ON "PaymentRequest" ("txId")`))
    .catch(error => { ready = undefined; throw error; });
  return ready;
}
const map = (row: Row): PaymentRequest => ({
  id: row.id, workspaceId: row.workspaceId, plan: normalizePlan(row.plan) === "CUSTOM" ? "CUSTOM" : "STARTER", interval: row.interval === "year" ? "year" : "month",
  amount: Number(row.amount), currency: row.currency, code: row.code, payerName: row.payerName, note: row.note ?? "", status: row.status as PaymentStatus,
  createdAt: new Date(row.createdAt).toISOString(), decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : null,
  method: row.method === "crypto" ? "crypto" : "transfer", txId: row.txId ?? null,
});
const COLUMNS = `"id","workspaceId","plan","interval","amount","currency","code","payerName","note","status","createdAt","decidedAt","method","txId"`;

/** The workspace's open request and its last decided one (to show «отклонено» once). */
export async function workspacePayments(workspaceId: string) {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<Row[]>(`SELECT ${COLUMNS} FROM "PaymentRequest" WHERE "workspaceId" = $1 AND "status" <> 'CANCELED' ORDER BY "createdAt" DESC LIMIT 5`, workspaceId);
  const all = rows.map(map);
  return { pending: all.find(item => item.status === "PENDING") ?? null, last: all.find(item => item.status !== "PENDING") ?? null, lastConfirmed: all.find(item => item.status === "CONFIRMED") ?? null };
}

/** «Я оплатил»: replaces any earlier open request of the workspace. */
export async function createPaymentClaim(input: { workspaceId: string; userId: string; plan: P2PPlan; interval: BillingInterval; payerName: string; note: string }) {
  await ensureTable();
  const config = p2pConfig();
  const amount = p2pAmount(input.plan, input.interval, config);
  const id = crypto.randomUUID();
  const code = paymentCode(input.workspaceId);
  await db.$executeRawUnsafe(`UPDATE "PaymentRequest" SET "status" = 'CANCELED', "decidedAt" = CURRENT_TIMESTAMP WHERE "workspaceId" = $1 AND "status" = 'PENDING'`, input.workspaceId);
  await db.$executeRawUnsafe(`INSERT INTO "PaymentRequest" ("id","workspaceId","userId","plan","interval","amount","currency","code","payerName","note") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    id, input.workspaceId, input.userId, input.plan, input.interval, amount, config.currency, code, input.payerName, input.note || null);
  void notifyAdmins({ code, plan: input.plan, interval: input.interval, amount: formatAmount(amount, config.currency), payerName: input.payerName, id });
  return id;
}

export async function cancelPaymentClaim(workspaceId: string) {
  await ensureTable();
  await db.$executeRawUnsafe(`UPDATE "PaymentRequest" SET "status" = 'CANCELED', "decidedAt" = CURRENT_TIMESTAMP WHERE "workspaceId" = $1 AND "status" = 'PENDING'`, workspaceId);
}

/** Crypto invoice: a unique USDT amount for this workspace; replaces any earlier open request. */
export async function createCryptoInvoice(input: { workspaceId: string; userId: string; plan: P2PPlan; interval: BillingInterval }) {
  await ensureTable();
  const open = await db.$queryRawUnsafe<Array<{ amount: string | number }>>(`SELECT "amount" FROM "PaymentRequest" WHERE "method" = 'crypto' AND "status" = 'PENDING' AND "createdAt" > $1`, new Date(Date.now() - CRYPTO_INVOICE_MS));
  const used = new Set(open.map(row => Math.round((Number(row.amount) % 1) * 10_000) % 1000));
  const amount = cryptoAmount(input.plan, input.interval, pickTail(used));
  const id = crypto.randomUUID();
  await db.$executeRawUnsafe(`UPDATE "PaymentRequest" SET "status" = 'CANCELED', "decidedAt" = CURRENT_TIMESTAMP WHERE "workspaceId" = $1 AND "status" = 'PENDING'`, input.workspaceId);
  await db.$executeRawUnsafe(`INSERT INTO "PaymentRequest" ("id","workspaceId","userId","plan","interval","amount","currency","code","payerName","method") VALUES ($1,$2,$3,$4,$5,$6,'USDT',$7,'','crypto')`,
    id, input.workspaceId, input.userId, input.plan, input.interval, amount, paymentCode(input.workspaceId));
  return id;
}

let lastCheck = 0;
/**
 * Reads incoming USDT (TON jetton) transfers of the wallet and confirms the open
 * crypto invoices they pay. Called by cron and while a checkout page is open;
 * at most once per 15 s per isolate. Returns the number of confirmed invoices.
 */
export async function checkCryptoPayments(force = false) {
  const config = cryptoConfig();
  if (!config.configured || (!force && Date.now() - lastCheck < 15_000)) return 0;
  lastCheck = Date.now();
  await ensureTable();
  const open = await db.$queryRawUnsafe<Array<{ id: string; amount: string | number; createdAt: Date; plan: string; interval: string }>>(`SELECT "id","amount","createdAt","plan","interval" FROM "PaymentRequest" WHERE "method" = 'crypto' AND "status" = 'PENDING' AND "createdAt" > $1 ORDER BY "createdAt" LIMIT 100`, new Date(Date.now() - CRYPTO_INVOICE_MS - 3_600_000));
  if (!open.length) return 0;
  const since = Math.min(...open.map(row => new Date(row.createdAt).getTime())) - 60_000;
  const transfers = await fetchTonTransfers(config.address, since);
  if (!transfers) return 0;
  // Transactions already used by another request (e.g. linked by an admin) can't pay again.
  const ids = transfers.map(t => t.id);
  const used = ids.length ? await db.$queryRawUnsafe<Array<{ txId: string }>>(`SELECT "txId" FROM "PaymentRequest" WHERE "txId" = ANY($1::text[])`, ids) : [];
  const base = (row: { plan: string; interval: string }) => planPriceUsd(normalizePlan(row.plan) === "CUSTOM" ? "CUSTOM" : "STARTER", row.interval === "year" ? "year" : "month");
  const matches = matchCryptoPayments(open.map(row => ({ id: row.id, amount: Number(row.amount), createdAt: row.createdAt, base: base(row) })), transfers, config.address, new Set(used.map(row => row.txId)));
  let confirmed = 0;
  for (const match of matches) {
    // The unique index on txId makes sure one transaction pays one invoice.
    const claimed = await db.$executeRawUnsafe(`UPDATE "PaymentRequest" SET "txId" = $2 WHERE "id" = $1 AND "status" = 'PENDING' AND "txId" IS NULL`, match.invoiceId, match.txId).catch(() => 0);
    if (claimed && await decidePayment(match.invoiceId, "confirm", null)) confirmed++;
  }
  return confirmed;
}

/** Incoming USDT transfers of the wallet from TonAPI (newest last page first), or null when TonAPI is unreachable. */
export async function fetchTonTransfers(address: string, since?: number, limit = 100): Promise<ChainTransfer[] | null> {
  const url = `https://tonapi.io/v2/jettons/${USDT_TON_MASTER}/accounts/${encodeURIComponent(address)}/history?limit=${limit}${since ? `&start_date=${Math.floor(since / 1000)}` : ""}`;
  const key = process.env.TONAPI_API_KEY?.trim();
  try {
    const response = await fetch(url, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const raw = tonRawAddress(address);
    return parseTonTransfers(await response.json().catch(() => null)).filter(t => t.to === raw && t.token === USDT_TON_RAW);
  } catch { return null; }
}

export type AdminPayment = PaymentRequest & { workspace: string; ownerEmail: string | null };
/** For the admin panel: open requests first, then the latest decisions. */
export async function adminPayments(limit = 30): Promise<AdminPayment[]> {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<Array<Row & { workspace: string; ownerEmail: string | null }>>(
    `SELECT p."id", p."workspaceId", p."plan", p."interval", p."amount", p."currency", p."code", p."payerName", p."note", p."status", p."createdAt", p."decidedAt", p."method", p."txId", w."name" AS "workspace",
       (SELECT u."email" FROM "WorkspaceMember" m JOIN "User" u ON u."id" = m."userId" WHERE m."workspaceId" = p."workspaceId" AND m."role" = 'OWNER' ORDER BY m."createdAt" LIMIT 1) AS "ownerEmail"
     FROM "PaymentRequest" p JOIN "Workspace" w ON w."id" = p."workspaceId" WHERE p."status" <> 'CANCELED'
     ORDER BY CASE WHEN p."status" = 'PENDING' THEN 0 ELSE 1 END, p."createdAt" DESC LIMIT $1`, limit);
  return rows.map(row => ({ ...map(row), workspace: row.workspace, ownerEmail: row.ownerEmail }));
}

/** Admin decision. Confirming switches the plan on (or extends it) for the paid period. */
export async function decidePayment(id: string, decision: "confirm" | "reject", adminUserId: string | null) {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<Row[]>(`UPDATE "PaymentRequest" SET "status" = $2, "decidedAt" = CURRENT_TIMESTAMP, "decidedBy" = COALESCE($3, 'crypto') WHERE "id" = $1 AND "status" = 'PENDING' RETURNING ${COLUMNS}`, id, decision === "confirm" ? "CONFIRMED" : "REJECTED", adminUserId);
  const request = rows[0] ? map(rows[0]) : null;
  if (!request) return null;
  const ru = !(await db.workspaceSettings.findUnique({ where: { workspaceId: request.workspaceId }, select: { locale: true } }).catch(() => null))?.locale?.startsWith("en");
  if (decision === "confirm") {
    const current = await db.subscription.findUnique({ where: { workspaceId: request.workspaceId }, select: { plan: true, provider: true, status: true, currentPeriodEnd: true } });
    const period = p2pPeriod({ plan: request.plan, interval: request.interval, now: new Date(), current });
    const values = { provider: "P2P", plan: request.plan, status: "ACTIVE", currentPeriodStart: period.start, currentPeriodEnd: period.end, cancelAtPeriodEnd: false, externalCustomerId: null, externalPlanId: null };
    await db.subscription.upsert({ where: { workspaceId: request.workspaceId }, create: { workspaceId: request.workspaceId, ...values }, update: values });
    const until = period.end.toLocaleDateString(ru ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
    await db.notification.create({ data: { workspaceId: request.workspaceId, type: "BILLING", title: ru ? "Оплата подтверждена" : "Payment confirmed", body: ru ? `Тариф ${request.plan === "CUSTOM" ? "Custom" : "Starter"} активен до ${until}.` : `${request.plan === "CUSTOM" ? "Custom" : "Starter"} is active until ${until}.` } }).catch(() => undefined);
  } else {
    await db.notification.create({ data: { workspaceId: request.workspaceId, type: "BILLING", title: ru ? "Перевод не найден" : "Transfer not found", body: ru ? "Мы не нашли ваш перевод. Проверьте сумму и комментарий и отправьте заявку ещё раз или напишите в поддержку." : "We couldn't find your transfer. Check the amount and comment and send the request again, or contact support." } }).catch(() => undefined);
  }
  await db.auditLog.create({ data: { workspaceId: request.workspaceId, userId: adminUserId, actorType: adminUserId ? "USER" : "SYSTEM", action: decision === "confirm" ? "BILLING_P2P_CONFIRMED" : "BILLING_P2P_REJECTED", entityType: "Subscription", metadata: { requestId: request.id, plan: request.plan, interval: request.interval, amount: request.amount, currency: request.currency, method: request.method, txId: request.txId, auto: !adminUserId } } }).catch(() => undefined);
  return request;
}

/** Best effort: email the platform admins about a new transfer (needs Resend). The admin panel lists it either way. */
async function notifyAdmins(item: { code: string; plan: string; interval: string; amount: string; payerName: string; id: string }) {
  const to = adminEmails();
  if (!to.length || !process.env.RESEND_API_KEY) return;
  try {
    const { ResendEmailProvider } = await import("@/lib/email/provider");
    const escape = (value: string) => value.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
    const base = process.env.PUBLIC_APP_URL ?? "https://lemeriai.com";
    for (const email of to) await new ResendEmailProvider().send({ to: email, subject: `Lemeri AI: новый перевод ${item.code}`, idempotencyKey: `p2p-${item.id}-${email}`,
      html: `<p>Клиент сообщил о переводе.</p><p><b>${escape(item.amount)}</b> · ${item.plan} · ${item.interval === "year" ? "год" : "месяц"}<br>Отправитель: ${escape(item.payerName)}<br>Код: ${item.code}</p><p><a href="${base}/app?section=admin">Проверить в админке</a></p>` });
  } catch { /* the admin panel still shows the request */ }
}
