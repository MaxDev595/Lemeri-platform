import { NextResponse } from "next/server";

// Billing webhooks: /api/webhooks/paddle and /api/webhooks/stripe. One route for both
// keeps the Worker bundle small; handlers are loaded on demand.
export async function POST(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (type === "paddle") return (await import("@/lib/billing/paddle-webhook")).handlePaddleWebhook(request);
  if (type === "stripe") return (await import("@/lib/billing/stripe-webhook")).handleStripeWebhook(request);
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}
