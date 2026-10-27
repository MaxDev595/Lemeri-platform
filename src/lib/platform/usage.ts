// Admin panel «Кто использует ИИ-продавца»: every customer workspace with a
// website card, the sites where the card actually loads and how much it talks.
// Sites come from the WEBSITE channel's encrypted config: `seen` is written by
// embed.js when a third-party page loads the card (once per 30 min per origin,
// lib/widget/channel.ts), `allowedOrigins` is what the customer allowed.

import { db } from "@/lib/db";
import { decryptCredentials } from "@/lib/security/encryption";
import type { WebsiteChannelConfig } from "@/lib/widget/settings";
import { usageDomains, type UsageDomain } from "./usage-domains";

export type { UsageDomain };
export type UsageRow = {
  workspaceId: string; workspace: string; ownerEmail: string | null; createdAt: string;
  employee: string | null; employeeActive: boolean; cardConnected: boolean;
  plan: string; planStatus: string | null; periodEnd: string | null;
  domains: UsageDomain[]; lastSeenAt: string | null;
  dialogs30: number; lastDialogAt: string | null; own: boolean;
};
export type AssistantUsage = { rows: UsageRow[]; summary: { workspaces: number; live: number; domains: number; dialogs30: number } };

const LIVE_MS = 7 * 86_400_000;

export async function assistantUsage(platformWorkspaceId: string | null, limit = 300, now = Date.now()): Promise<AssistantUsage> {
  const since = new Date(now - 30 * 86_400_000);
  const rows = await db.$queryRawUnsafe<Array<{
    workspaceId: string; workspace: string; createdAt: Date; configEncrypted: string | null; channelStatus: string;
    employee: string | null; employeeStatus: string | null; plan: string | null; planStatus: string | null; periodEnd: Date | null;
    ownerEmail: string | null; dialogs30: number; lastDialogAt: Date | null;
  }>>(
    `SELECT c."workspaceId", w."name" AS "workspace", w."createdAt", c."configEncrypted", c."status" AS "channelStatus",
       e."name" AS "employee", e."status"::text AS "employeeStatus", s."plan", s."status" AS "planStatus", s."currentPeriodEnd" AS "periodEnd",
       (SELECT u."email" FROM "WorkspaceMember" m JOIN "User" u ON u."id" = m."userId" WHERE m."workspaceId" = c."workspaceId" AND m."role" = 'OWNER' ORDER BY m."id" LIMIT 1) AS "ownerEmail",
       (SELECT count(*)::int FROM "Conversation" v WHERE v."workspaceId" = c."workspaceId" AND v."channelType" = 'WEBSITE' AND v."createdAt" >= $1) AS "dialogs30",
       (SELECT max(v."createdAt") FROM "Conversation" v WHERE v."workspaceId" = c."workspaceId" AND v."channelType" = 'WEBSITE') AS "lastDialogAt"
     FROM "Channel" c
     JOIN "Workspace" w ON w."id" = c."workspaceId"
     LEFT JOIN "AIEmployee" e ON e."id" = c."employeeId"
     LEFT JOIN "Subscription" s ON s."workspaceId" = c."workspaceId"
     WHERE c."type" = 'WEBSITE'
     ORDER BY c."updatedAt" DESC
     LIMIT $2`, since, limit);
  const ownHosts = ["lemeriai.com", "www.lemeriai.com"];
  try { if (process.env.PUBLIC_APP_URL) ownHosts.push(new URL(process.env.PUBLIC_APP_URL).host); } catch { /* invalid env */ }
  // One workspace can have several website channels: merge them.
  const merged = new Map<string, UsageRow>();
  for (const row of rows) {
    let config: WebsiteChannelConfig | null = null;
    if (row.configEncrypted) { try { config = decryptCredentials<WebsiteChannelConfig>(row.configEncrypted); } catch { /* unreadable config */ } }
    const domains = usageDomains(config, ownHosts);
    const prev = merged.get(row.workspaceId);
    const iso = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
    const item: UsageRow = prev ?? {
      workspaceId: row.workspaceId, workspace: row.workspace, ownerEmail: row.ownerEmail, createdAt: iso(row.createdAt)!,
      employee: row.employee, employeeActive: row.employeeStatus === "ACTIVE", cardConnected: false,
      plan: row.plan ?? "TRIAL", planStatus: row.planStatus, periodEnd: iso(row.periodEnd),
      domains: [], lastSeenAt: null, dialogs30: Number(row.dialogs30) || 0, lastDialogAt: iso(row.lastDialogAt), own: row.workspaceId === platformWorkspaceId,
    };
    item.cardConnected ||= row.channelStatus === "CONNECTED";
    for (const domain of domains) if (!item.domains.some(d => d.host === domain.host)) item.domains.push(domain);
    item.lastSeenAt = item.domains.reduce<string | null>((max, d) => d.lastSeenAt && (!max || d.lastSeenAt > max) ? d.lastSeenAt : max, null);
    merged.set(row.workspaceId, item);
  }
  const list = [...merged.values()].sort((a, b) => Number(a.own) - Number(b.own) || (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") || b.dialogs30 - a.dialogs30 || b.createdAt.localeCompare(a.createdAt));
  const isLive = (iso: string | null) => Boolean(iso && now - Date.parse(iso) <= LIVE_MS);
  const customers = list.filter(row => !row.own);
  return {
    rows: list,
    summary: {
      workspaces: customers.length,
      live: customers.filter(row => isLive(row.lastSeenAt)).length,
      domains: new Set(customers.flatMap(row => row.domains.filter(d => d.lastSeenAt).map(d => d.host))).size,
      dialogs30: customers.reduce((sum, row) => sum + row.dialogs30, 0),
    },
  };
}
