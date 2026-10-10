import type { Prisma } from "@/generated/prisma/client";
import { canActivateEmployee, effectivePlan } from "@/lib/billing/plans";

export class BillingLimitError extends Error {
  readonly code: "PLAN_EMPLOYEE_LIMIT_REACHED" | "PLAN_CONVERSATION_LIMIT_REACHED";

  constructor(publicCode: "PLAN_EMPLOYEE_LIMIT_REACHED" | "PLAN_CONVERSATION_LIMIT_REACHED") {
    super(publicCode);
    this.code = publicCode;
    this.name = "BillingLimitError";
  }
}

export async function lockConversationCreation(tx: Prisma.TransactionClient, workspaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lemiri:conversation-limit:${workspaceId}`}, 0))`;
}

// Conversations are no longer capped per plan (AI replies are, see billing/access.ts).
// The advisory lock still serialises concurrent creation for one visitor.
export async function assertConversationCreationAllowed(tx: Prisma.TransactionClient, workspaceId: string) {
  await lockConversationCreation(tx, workspaceId);
}

export async function assertEmployeeActivationAllowed(tx: Prisma.TransactionClient, workspaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lemiri:employee-limit:${workspaceId}`}, 0))`;
  const [subscription, activeEmployees] = await Promise.all([
    tx.subscription.findUnique({ where: { workspaceId }, select: { plan: true, status: true } }),
    tx.aIEmployee.count({ where: { workspaceId, status: "ACTIVE" } }),
  ]);
  const plan = effectivePlan(subscription?.plan, subscription?.status);
  if (!canActivateEmployee(activeEmployees, plan)) throw new BillingLimitError("PLAN_EMPLOYEE_LIMIT_REACHED");
}
