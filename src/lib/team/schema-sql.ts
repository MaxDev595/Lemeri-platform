// Team hub (messenger, report requests, employee accounts). Additive and idempotent;
// applied together with the CRM schema by applyCrmSchema().
const ts = `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`;
const cascade = (table: string, column: string, target: string) =>
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${table}_${column}_fkey') THEN ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${column}_fkey" FOREIGN KEY ("${column}") REFERENCES "${target}"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$`;

export const TEAM_SCHEMA_STATEMENTS: string[] = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountType" TEXT NOT NULL DEFAULT 'OWNER'`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "position" TEXT`,
  `ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "position" TEXT`,
  `ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "aiSeat" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3)`,
  `CREATE TABLE IF NOT EXISTS "TeamMessage" ("id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "thread" TEXT NOT NULL, "senderMemberId" TEXT, "kind" TEXT NOT NULL DEFAULT 'TEXT', "body" TEXT NOT NULL DEFAULT '', "taskId" TEXT, "aiAssisted" BOOLEAN NOT NULL DEFAULT false, "meta" JSONB, "createdAt" ${ts})`,
  `CREATE INDEX IF NOT EXISTS "TeamMessage_workspace_thread_idx" ON "TeamMessage" ("workspaceId", "thread", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "TeamRead" ("memberId" TEXT NOT NULL, "thread" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "readAt" ${ts}, PRIMARY KEY ("memberId", "thread"))`,
  `CREATE TABLE IF NOT EXISTS "TeamTask" ("id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'REPORT', "title" TEXT NOT NULL, "note" TEXT, "template" TEXT NOT NULL DEFAULT 'daily', "requesterMemberId" TEXT NOT NULL, "assigneeMemberId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "dueAt" TIMESTAMP(3), "report" JSONB, "aiAssisted" BOOLEAN NOT NULL DEFAULT false, "viaAi" BOOLEAN NOT NULL DEFAULT false, "createdAt" ${ts}, "completedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), "cancelReason" TEXT)`,
  `CREATE INDEX IF NOT EXISTS "TeamTask_assignee_idx" ON "TeamTask" ("workspaceId", "assigneeMemberId", "status")`,
  `CREATE INDEX IF NOT EXISTS "TeamTask_requester_idx" ON "TeamTask" ("workspaceId", "requesterMemberId", "status")`,
  `CREATE TABLE IF NOT EXISTS "WorkspaceJoinCode" ("workspaceId" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "createdAt" ${ts})`,
  `CREATE TABLE IF NOT EXISTS "JoinRequest" ("id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "position" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "createdAt" ${ts}, "decidedAt" TIMESTAMP(3), UNIQUE ("workspaceId", "userId"))`,
  cascade("TeamMessage", "workspaceId", "Workspace"),
  cascade("TeamRead", "workspaceId", "Workspace"),
  cascade("TeamTask", "workspaceId", "Workspace"),
  cascade("WorkspaceJoinCode", "workspaceId", "Workspace"),
  cascade("JoinRequest", "workspaceId", "Workspace"),
  cascade("JoinRequest", "userId", "User"),
];
