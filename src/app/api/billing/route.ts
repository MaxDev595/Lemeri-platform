import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiWorkspace } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { aiRepliesUsed, workspaceAccess } from "@/lib/billing/access";
import { billingPlans } from "@/lib/billing/plans";
import { billingPortalUrl, changeSubscriptionPrice, priceIdFor, StripeBillingProvider } from "@/lib/billing/stripe";

// Trial / Starter ($19) / Custom ($29). The plan state shown here is computed by
// resolveAccess() — the same function the widget and the AI use.
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), plan: z.enum(["STARTER", "CUSTOM"]) }),
  z.object({ action: z.literal("portal") }),
]);

export async function GET() {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const [access, subscription] = await Promise.all([workspaceAccess(auth.workspaceId), db.subscription.findUnique({ where: { workspaceId: auth.workspaceId }, select: { plan: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, externalCustomerId: true } })]);
  const used = await aiRepliesUsed(auth.workspaceId, access);
  return NextResponse.json({
    access, used, plans: billingPlans,
    subscription: subscription ? { plan: subscription.plan, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd.toISOString(), cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, portal: Boolean(subscription.externalCustomerId) } : null,
    configured: { stripe: Boolean(process.env.STRIPE_SECRET_KEY), starter: Boolean(priceIdFor("STARTER")), custom: Boolean(priceIdFor("CUSTOM")) },
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (auth.membership.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const raw = await request.json().catch(() => null) as Record<string, unknown> | null;
  // Older clients sent { plan: "START" | "GROWTH" }.
  const legacy = raw && !raw.action && typeof raw.plan === "string" ? { action: "checkout", plan: raw.plan === "GROWTH" ? "CUSTOM" : raw.plan === "START" ? "STARTER" : raw.plan } : raw;
  const parsed = actionSchema.safeParse(legacy);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const base = process.env.PUBLIC_APP_URL ?? new URL(request.url).origin;
  const subscription = await db.subscription.findUnique({ where: { workspaceId: auth.workspaceId } });
  try {
    if (parsed.data.action === "portal") {
      if (!subscription?.externalCustomerId) return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 409 });
      return NextResponse.json({ url: await billingPortalUrl(subscription.externalCustomerId, `${base}/app?section=billing`) });
    }
    const priceId = priceIdFor(parsed.data.plan);
    if (!priceId || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "BILLING_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
    // A live subscription is switched in place (prorated) — never a second checkout.
    const live = subscription?.externalPlanId?.startsWith("sub_") && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(subscription.status);
    if (live) {
      await changeSubscriptionPrice(subscription!.externalPlanId!, priceId);
      return NextResponse.json({ changed: true, plan: parsed.data.plan });
    }
    return NextResponse.json(await new StripeBillingProvider().createCheckout({ workspaceId: auth.workspaceId, email: auth.user.email, priceId, plan: parsed.data.plan, successUrl: `${base}/app?section=billing&billing=success`, cancelUrl: `${base}/app?section=billing&billing=cancelled` }));
  } catch (error) {
    return NextResponse.json({ error: "CHECKOUT_FAILED", message: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
