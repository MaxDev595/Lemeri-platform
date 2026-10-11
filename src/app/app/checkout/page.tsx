import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { readBillingProfile } from "@/lib/billing/profile";
import { CheckoutClient } from "@/components/billing/checkout-client";

// Subscription checkout: payer details + Paddle's secure card form.
export default async function Checkout({ searchParams }: { searchParams: Promise<{ plan?: string; interval?: string }> }) {
  const context = await requireWorkspace();
  const { plan, interval } = await searchParams;
  if (plan !== "STARTER" && plan !== "CUSTOM") redirect("/app?section=billing");
  if (context.membership.role !== "OWNER") redirect("/app?section=billing");
  const [settings, profile] = await Promise.all([
    db.workspaceSettings.findUnique({ where: { workspaceId: context.workspace.id }, select: { locale: true } }),
    readBillingProfile(context.workspace.id).catch(() => null),
  ]);
  const initial = profile?.details ?? { email: context.user.email, fullName: context.user.name ?? "" };
  return <CheckoutClient locale={settings?.locale === "en" ? "en" : "ru"} plan={plan} interval={interval === "year" ? "year" : "month"} initial={initial}/>;
}
