import { db } from "@/lib/db";
import { canSendAiReply, resolveAccess, type Access } from "./plans";

// What a workspace may use right now (plan, trial, AI allowance). One query.
export async function workspaceAccess(workspaceId: string): Promise<Access> {
  const rows = await db.$queryRawUnsafe<Array<{ plan: string | null; status: string | null; currentPeriodStart: Date | null; currentPeriodEnd: Date | null; ownerCreatedAt: Date | null }>>(
    `SELECT s."plan", s."status", s."currentPeriodStart", s."currentPeriodEnd",
       (SELECT MIN(u."createdAt") FROM "WorkspaceMember" m JOIN "User" u ON u."id" = m."userId" WHERE m."workspaceId" = w."id" AND m."role" = 'OWNER') AS "ownerCreatedAt"
     FROM "Workspace" w LEFT JOIN "Subscription" s ON s."workspaceId" = w."id" WHERE w."id" = $1`, workspaceId);
  const row = rows[0];
  return resolveAccess({ workspaceId, ownerCreatedAt: row?.ownerCreatedAt ?? null, subscription: row?.plan ? { plan: row.plan, status: row.status, currentPeriodStart: row.currentPeriodStart, currentPeriodEnd: row.currentPeriodEnd } : null });
}

/** AI replies given in the current usage period (each reply writes one AI_RESPONSE event). */
export async function aiRepliesUsed(workspaceId: string, access: Access) {
  const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT COUNT(*)::int AS "n" FROM "AnalyticsEvent" WHERE "workspaceId" = $1 AND "type" = 'AI_RESPONSE' AND "createdAt" >= $2::timestamptz AND "createdAt" < $3::timestamptz`, workspaceId, access.periodStart, access.periodEnd);
  return Number(rows[0]?.n ?? 0);
}

/** Can the AI answer one more visitor message? */
export async function aiReplyGate(workspaceId: string) {
  const access = await workspaceAccess(workspaceId);
  if (!access.aiAllowed) return { ok: false as const, reason: "PLAN_INACTIVE" as const, access, used: 0 };
  const used = await aiRepliesUsed(workspaceId, access);
  return canSendAiReply(used, access) ? { ok: true as const, access, used } : { ok: false as const, reason: "PLAN_MESSAGE_LIMIT_REACHED" as const, access, used };
}
