import { db } from "@/lib/db";
import type { BillingDetails } from "./paddle";

// Payer details (name, address, company) entered on the checkout page, kept to
// prefill the next payment, plus the Paddle customer/address/business ids.
// Card data is never stored here — it lives only at Paddle.
// The table is additive and created on first use (no Prisma migration needed).

export type BillingProfile = { details: BillingDetails; customerId: string | null; addressId: string | null; businessId: string | null; updatedAt: string };

let ready: Promise<unknown> | undefined;
function ensureTable() {
  ready ??= db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BillingProfile" ("workspaceId" TEXT PRIMARY KEY, "details" JSONB NOT NULL, "paddleCustomerId" TEXT, "paddleAddressId" TEXT, "paddleBusinessId" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(error => { ready = undefined; throw error; });
  return ready;
}

export async function readBillingProfile(workspaceId: string): Promise<BillingProfile | null> {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<Array<{ details: BillingDetails; paddleCustomerId: string | null; paddleAddressId: string | null; paddleBusinessId: string | null; updatedAt: Date }>>(`SELECT "details", "paddleCustomerId", "paddleAddressId", "paddleBusinessId", "updatedAt" FROM "BillingProfile" WHERE "workspaceId" = $1`, workspaceId);
  const row = rows[0];
  return row ? { details: typeof row.details === "string" ? JSON.parse(row.details) : row.details, customerId: row.paddleCustomerId, addressId: row.paddleAddressId, businessId: row.paddleBusinessId, updatedAt: new Date(row.updatedAt).toISOString() } : null;
}

export async function saveBillingProfile(workspaceId: string, details: BillingDetails, ids: { customerId: string; addressId: string; businessId: string | null }) {
  await ensureTable();
  await db.$executeRawUnsafe(`INSERT INTO "BillingProfile" ("workspaceId", "details", "paddleCustomerId", "paddleAddressId", "paddleBusinessId", "updatedAt") VALUES ($1, $2::jsonb, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT ("workspaceId") DO UPDATE SET "details" = EXCLUDED."details", "paddleCustomerId" = EXCLUDED."paddleCustomerId", "paddleAddressId" = EXCLUDED."paddleAddressId", "paddleBusinessId" = EXCLUDED."paddleBusinessId", "updatedAt" = CURRENT_TIMESTAMP`,
    workspaceId, JSON.stringify(details), ids.customerId, ids.addressId, ids.businessId);
}
