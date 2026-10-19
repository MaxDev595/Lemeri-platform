import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CheckoutClient } from "@/components/billing/checkout-client";

// Subscription checkout: P2P transfer instructions + «Я оплатил».
export default async function Checkout({ searchParams }: { searchParams: Promise<{ plan?: string; interval?: string }> }) {
  const context = await requireWorkspace();
  const { plan, interval } = await searchParams;
  if (plan !== "STARTER" && plan !== "CUSTOM") redirect("/app?section=billing");
  if (context.membership.role !== "OWNER") redirect("/app?section=billing");
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId: context.workspace.id }, select: { locale: true } });
  return <CheckoutClient locale={settings?.locale === "en" ? "en" : "ru"} plan={plan} interval={interval === "year" ? "year" : "month"}/>;
}
