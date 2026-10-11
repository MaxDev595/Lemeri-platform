// Paddle Billing (merchant of record): customers, addresses, businesses,
// transactions for checkout, subscription plan changes, customer portal and
// webhook signatures. Card data never touches Lemiri: it is entered in Paddle's
// own secure checkout frame (components/billing/checkout-page.tsx).
//
// Env: PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, PADDLE_WEBHOOK_SECRET,
// PADDLE_ENVIRONMENT=sandbox|production, PADDLE_STARTER_PRICE_ID, PADDLE_CUSTOM_PRICE_ID
// (monthly) and PADDLE_STARTER_YEARLY_PRICE_ID, PADDLE_CUSTOM_YEARLY_PRICE_ID (yearly, −20%).
// PADDLE_API_BASE overrides the API address (local tests only).

import type { BillingInterval } from "./plans.ts";

type Env = Record<string, string | undefined>;
type Paid = "STARTER" | "CUSTOM";
const env = (): Env => (typeof process !== "undefined" ? process.env : {});

export type PaddleEnvironment = "sandbox" | "production";
export function paddleEnvironment(e: Env = env()): PaddleEnvironment { return e.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox"; }
export function paddlePriceId(plan: Paid, e: Env = env(), interval: BillingInterval = "month") {
  if (interval === "year") return (plan === "STARTER" ? e.PADDLE_STARTER_YEARLY_PRICE_ID : e.PADDLE_CUSTOM_YEARLY_PRICE_ID) || "";
  return (plan === "STARTER" ? e.PADDLE_STARTER_PRICE_ID : e.PADDLE_CUSTOM_PRICE_ID) || "";
}
/** Monthly prices are required; yearly ones are optional (paddleYearlyConfigured). */
export function paddleConfigured(e: Env = env()) { return Boolean(e.PADDLE_API_KEY && e.PADDLE_CLIENT_TOKEN && paddlePriceId("STARTER", e) && paddlePriceId("CUSTOM", e)); }
export function paddleYearlyConfigured(e: Env = env()) { return paddleConfigured(e) && Boolean(paddlePriceId("STARTER", e, "year") && paddlePriceId("CUSTOM", e, "year")); }
/** Plan and billing period of a Paddle price id (monthly or yearly). */
export function paddlePriceInfo(priceId: string, e: Env = env()): { plan: Paid; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const plan of ["STARTER", "CUSTOM"] as const) for (const interval of ["month", "year"] as const) {
    if (priceId === paddlePriceId(plan, e, interval)) return { plan, interval };
  }
  return null;
}
export function paddlePlanFromPriceId(priceId: string, e: Env = env()) { return paddlePriceInfo(priceId, e)?.plan ?? null; }
/** Paddle subscription status → Lemiri status (resolveAccess understands ACTIVE / TRIALING / PAST_DUE). */
export function paddleStatus(status: string) {
  const map: Record<string, string> = { active: "ACTIVE", trialing: "TRIALING", past_due: "PAST_DUE", paused: "PAUSED", canceled: "CANCELED" };
  return map[status] ?? status.toUpperCase();
}

export class PaddleError extends Error {
  readonly status: number; readonly code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; }
}

async function paddle<T>(path: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<T> {
  const e = env();
  if (!e.PADDLE_API_KEY) throw new PaddleError("BILLING_PROVIDER_NOT_CONFIGURED", 503);
  const base = e.PADDLE_API_BASE || (paddleEnvironment(e) === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com");
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${e.PADDLE_API_KEY}`, "paddle-version": "1", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
  } catch { throw new PaddleError("PADDLE_UNREACHABLE", 502); }
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string; detail?: string } };
  if (!response.ok) throw new PaddleError(payload.error?.detail?.slice(0, 300) || `PADDLE_${response.status}`, response.status, payload.error?.code);
  return payload.data as T;
}

export type BillingDetails = {
  fullName: string; email: string; country: string; region?: string; city: string; postalCode: string; address: string; address2?: string;
  company?: string; taxId?: string;
};

/** Creates or updates the Paddle customer, address and (for companies) business. Returns their ids. */
export async function syncPaddleCustomer(details: BillingDetails, known: { customerId?: string | null; addressId?: string | null; businessId?: string | null }) {
  let customerId = known.customerId ?? "";
  if (customerId) {
    await paddle(`/customers/${encodeURIComponent(customerId)}`, "PATCH", { name: details.fullName, email: details.email });
  } else {
    try {
      customerId = (await paddle<{ id: string }>("/customers", "POST", { name: details.fullName, email: details.email })).id;
    } catch (error) {
      // The email already has a Paddle customer: reuse it (its id is named in the error detail).
      const existing = error instanceof PaddleError && error.code === "customer_already_exists" ? error.message.match(/ctm_[a-z0-9]+/i)?.[0] : undefined;
      if (!existing) throw error;
      customerId = existing;
      await paddle(`/customers/${encodeURIComponent(customerId)}`, "PATCH", { name: details.fullName });
    }
  }
  const address = { country_code: details.country, postal_code: details.postalCode, city: details.city, region: details.region || null, first_line: details.address, second_line: details.address2 || null };
  const addressId = known.addressId && known.customerId === customerId
    ? (await paddle<{ id: string }>(`/customers/${customerId}/addresses/${encodeURIComponent(known.addressId)}`, "PATCH", address)).id
    : (await paddle<{ id: string }>(`/customers/${customerId}/addresses`, "POST", address)).id;
  let businessId: string | null = null;
  if (details.company) {
    const business = { name: details.company, tax_identifier: details.taxId || null };
    businessId = known.businessId && known.customerId === customerId
      ? (await paddle<{ id: string }>(`/customers/${customerId}/businesses/${encodeURIComponent(known.businessId)}`, "PATCH", business)).id
      : (await paddle<{ id: string }>(`/customers/${customerId}/businesses`, "POST", business)).id;
  }
  return { customerId, addressId, businessId };
}

/** Draft transaction the Paddle checkout frame completes (card entry happens there). */
export async function createPaddleTransaction(input: { customerId: string; addressId: string; businessId?: string | null; plan: Paid; interval?: BillingInterval; workspaceId: string }) {
  const interval = input.interval ?? "month";
  const priceId = paddlePriceId(input.plan, env(), interval);
  if (!priceId) throw new PaddleError("BILLING_PROVIDER_NOT_CONFIGURED", 503);
  const transaction = await paddle<{ id: string }>("/transactions", "POST", {
    items: [{ price_id: priceId, quantity: 1 }], customer_id: input.customerId, address_id: input.addressId, ...(input.businessId ? { business_id: input.businessId } : {}),
    collection_mode: "automatic", custom_data: { workspaceId: input.workspaceId, plan: input.plan, interval },
  });
  return transaction.id;
}

/**
 * Starter ⇄ Custom and monthly ⇄ yearly on a live subscription, prorated now — never
 * a second subscription. Moving to yearly charges the year minus the unused part of
 * the current month and the billing date moves to a year from today.
 */
export async function changePaddlePlan(subscriptionId: string, plan: Paid, interval: BillingInterval = "month") {
  const priceId = paddlePriceId(plan, env(), interval);
  if (!priceId) throw new PaddleError("BILLING_PROVIDER_NOT_CONFIGURED", 503);
  return paddle<{ id: string; status: string }>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, "PATCH", { items: [{ price_id: priceId, quantity: 1 }], proration_billing_mode: "prorated_immediately" });
}

/** Paddle customer portal: card, invoices, cancellation. */
export async function paddlePortalUrl(customerId: string, subscriptionId?: string | null) {
  const session = await paddle<{ urls: { general: { overview: string } } }>(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, "POST", subscriptionId ? { subscription_ids: [subscriptionId] } : {});
  return session.urls.general.overview;
}

/** Paddle-Signature: "ts=1700000000;h1=<hex>" — HMAC-SHA256 of "ts:rawBody". */
export async function verifyPaddleSignature(raw: string, header: string, secret: string, toleranceSeconds = 300, now = Date.now()) {
  const parts = header.split(";").map(part => part.trim().split("=", 2) as [string, string | undefined]);
  const ts = Number(parts.find(([key]) => key === "ts")?.[1]);
  const signatures = parts.filter(([key, value]) => key === "h1" && value).map(([, value]) => value!.toLowerCase());
  if (!ts || !signatures.length || Math.abs(now / 1000 - ts) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${raw}`)));
  const expected = [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
  // Constant-time comparison.
  return signatures.some(candidate => candidate.length === expected.length && [...candidate].reduce((diff, char, index) => diff | (char.charCodeAt(0) ^ expected.charCodeAt(index)), 0) === 0);
}

/** Card number, CVC etc. must never be posted to Lemiri; reject any payload that looks like one. */
export function looksLikeCardData(value: unknown): boolean {
  const text = JSON.stringify(value ?? "");
  return /\b(?:\d[ -]?){13,19}\b/.test(text.replace(/"(postalCode|taxId)":"[^"]*"/g, "")) || /"(cvc|cvv|cardNumber|card_number|expiry)"/i.test(text);
}
