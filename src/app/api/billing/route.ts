import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiWorkspace } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { aiRepliesUsed, workspaceAccess } from "@/lib/billing/access";
import { billingPlans, intervalFromPeriod, openAccessEnabled, planPriceUsd, YEARLY_DISCOUNT } from "@/lib/billing/plans";
import { cryptoConfig, p2pAmount, p2pConfig, paymentCode } from "@/lib/billing/p2p";

// Trial / Starter ($19 a month or $182.40 a year) / Custom ($29 or $278.40 a year). The plan state shown here is computed by
// resolveAccess() — the same function the widget and the AI use.
// Payments: P2P transfers (default). The customer transfers the price to the
// recipient from LEMIRI_P2P_*, presses «Я оплатил», and a platform admin confirms
// it in the admin panel (lib/billing/p2p-store.ts). Or pays in USDT (TRC-20) to
// LEMIRI_CRYPTO_USDT_TRC20: the exact invoice amount is found on-chain and the
// plan switches on automatically (checkCryptoPayments). Stripe stays as an optional
// fallback (BILLING_PROVIDER=stripe).

const provider = () => (process.env.BILLING_PROVIDER === "stripe" ? "stripe" : "p2p");
const plan = z.enum(["STARTER", "CUSTOM"]);
const interval = z.enum(["month", "year"]).optional().default("month");
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), plan, interval }),
  z.object({ action: z.literal("p2p_claim"), plan, interval, payerName: z.string().trim().min(2).max(120), note: z.string().trim().max(300).optional().default("") }),
  z.object({ action: z.literal("crypto_invoice"), plan, interval }),
  z.object({ action: z.literal("p2p_cancel") }),
  z.object({ action: z.literal("portal") }),
]);
const LIVE = ["ACTIVE", "TRIALING", "PAST_DUE"];
// Card numbers are never needed for a transfer claim; refuse anything that looks like one.
const looksLikeCard = (value: unknown) => /\b(?:\d[ -]?){13,19}\b/.test(JSON.stringify(value ?? "")) || /"(cvc|cvv|cardNumber|card_number)"/i.test(JSON.stringify(value ?? ""));

export async function GET() {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const crypto = cryptoConfig();
  // While a checkout page is open it polls here: look for the customer's USDT transfer first.
  if (provider() === "p2p" && crypto.configured) await (await import("@/lib/billing/p2p-store")).checkCryptoPayments().catch(() => 0);
  const [access, subscription] = await Promise.all([
    workspaceAccess(auth.workspaceId),
    db.subscription.findUnique({ where: { workspaceId: auth.workspaceId }, select: { plan: true, status: true, provider: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, externalCustomerId: true } }),
  ]);
  const used = await aiRepliesUsed(auth.workspaceId, access);
  const config = p2pConfig();
  const payments = provider() === "p2p" ? await (await import("@/lib/billing/p2p-store")).workspacePayments(auth.workspaceId).catch(() => null) : null;
  // P2P periods can be extended early, so the period length alone may look «yearly»: use what was paid for.
  const paidInterval = subscription?.provider === "P2P" && payments?.lastConfirmed ? payments.lastConfirmed.interval : null;
  return NextResponse.json({
    access: paidInterval && access.plan !== "TRIAL" ? { ...access, interval: paidInterval } : access,
    used, plans: billingPlans, provider: provider(),
    prices: { yearlyDiscount: YEARLY_DISCOUNT, STARTER: { month: planPriceUsd("STARTER"), year: planPriceUsd("STARTER", "year") }, CUSTOM: { month: planPriceUsd("CUSTOM"), year: planPriceUsd("CUSTOM", "year") } },
    subscription: subscription ? { plan: subscription.plan, status: subscription.status, provider: subscription.provider, interval: paidInterval ?? intervalFromPeriod(subscription.currentPeriodStart, subscription.currentPeriodEnd), currentPeriodEnd: subscription.currentPeriodEnd.toISOString(), cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, portal: subscription.provider !== "P2P" && Boolean(subscription.externalCustomerId) } : null,
    p2p: provider() === "p2p" ? {
      configured: config.configured || crypto.configured, transfer: config.configured, crypto: crypto.configured ? { address: crypto.address, asset: crypto.asset, network: crypto.network } : null, recipient: config.recipient, details: config.details, currency: config.currency, note: config.note, code: paymentCode(auth.workspaceId),
      amounts: { STARTER: { month: p2pAmount("STARTER", "month", config), year: p2pAmount("STARTER", "year", config) }, CUSTOM: { month: p2pAmount("CUSTOM", "month", config), year: p2pAmount("CUSTOM", "year", config) } },
      pending: payments?.pending ?? null, last: payments?.last ?? null,
    } : null,
    configured: provider() === "p2p" ? (on => ({ p2p: on, starter: on, custom: on, yearly: on }))(config.configured || crypto.configured)
      : await (async () => { const { priceIdFor } = await import("@/lib/billing/stripe"); return { stripe: Boolean(process.env.STRIPE_SECRET_KEY), starter: Boolean(priceIdFor("STARTER")), custom: Boolean(priceIdFor("CUSTOM")), yearly: Boolean(process.env.STRIPE_SECRET_KEY && priceIdFor("STARTER", process.env, "year") && priceIdFor("CUSTOM", process.env, "year")) }; })(),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (auth.membership.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const raw = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (looksLikeCard(raw)) return NextResponse.json({ error: "CARD_DATA_NOT_ACCEPTED" }, { status: 400 });
  // Older clients sent { plan: "START" | "GROWTH" }.
  const legacy = raw && !raw.action && typeof raw.plan === "string" ? { action: "checkout", plan: raw.plan === "GROWTH" ? "CUSTOM" : raw.plan === "START" ? "STARTER" : raw.plan } : raw;
  const parsed = actionSchema.safeParse(legacy);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  const base = process.env.PUBLIC_APP_URL ?? new URL(request.url).origin;
  const data = parsed.data;
  try {
    if (data.action === "portal") {
      const subscription = await db.subscription.findUnique({ where: { workspaceId: auth.workspaceId } });
      if (!subscription?.externalCustomerId || subscription.provider === "P2P") return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 409 });
      const { billingPortalUrl } = await import("@/lib/billing/stripe");
      return NextResponse.json({ url: await billingPortalUrl(subscription.externalCustomerId, `${base}/app?section=billing`) });
    }
    // Nobody is charged while every plan is open for testing.
    if (openAccessEnabled()) return NextResponse.json({ error: "OPEN_ACCESS" }, { status: 409 });

    if (provider() === "p2p") {
      const store = await import("@/lib/billing/p2p-store");
      if (data.action === "p2p_cancel") { await store.cancelPaymentClaim(auth.workspaceId); return NextResponse.json({ canceled: true }); }
      const transfer = p2pConfig().configured, crypto = cryptoConfig().configured;
      if (!transfer && !crypto) return NextResponse.json({ error: "BILLING_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
      if (data.action === "crypto_invoice") {
        if (!crypto) return NextResponse.json({ error: "BILLING_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
        const id = await store.createCryptoInvoice({ workspaceId: auth.workspaceId, userId: auth.user.id, plan: data.plan, interval: data.interval });
        await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "BILLING_CRYPTO_INVOICE", entityType: "Subscription", metadata: { requestId: id, plan: data.plan, interval: data.interval } } }).catch(() => undefined);
        return NextResponse.json({ invoice: true, id });
      }
      if (data.action === "p2p_claim" && !transfer) return NextResponse.json({ error: "BILLING_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
      // «Выбрать тариф» just opens the checkout page.
      if (data.action === "checkout") return NextResponse.json({ url: `${base}/app/checkout?plan=${data.plan}${data.interval === "year" ? "&interval=year" : ""}` });
      const id = await store.createPaymentClaim({ workspaceId: auth.workspaceId, userId: auth.user.id, plan: data.plan, interval: data.interval, payerName: data.payerName, note: data.note });
      await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "BILLING_P2P_CLAIMED", entityType: "Subscription", metadata: { requestId: id, plan: data.plan, interval: data.interval } } }).catch(() => undefined);
      return NextResponse.json({ claimed: true, id });
    }

    if (data.action !== "checkout") return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const { changeSubscriptionPrice, priceIdFor, StripeBillingProvider } = await import("@/lib/billing/stripe");
    const subscription = await db.subscription.findUnique({ where: { workspaceId: auth.workspaceId } });
    const live = Boolean(subscription?.externalPlanId?.startsWith("sub_") && LIVE.includes(subscription.status));
    const priceId = priceIdFor(data.plan, process.env, data.interval);
    if (!priceId || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "BILLING_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
    if (live) { await changeSubscriptionPrice(subscription!.externalPlanId!, priceId); return NextResponse.json({ changed: true, plan: data.plan, interval: data.interval }); }
    return NextResponse.json(await new StripeBillingProvider().createCheckout({ workspaceId: auth.workspaceId, email: auth.user.email, priceId, plan: data.plan, successUrl: `${base}/app?section=billing&billing=success`, cancelUrl: `${base}/app?section=billing&billing=cancelled` }));
  } catch (error) {
    return NextResponse.json({ error: "CHECKOUT_FAILED", message: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
