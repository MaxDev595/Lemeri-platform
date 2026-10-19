// P2P payments: the customer transfers the plan price to the recipient's card or
// account, presses «Я оплатил», and a platform admin confirms the transfer in the
// admin panel — that switches the plan on for a month or a year. No payment
// provider, no card data on Lemeri's side, no automatic renewal.
//
// Pure module (no I/O) — used by the billing API, the admin API and tests.
// Env (set in Cloudflare, never in the repository):
//   LEMIRI_P2P_RECIPIENT  name of the recipient shown to customers
//   LEMIRI_P2P_DETAILS    where to send the money (card, phone, bank — free text, lines separated by "\n" or "|")
//   LEMIRI_P2P_CURRENCY   currency of the transfer, default USD
//   LEMIRI_P2P_RATE       units of that currency per 1 USD, default 1
//   LEMIRI_P2P_NOTE       optional extra line for customers

import { planPriceUsd, type BillingInterval } from "./plans.ts";

type Env = Record<string, string | undefined>;
const env = (): Env => (typeof process !== "undefined" ? process.env : {});

export type P2PPlan = "STARTER" | "CUSTOM";
export type P2PConfig = { configured: boolean; recipient: string; details: string[]; currency: string; rate: number; note: string };

export function p2pConfig(e: Env = env()): P2PConfig {
  const recipient = (e.LEMIRI_P2P_RECIPIENT ?? "").trim().slice(0, 120);
  const details = (e.LEMIRI_P2P_DETAILS ?? "").split(/\n|\\n|\|/).map(line => line.trim()).filter(Boolean).slice(0, 8).map(line => line.slice(0, 160));
  const currency = ((e.LEMIRI_P2P_CURRENCY ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3)) || "USD";
  const rate = Number(e.LEMIRI_P2P_RATE);
  return { configured: Boolean(recipient && details.length), recipient, details, currency, rate: Number.isFinite(rate) && rate > 0 ? rate : 1, note: (e.LEMIRI_P2P_NOTE ?? "").trim().slice(0, 300) };
}

/** Amount to transfer: the USD price converted at the configured rate. USD keeps cents, other currencies are whole numbers. */
export function p2pAmount(plan: P2PPlan, interval: BillingInterval, config: Pick<P2PConfig, "currency" | "rate">) {
  const value = planPriceUsd(plan, interval) * (config.currency === "USD" ? 1 : config.rate);
  return config.currency === "USD" ? Math.round(value * 100) / 100 : Math.round(value);
}

export function formatAmount(amount: number, currency: string, locale: "ru" | "en" = "ru") {
  const digits = Number.isInteger(amount) ? 0 : 2;
  const text = amount.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return currency === "USD" ? `$${text}` : `${text} ${currency}`;
}

/** Short code the customer puts in the transfer comment, so the admin can match the payment. Stable per workspace. */
export function paymentCode(workspaceId: string) {
  let hash = 2166136261;
  for (const char of workspaceId) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return `LM-${hash.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
}

/** Adds one billing period (calendar month or 12 months), keeping the day of month where possible. */
export function addPeriod(from: Date, interval: BillingInterval) {
  const months = interval === "year" ? 12 : 1;
  const result = new Date(from);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export type CurrentSubscription = { plan?: string | null; provider?: string | null; status?: string | null; currentPeriodEnd?: Date | string | null } | null | undefined;

/**
 * Period granted by a confirmed transfer. Paying again for the same plan before
 * it runs out extends it from the current end; a different plan starts now.
 */
export function p2pPeriod(input: { plan: P2PPlan; interval: BillingInterval; now: Date; current: CurrentSubscription }) {
  const current = input.current;
  const end = current?.currentPeriodEnd ? new Date(current.currentPeriodEnd) : null;
  const extend = Boolean(current && String(current.provider).toUpperCase() === "P2P" && current.plan === input.plan && String(current.status).toUpperCase() === "ACTIVE" && end && end > input.now);
  return { start: input.now, end: addPeriod(extend ? end! : input.now, input.interval), extended: extend };
}

/** Days until a prepaid period ends (0 when over). */
export function daysLeft(periodEnd: Date | string, now = new Date()) {
  return Math.max(0, Math.ceil((new Date(periodEnd).getTime() - now.getTime()) / 86_400_000));
}

// ── Crypto: USDT on TRON (TRC-20), confirmed automatically ─────────────────────
// The customer gets an invoice with a unique amount (price + 0.0001…0.0999 USDT).
// The server reads incoming USDT transfers of LEMIRI_CRYPTO_USDT_TRC20 from
// TronGrid (cron every 5 min + while the checkout page is open) and confirms the
// invoice whose exact amount arrived — the plan switches on without an admin.
//   LEMIRI_CRYPTO_USDT_TRC20  receiving wallet (public address, starts with T)
//   LEMIRI_TRONGRID_KEY       optional TronGrid API key (higher rate limit)

export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSLjLj6t";
/** Transfers are matched within this time after the invoice was created. */
export const CRYPTO_INVOICE_MS = 3 * 3_600_000;

export function cryptoConfig(e: Env = env()) {
  const address = (e.LEMIRI_CRYPTO_USDT_TRC20 ?? "").trim();
  return { configured: /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address), address, asset: "USDT", network: "TRON (TRC-20)" };
}

/** Invoice amount: the USD price plus a tail of `tail`/10000 USDT (tail 1…999) that identifies the invoice. */
export function cryptoAmount(plan: P2PPlan, interval: BillingInterval, tail: number) {
  return Math.round((planPriceUsd(plan, interval) + tail / 10_000) * 10_000) / 10_000;
}

/** A tail not used by other open invoices. */
export function pickTail(used: Set<number>, random = Math.random) {
  for (let attempt = 0; attempt < 40; attempt++) { const tail = 1 + Math.floor(random() * 999); if (!used.has(tail)) return tail; }
  for (let tail = 1; tail <= 999; tail++) if (!used.has(tail)) return tail;
  return 1 + Math.floor(random() * 999);
}

export type ChainTransfer = { id: string; to: string; token: string; value: string; time: number };
export type OpenInvoice = { id: string; amount: number; createdAt: string | Date };

/** TronGrid /v1/accounts/{address}/transactions/trc20 → transfers (defensive parsing). */
export function parseTronTransfers(body: unknown): ChainTransfer[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap(item => {
    const row = item as { transaction_id?: unknown; to?: unknown; value?: unknown; block_timestamp?: unknown; type?: unknown; token_info?: { address?: unknown } };
    if (typeof row.transaction_id !== "string" || typeof row.to !== "string" || typeof row.value !== "string" || (row.type && row.type !== "Transfer")) return [];
    return [{ id: row.transaction_id, to: row.to, token: String(row.token_info?.address ?? ""), value: row.value, time: Number(row.block_timestamp) || 0 }];
  });
}

/** Pairs each open invoice with the first unused transfer of exactly its amount, sent to the wallet after it was created. */
export function matchCryptoPayments(invoices: OpenInvoice[], transfers: ChainTransfer[], address: string, usedTx: Set<string> = new Set()) {
  const taken = new Set(usedTx);
  const matches: Array<{ invoiceId: string; txId: string }> = [];
  const ordered = [...transfers].sort((a, b) => a.time - b.time);
  for (const invoice of [...invoices].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
    const from = new Date(invoice.createdAt).getTime() - 60_000, until = from + 60_000 + CRYPTO_INVOICE_MS;
    const units = String(Math.round(invoice.amount * 1_000_000));
    const hit = ordered.find(t => !taken.has(t.id) && t.to === address && t.token === USDT_TRC20_CONTRACT && t.value === units && t.time >= from && t.time <= until);
    if (hit) { taken.add(hit.id); matches.push({ invoiceId: invoice.id, txId: hit.id }); }
  }
  return matches;
}
