CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'VIEWER');
CREATE TYPE "EmployeeStatus" AS ENUM ('DRAFT', 'TRAINING', 'TESTING', 'ACTIVE', 'PAUSED', 'ERROR');

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT, "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Session" (
  "id" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "ipHash" TEXT, "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "windowStart" TIMESTAMP(3) NOT NULL, "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkspaceMember" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "role" "MemberRole" NOT NULL DEFAULT 'MANAGER',
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkspaceInvitation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "email" TEXT NOT NULL, "role" "MemberRole" NOT NULL DEFAULT 'MANAGER',
  "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkspaceSettings" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "locale" TEXT NOT NULL DEFAULT 'ru',
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow', "dataRetentionDays" INTEGER NOT NULL DEFAULT 365,
  "analyticsEnabled" BOOLEAN NOT NULL DEFAULT true, "aiTrainingOptIn" BOOLEAN NOT NULL DEFAULT false,
  "theme" TEXT NOT NULL DEFAULT 'system', "logoUrl" TEXT, "workingHours" JSONB, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AIEmployee" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "assignedMemberId" TEXT, "name" TEXT NOT NULL, "role" TEXT NOT NULL,
  "status" "EmployeeStatus" NOT NULL DEFAULT 'DRAFT', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AIEmployee_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AIEmployeeSettings" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "goal" TEXT NOT NULL, "tone" TEXT NOT NULL,
  "instructions" TEXT, "handoffRules" JSONB NOT NULL, CONSTRAINT "AIEmployeeSettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KnowledgeSource" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "type" TEXT NOT NULL, "title" TEXT NOT NULL,
  "status" TEXT NOT NULL, "uri" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KnowledgeDocument" (
  "id" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "title" TEXT NOT NULL, "content" TEXT,
  CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KnowledgeChunk" (
  "id" TEXT NOT NULL, "documentId" TEXT NOT NULL, "content" TEXT NOT NULL, "sourceLabel" TEXT NOT NULL,
  "embedding" vector, CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Customer" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "phone" TEXT, "email" TEXT, "externalId" TEXT,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "assignedMemberId" TEXT, "employeeId" TEXT, "customerId" TEXT NOT NULL,
  "status" TEXT NOT NULL, "channelType" TEXT NOT NULL, "externalId" TEXT, "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Message" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "direction" TEXT NOT NULL, "content" TEXT NOT NULL,
  "sources" JSONB, "externalId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Lead" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "assignedMemberId" TEXT, "customerId" TEXT NOT NULL, "stage" TEXT NOT NULL,
  "interest" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Appointment" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "service" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL, CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Channel" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "employeeId" TEXT, "type" TEXT NOT NULL, "status" TEXT NOT NULL,
  "configEncrypted" TEXT, "externalId" TEXT, "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Integration" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "provider" TEXT NOT NULL, "status" TEXT NOT NULL,
  "credentialsEncrypted" TEXT, "lastSyncAt" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ActionDefinition" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL, "inputSchema" JSONB NOT NULL,
  CONSTRAINT "ActionDefinition_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ActionPermission" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "actionKey" TEXT NOT NULL, "actionId" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ActionPermission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ActionExecution" (
  "id" TEXT NOT NULL, "actionId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "conversationId" TEXT,
  "input" JSONB NOT NULL, "output" JSONB, "status" TEXT NOT NULL, "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ActionExecution_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Automation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "trigger" TEXT NOT NULL,
  "conditions" JSONB NOT NULL, "steps" JSONB NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "type" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL,
  "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BackgroundJob" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "type" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT, "actorType" TEXT NOT NULL, "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL, "entityId" TEXT, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HumanHandoff" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "reason" TEXT NOT NULL, "summary" TEXT NOT NULL,
  "status" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "HumanHandoff_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "type" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "provider" TEXT NOT NULL, "externalCustomerId" TEXT,
  "externalPlanId" TEXT, "plan" TEXT NOT NULL DEFAULT 'TRIAL', "status" TEXT NOT NULL DEFAULT 'TRIALING',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false, "providerEventId" TEXT, "providerEventCreatedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UsageRecord" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "metric" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OperationalEvent" (
  "id" TEXT NOT NULL, "workspaceId" TEXT, "requestId" TEXT, "category" TEXT NOT NULL, "severity" TEXT NOT NULL,
  "code" TEXT NOT NULL, "message" TEXT NOT NULL, "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AITestCase" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "customerMessage" TEXT NOT NULL, "expectedContains" TEXT, "expectedHandoff" BOOLEAN, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastStatus" TEXT, "lastResponse" TEXT, "lastConfidence" DOUBLE PRECISION, "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AITestCase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KnowledgeGap" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "question" TEXT NOT NULL, "occurrences" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "KnowledgeGap_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AIInsight" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "type" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT NOT NULL, "severity" TEXT NOT NULL, "evidence" JSONB NOT NULL, "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AIInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash"); CREATE INDEX "Session_userId_idx" ON "Session"("userId"); CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash"); CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON "PasswordResetToken"("userId"); CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE UNIQUE INDEX "RateLimitBucket_key_windowStart_key" ON "RateLimitBucket"("key", "windowStart"); CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId"); CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");
CREATE UNIQUE INDEX "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash"); CREATE UNIQUE INDEX "WorkspaceInvitation_workspaceId_email_key" ON "WorkspaceInvitation"("workspaceId", "email"); CREATE INDEX "WorkspaceInvitation_workspaceId_expiresAt_idx" ON "WorkspaceInvitation"("workspaceId", "expiresAt");
CREATE UNIQUE INDEX "WorkspaceSettings_workspaceId_key" ON "WorkspaceSettings"("workspaceId");
CREATE INDEX "AIEmployee_workspaceId_idx" ON "AIEmployee"("workspaceId"); CREATE INDEX "AIEmployee_assignedMemberId_idx" ON "AIEmployee"("assignedMemberId"); CREATE UNIQUE INDEX "AIEmployeeSettings_employeeId_key" ON "AIEmployeeSettings"("employeeId");
CREATE INDEX "KnowledgeSource_workspaceId_idx" ON "KnowledgeSource"("workspaceId"); CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");
CREATE INDEX "Customer_workspaceId_idx" ON "Customer"("workspaceId"); CREATE UNIQUE INDEX "Customer_workspaceId_externalId_key" ON "Customer"("workspaceId", "externalId");
CREATE INDEX "Conversation_workspaceId_status_idx" ON "Conversation"("workspaceId", "status"); CREATE INDEX "Conversation_assignedMemberId_idx" ON "Conversation"("assignedMemberId"); CREATE UNIQUE INDEX "Conversation_workspaceId_channelType_externalId_key" ON "Conversation"("workspaceId", "channelType", "externalId");
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId"); CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Lead_workspaceId_stage_idx" ON "Lead"("workspaceId", "stage"); CREATE INDEX "Lead_assignedMemberId_idx" ON "Lead"("assignedMemberId"); CREATE INDEX "Appointment_workspaceId_startsAt_idx" ON "Appointment"("workspaceId", "startsAt");
CREATE UNIQUE INDEX "Channel_workspaceId_type_key" ON "Channel"("workspaceId", "type"); CREATE INDEX "Channel_workspaceId_idx" ON "Channel"("workspaceId");
CREATE UNIQUE INDEX "Integration_workspaceId_provider_key" ON "Integration"("workspaceId", "provider"); CREATE INDEX "Integration_workspaceId_idx" ON "Integration"("workspaceId");
CREATE UNIQUE INDEX "ActionDefinition_key_key" ON "ActionDefinition"("key"); CREATE UNIQUE INDEX "ActionPermission_employeeId_actionKey_key" ON "ActionPermission"("employeeId", "actionKey");
CREATE INDEX "ActionExecution_employeeId_createdAt_idx" ON "ActionExecution"("employeeId", "createdAt"); CREATE INDEX "ActionExecution_conversationId_idx" ON "ActionExecution"("conversationId");
CREATE INDEX "Automation_workspaceId_idx" ON "Automation"("workspaceId"); CREATE INDEX "Notification_workspaceId_readAt_createdAt_idx" ON "Notification"("workspaceId", "readAt", "createdAt");
CREATE INDEX "BackgroundJob_status_runAfter_idx" ON "BackgroundJob"("status", "runAfter"); CREATE INDEX "BackgroundJob_workspaceId_idx" ON "BackgroundJob"("workspaceId");
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt"); CREATE INDEX "AnalyticsEvent_workspaceId_type_createdAt_idx" ON "AnalyticsEvent"("workspaceId", "type", "createdAt");
CREATE UNIQUE INDEX "Subscription_workspaceId_key" ON "Subscription"("workspaceId"); CREATE UNIQUE INDEX "UsageRecord_workspaceId_metric_periodStart_key" ON "UsageRecord"("workspaceId", "metric", "periodStart"); CREATE INDEX "UsageRecord_workspaceId_periodStart_idx" ON "UsageRecord"("workspaceId", "periodStart");
CREATE INDEX "OperationalEvent_workspaceId_createdAt_idx" ON "OperationalEvent"("workspaceId", "createdAt"); CREATE INDEX "OperationalEvent_severity_createdAt_idx" ON "OperationalEvent"("severity", "createdAt");
CREATE INDEX "AITestCase_workspaceId_employeeId_idx" ON "AITestCase"("workspaceId", "employeeId"); CREATE UNIQUE INDEX "KnowledgeGap_workspaceId_question_key" ON "KnowledgeGap"("workspaceId", "question"); CREATE INDEX "KnowledgeGap_workspaceId_status_occurrences_idx" ON "KnowledgeGap"("workspaceId", "status", "occurrences"); CREATE INDEX "AIInsight_workspaceId_dismissedAt_createdAt_idx" ON "AIInsight"("workspaceId", "dismissedAt", "createdAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIEmployee" ADD CONSTRAINT "AIEmployee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "AIEmployeeSettings" ADD CONSTRAINT "AIEmployeeSettings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "AIEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIEmployee" ADD CONSTRAINT "AIEmployee_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "AIEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE; ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "Channel" ADD CONSTRAINT "Channel_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "AIEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionPermission" ADD CONSTRAINT "ActionPermission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "AIEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "ActionPermission" ADD CONSTRAINT "ActionPermission_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE; ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "AIEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HumanHandoff" ADD CONSTRAINT "HumanHandoff_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AITestCase" ADD CONSTRAINT "AITestCase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "AITestCase" ADD CONSTRAINT "AITestCase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "AIEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGap" ADD CONSTRAINT "KnowledgeGap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "AIInsight" ADD CONSTRAINT "AIInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
