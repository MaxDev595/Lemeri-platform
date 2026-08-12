import type { Prisma } from "@prisma/client";
import { canActivateEmployee, canCreateConversation, effectivePlan } from "@/lib/billing/plans";

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

export async function assertConversationCreationAllowed(tx: Prisma.TransactionClient, workspaceId: string, date = new Date()) {
  await lockConversationCreation(tx, workspaceId);
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const [subscription, monthlyConversations] = await Promise.all([
    tx.subscription.findUnique({ where: { workspaceId }, select: { plan: true, status: true } }),
    tx.conversation.count({ where: { workspaceId, createdAt: { gte: periodStart, lt: periodEnd } } }),
  ]);
  const plan = effectivePlan(subscription?.plan, subscription?.status);
  if (!canCreateConversation(monthlyConversations, plan)) throw new BillingLimitError("PLAN_CONVERSATION_LIMIT_REACHED");
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
