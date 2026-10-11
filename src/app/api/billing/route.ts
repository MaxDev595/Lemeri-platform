import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiWorkspace } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { aiRepliesUsed, workspaceAccess } from "@/lib/billing/access";
import { billingPlans, intervalFromPeriod, openAccessEnabled, planPriceUsd, YEARLY_DISCOUNT } from "@/lib/billing/plans";
import { billingPortalUrl, changeSubscriptionPrice, priceIdFor, StripeBillingProvider } from "@/lib/billing/stripe";
import { changePaddlePlan, createPaddleTransaction, looksLikeCardData, paddleConfigured, paddleEnvironment, paddlePortalUrl, PaddleError, paddleYearlyConfigured, syncPaddleCustomer } from "@/lib/billing/paddle";
import { readBillingProfile, saveBillingProfile } from "@/lib/billing/profile";

// Trial / Starter ($19 a month or $182.40 a year) / Custom ($29 or $278.40 a year). The plan state shown here is computed by
// resolveAccess() — the same function the widget and the AI use.
// Payments: Paddle (default) — the payer fills name/address/company on the
// checkout page, the card is entered in Paddle's secure frame. Stripe stays as a
// fallback (BILLING_PROVIDER=stripe).

const provider = () => (process.env.BILLING_PROVIDER === "stripe" ? "stripe" : "paddle");

const details = z.object({
  fullName: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(200),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  region: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(1).max(20),
  address: z.string().trim().min(3).max(200),
  address2: z.string().trim().max(200).optional().default(""),
  company: z.string().trim().max(160).optional().default(""),
  taxId: z.string().trim().max(40).optional().default(""),
});
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), plan: z.enum(["STARTER", "CUSTOM"]), interval: z.enum(["month", "year"]).optional().default("month"), details: details.optional() }),
  z.object({ action: z.literal("portal") }),
]);
const LIVE = ["ACTIVE", "TRIALING", "PAST_DUE"];

export async function GET() {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const [access, subscription] = await Promise.all([
    workspaceAccess(auth.workspaceId),
    db.subscription.findUnique({ where: { workspaceId: auth.workspaceId }, select: { plan: true, status: true, provider: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, externalCustomerId: true } }),
  ]);
  const profile = await readBillingProfile(auth.workspaceId).catch(() => null);
  const used = await aiRepliesUsed(auth.workspaceId, access);
  return NextResponse.json({
    access, used, plans: billingPlans, provider: provider(),
    prices: { yearlyDiscount: YEARLY_DISCOUNT, STARTER: { month: planPriceUsd("STARTER"), year: planPriceUsd("STARTER", "year") }, CUSTOM: { month: planPriceUsd("CUSTOM"), year: planPriceUsd("CUSTOM", "year") } },
    subscription: subscription ? { plan: subscription.plan, status: subscription.status, provider: subscription.provider, interval: intervalFromPeriod(subscription.currentPeriodStart, subscription.currentPeriodEnd), currentPeriodEnd: subscription.currentPeriodEnd.toISOString(), cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, portal: Boolean(subscription.externalCustomerId) } : null,
    profile: profile ? profile.details : { email: auth.user.email, fullName: auth.user.name ?? "" },
    configured: provider() === "paddle" ? { paddle: paddleConfigured(), starter: paddleConfigured(), custom: paddleConfigured(), yearly: paddleYearlyConfigured() } : { stripe: Boolean(process.env.STRIPE_SECRET_KEY), starter: Boolean(priceIdFor("STARTER")), custom: Boolean(priceIdFor("CUSTOM")), yearly: Boolean(process.env.STRIPE_SECRET_KEY && priceIdFor("STARTER", process.env, "year") && priceIdFor("CUSTOM", process.env, "year")) },
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (auth.membership.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const raw = await request.json().catch(() => null) as Record<string, unknown> | null;
  // Card numbers are entered only in Paddle's frame; never accept them here.
  if (looksLikeCardData(raw)) return NextResponse.json({ error: "CARD_DATA_NOT_ACCEPTED" }, { status: 400 });
  // Older clients sent { plan: "START" | "GROWTH" }.
  const legacy = raw && !raw.action && typeof raw.plan === "string" ? { action: "checkout", plan: raw.plan === "GROWTH" ? "CUSTOM" : raw.plan === "START" ? "STARTER" : raw.plan } : raw;
  const parsed = actionSchema.safeParse(legacy);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  const base = process.env.PUBLIC_APP_URL ?? new URL(request.url).origin;
  const subscription = await db.subscription.findUnique({ where: { workspaceId: auth.workspaceId } });
  try {
    if (parsed.data.action === "portal") {
      if (!subscription?.externalCustomerId) return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 409 });
      const url = subscription.provider === "PADDLE" ? await paddlePortalUrl(subscription.externalCustomerId, subscription.externalPlanId) : await billingPortalUrl(subscription.externalCustomerId, `${base}/app?section=billing`);
      return NextResponse.json({ url });
    }
    // Nobody is charged while every plan is open for testing.
    if (openAccessEnabled()) return NextResponse.json({ error: "OPEN_ACCESS" }, { status: 409 });
    const { plan, interval } = parsed.data;
    const live = Boolean(subscription?.externalPlanId?.startsWith("sub_") && LIVE.includes(subscription.status));

    if (provider() === "paddle") {
      if (!paddleConfigured() || (interval === "year" && !paddleYearlyConfigured())) return NextResponse.json({ error: "BILLING_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
      // A live subscription is switched in place (plan and/or monthly ⇄ yearly, prorated) — never a second subscription.
      if (live && subscription!.provider === "PADDLE") {
        if (subscription!.status === "PAST_DUE") return NextResponse.json({ error: "PAST_DUE" }, { status: 409 });
        await changePaddlePlan(subscription!.externalPlanId!, plan, interval);
        await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "BILLING_PLAN_CHANGED", entityType: "Subscription", metadata: { provider: "PADDLE", plan, interval } } }).catch(() => undefined);
        return NextResponse.json({ changed: true, plan, interval });
      }
      if (!parsed.data.details) return NextResponse.json({ error: "DETAILS_REQUIRED" }, { status: 400 });
      const profile = await readBillingProfile(auth.workspaceId).catch(() => null);
      const ids = await syncPaddleCustomer(parsed.data.details, profile ?? {});
      await saveBillingProfile(auth.workspaceId, parsed.data.details, ids);
      const transactionId = await createPaddleTransaction({ ...ids, plan, interval, workspaceId: auth.workspaceId });
      await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "BILLING_CHECKOUT_STARTED", entityType: "Subscription", metadata: { provider: "PADDLE", plan, interval, transactionId } } }).catch(() => undefined);
      return NextResponse.json({ paddle: { transactionId, clientToken: process.env.PADDLE_CLIENT_TOKEN, environment: paddleEnvironment(), successUrl: `${base}/app?section=billing&billing=success` } });
    }

    const priceId = priceIdFor(plan, process.env, interval);
    if (!priceId || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "BILLING_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
    if (live) { await changeSubscriptionPrice(subscription!.externalPlanId!, priceId); return NextResponse.json({ changed: true, plan, interval }); }
    return NextResponse.json(await new StripeBillingProvider().createCheckout({ workspaceId: auth.workspaceId, email: auth.user.email, priceId, plan, successUrl: `${base}/app?section=billing&billing=success`, cancelUrl: `${base}/app?section=billing&billing=cancelled` }));
  } catch (error) {
    const status = error instanceof PaddleError && error.status === 503 ? 503 : 502;
    return NextResponse.json({ error: status === 503 ? "BILLING_PROVIDER_NOT_CONFIGURED" : "CHECKOUT_FAILED", message: error instanceof Error ? error.message : "Unknown error" }, { status });
  }
}
