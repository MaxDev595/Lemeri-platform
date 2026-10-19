import { NextResponse } from "next/server";

// Billing webhooks: /api/webhooks/stripe (optional Stripe fallback). P2P payments
// need no webhook — an admin confirms them in the admin panel.
export async function POST(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (type === "stripe") return (await import("@/lib/billing/stripe-webhook")).handleStripeWebhook(request);
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}
