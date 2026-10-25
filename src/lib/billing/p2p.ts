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

/** Where customers write when a cancellation (refund) didn't go through. */
export { SUPPORT_EMAIL } from "../platform/contacts.ts";

// ── Crypto: USDT on TON (jetton), confirmed automatically ──────────────────────
// The customer gets an invoice with a unique amount (price + 0.0001…0.0999 USDT).
// The server reads incoming USDT transfers of LEMIRI_CRYPTO_USDT_TON from TonAPI
// (cron every 5 min + while the checkout page is open) and confirms the invoice
// whose exact amount arrived — the plan switches on without an admin.
//   LEMIRI_CRYPTO_USDT_TON  receiving wallet (public address: UQ…/EQ… or 0:…)
//   TONAPI_API_KEY          optional TonAPI key (higher rate limit)

/** USDT (Tether) jetton master on TON; 6 decimals like on other chains. */
export const USDT_TON_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
export const USDT_TON_RAW = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe";
/** Transfers are matched within this time after the invoice was created. */
export const CRYPTO_INVOICE_MS = 3 * 3_600_000;

/** Any TON address form (UQ…/EQ… with checksum, or raw 0:hex) → raw "wc:hex", or null when invalid. */
export function tonRawAddress(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const raw = /^(-?\d{1,3}):([0-9a-fA-F]{64})$/.exec(text);
  if (raw) return `${raw[1]}:${raw[2]!.toLowerCase()}`;
  if (!/^[A-Za-z0-9_\-+/]{48}$/.test(text)) return null;
  let bytes: number[];
  try { bytes = [...atob(text.replace(/-/g, "+").replace(/_/g, "/"))].map(ch => ch.charCodeAt(0)); } catch { return null; }
  if (bytes.length !== 36) return null;
  let crc = 0;
  for (const byte of bytes.slice(0, 34)) { crc ^= byte << 8; for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
  if (crc !== (bytes[34]! << 8 | bytes[35]!)) return null;
  const workchain = bytes[1]! > 127 ? bytes[1]! - 256 : bytes[1]!;
  return `${workchain}:${bytes.slice(2, 34).map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Raw "wc:hex" → user-friendly base64url (UQ… non-bounceable by default, as wallets show it; EQ… bounceable). */
export function tonFriendlyAddress(value: unknown, bounceable = false): string | null {
  const raw = tonRawAddress(value);
  if (!raw) return null;
  const [wc, hex] = raw.split(":") as [string, string];
  const bytes = [bounceable ? 0x11 : 0x51, Number(wc) & 0xff, ...hex.match(/../g)!.map(pair => parseInt(pair, 16))];
  let crc = 0;
  for (const byte of bytes) { crc ^= byte << 8; for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
  bytes.push(crc >> 8, crc & 0xff);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

export function cryptoConfig(e: Env = env()) {
  const address = (e.LEMIRI_CRYPTO_USDT_TON ?? "").trim();
  const raw = tonRawAddress(address);
  return { configured: Boolean(raw), address, raw: raw ?? "", asset: "USDT", network: "TON" };
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

export type ChainTransfer = { id: string; to: string; token: string; value: string; time: number; from?: string; fromName?: string; toName?: string; comment?: string };
/** `base` is the plan price without the tail: a transfer of at least that much still pays the invoice when it is the only one waiting. */
export type OpenInvoice = { id: string; amount: number; createdAt: string | Date; base?: number };

/** A text comment inside a TonAPI jetton payload ({Value: {Text: "…"}} and similar), if any. */
function payloadText(payload: unknown, depth = 0): string | undefined {
  if (!payload || typeof payload !== "object" || depth > 4) return undefined;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (/^(text|comment)$/i.test(key) && typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
    const nested = payloadText(value, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

/** TonAPI /v2/jettons/{jetton}/accounts/{account}/history → incoming transfers (defensive parsing, raw addresses). */
export function parseTonTransfers(body: unknown): ChainTransfer[] {
  const operations = (body as { operations?: unknown })?.operations;
  if (!Array.isArray(operations)) return [];
  return operations.flatMap(item => {
    const row = item as { operation?: unknown; transaction_hash?: unknown; destination?: { address?: unknown; name?: unknown }; source?: { address?: unknown; name?: unknown }; amount?: unknown; utime?: unknown; jetton?: { address?: unknown }; payload?: unknown };
    const to = tonRawAddress(row.destination?.address), token = tonRawAddress(row.jetton?.address);
    if (row.operation !== "transfer" || typeof row.transaction_hash !== "string" || typeof row.amount !== "string" || !to || !token) return [];
    const from = tonRawAddress(row.source?.address) ?? undefined, fromName = typeof row.source?.name === "string" ? row.source.name.slice(0, 60) : undefined;
    const toName = typeof row.destination?.name === "string" ? row.destination.name.slice(0, 60) : undefined;
    return [{ id: row.transaction_hash, to, token, value: row.amount, time: (Number(row.utime) || 0) * 1000, from, fromName, toName, comment: payloadText(row.payload) }];
  });
}

/**
 * Pairs open invoices with incoming USDT transfers sent after they were created.
 * 1) exact amount (the unique tail) — always safe;
 * 2) otherwise a transfer of at least the plan price (wallets often round the amount
 *    or take their fee out of it) pays an invoice only when it is the single
 *    invoice it could belong to — anything ambiguous is left for the admin.
 */
export function matchCryptoPayments(invoices: OpenInvoice[], transfers: ChainTransfer[], address: string, usedTx: Set<string> = new Set()) {
  const wallet = tonRawAddress(address) ?? address;
  const taken = new Set(usedTx);
  const matches: Array<{ invoiceId: string; txId: string }> = [];
  const ordered = [...transfers].filter(t => t.to === wallet && t.token === USDT_TON_RAW).sort((a, b) => a.time - b.time);
  const open = [...invoices].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const inWindow = (invoice: OpenInvoice, t: ChainTransfer) => { const from = new Date(invoice.createdAt).getTime() - 60_000; return t.time >= from && t.time <= from + 60_000 + CRYPTO_INVOICE_MS; };
  const paid = new Set<string>();
  for (const invoice of open) {
    const units = String(Math.round(invoice.amount * 1_000_000));
    const hit = ordered.find(t => !taken.has(t.id) && t.value === units && inWindow(invoice, t));
    if (hit) { taken.add(hit.id); paid.add(invoice.id); matches.push({ invoiceId: invoice.id, txId: hit.id }); }
  }
  for (const t of ordered) {
    if (taken.has(t.id) || !/^\d+$/.test(t.value)) continue;
    const value = Number(t.value);
    const fits = open.filter(invoice => !paid.has(invoice.id) && inWindow(invoice, t));
    const candidates = fits.filter(invoice => invoice.base && value >= Math.round(invoice.base * 1_000_000));
    // Several open invoices in the window: we can't tell whose transfer it is.
    if (candidates.length !== 1 || fits.length !== 1) continue;
    taken.add(t.id); paid.add(candidates[0]!.id); matches.push({ invoiceId: candidates[0]!.id, txId: t.id });
  }
  return matches;
}
