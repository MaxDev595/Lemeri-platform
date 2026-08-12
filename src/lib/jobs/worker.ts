import { db } from "@/lib/db";
import { enforceWorkspaceRetention } from "@/lib/privacy/retention";
import { claimJobs } from "./queue";
import { indexKnowledgeSource } from "@/lib/knowledge/index";
import { decryptCredentials } from "@/lib/security/encryption";
import { getConnector } from "@/lib/connectors/registry";
import { deliverCrmWebhook, type WebhookCRMConfig } from "@/lib/integrations/webhook-crm";
import { crawlWebsite } from "@/lib/knowledge/website";
import { chunkText } from "@/lib/knowledge/chunk";
import { getWorkspaceTranslator } from "@/lib/workspace-locale";

type JobPayload = Record<string, unknown>;

async function exposeTerminalFailure(job: { type: string; workspaceId: string; payload: unknown }, message: string) {
  const {t}=await getWorkspaceTranslator(job.workspaceId);
  const payload = job.payload as JobPayload;
  if ((job.type === "WEBSITE_INGEST" || job.type === "KNOWLEDGE_INDEX") && typeof payload.sourceId === "string") {
    await db.knowledgeSource.updateMany({ where: { id: payload.sourceId, workspaceId: job.workspaceId }, data: { status: "FAILED" } });
  } else if (job.type === "CRM_EVENT" && typeof payload.integrationId === "string") {
    await db.integration.updateMany({ where: { id: payload.integrationId, workspaceId: job.workspaceId }, data: { status: "ERROR", lastError: message } });
  } else if (job.type === "OUTBOUND_CHANNEL_MESSAGE" && typeof payload.channelId === "string") {
    await db.channel.updateMany({ where: { id: payload.channelId, workspaceId: job.workspaceId }, data: { lastError: message } });
  }
  await db.notification.create({ data: { workspaceId: job.workspaceId, type: "JOB", title: t("server.jobFailedTitle"), body: `${job.type}: ${message}`.slice(0, 1000) } });
}

export async function runJobBatch(limit = 10) {
  const jobs = await claimJobs(limit);
  const results: Array<{ id: string; status: string }> = [];
  for (const job of jobs) {
    try {
      if (job.type === "SESSION_CLEANUP") {
        await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      } else if (job.type === "RETENTION_ENFORCEMENT") {
        await enforceWorkspaceRetention(job.workspaceId);
      } else if (job.type === "NOTIFY_MANAGER") {
        const payload = job.payload as { title?: string; body?: string };
        const {t}=await getWorkspaceTranslator(job.workspaceId);
        await db.notification.create({ data: { workspaceId: job.workspaceId, type: "JOB", title: payload.title ?? t("server.notificationTitle"), body: payload.body ?? t("server.jobCompleted") } });
      } else if (job.type === "ANALYTICS_AGGREGATION") {
        await db.analyticsEvent.create({ data: { workspaceId: job.workspaceId, type: "ANALYTICS_AGGREGATED", payload: { jobId: job.id } } });
      } else if (job.type === "KNOWLEDGE_INDEX") {
        const payload = job.payload as { sourceId?: string };
        if (!payload.sourceId) throw new Error("KNOWLEDGE_INDEX requires sourceId");
        await indexKnowledgeSource(job.workspaceId, payload.sourceId);
      } else if (job.type === "OUTBOUND_CHANNEL_MESSAGE") {
        const payload = job.payload as { channelId?: string; recipientId?: string; text?: string; messageId?: string };
        if (!payload.channelId || !payload.recipientId || !payload.text || !payload.messageId) throw new Error("Invalid outbound channel payload");
        const channel = await db.channel.findFirst({ where: { id: payload.channelId, workspaceId: job.workspaceId, status: "CONNECTED" } });
        if (!channel?.configEncrypted) throw new Error("Connected channel not found");
        const sent = await getConnector(channel.type).sendMessage(decryptCredentials<Record<string, string>>(channel.configEncrypted), payload.recipientId, payload.text);
        await db.message.updateMany({ where: { id: payload.messageId, conversation: { workspaceId: job.workspaceId } }, data: { externalId: `${channel.type}:${sent.externalMessageId}` } });
        await db.channel.update({ where: { id: channel.id }, data: { lastError: null } });
      } else if (job.type === "CRM_EVENT") {
        const payload = job.payload as { integrationId?: string; event?: string; data?: object; idempotencyKey?: string };
        if (!payload.integrationId || !payload.event || !payload.data || !payload.idempotencyKey) throw new Error("Invalid CRM event payload");
        const integration = await db.integration.findFirst({ where: { id: payload.integrationId, workspaceId: job.workspaceId, status: "CONNECTED" } });
        if (!integration?.credentialsEncrypted) throw new Error("Connected CRM integration not found");
        await deliverCrmWebhook(decryptCredentials<WebhookCRMConfig>(integration.credentialsEncrypted), payload.event, payload.data, payload.idempotencyKey);
        await db.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), lastError: null } });
      } else if (job.type === "WEBSITE_INGEST") {
        const payload = job.payload as { sourceId?: string };
        if (!payload.sourceId) throw new Error("WEBSITE_INGEST requires sourceId");
        const source = await db.knowledgeSource.findFirst({ where: { id: payload.sourceId, workspaceId: job.workspaceId } });
        if (!source?.uri) throw new Error("Website source not found");
        const pages = await crawlWebsite(source.uri);
        const {t}=await getWorkspaceTranslator(job.workspaceId);
        await db.$transaction(async (tx) => {
          await tx.knowledgeDocument.deleteMany({ where: { sourceId: source.id } });
          for (const page of pages) await tx.knowledgeDocument.create({ data: { sourceId: source.id, title: page.title, content: page.content, chunks: { create: chunkText(page.content).map((content, index) => ({ content, sourceLabel: `${page.title} · ${page.url} · ${t("server.fragment",{index:index+1})}` })) } } });
          await tx.backgroundJob.create({ data: { workspaceId: job.workspaceId, type: "KNOWLEDGE_INDEX", payload: { sourceId: source.id } } });
        });
      } else {
        throw new Error(`Unsupported job type: ${job.type}`);
      }
      await db.backgroundJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null } });
      results.push({ id: job.id, status: "COMPLETED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown failure";
      const retry = job.attempts + 1 < 5;
      await db.backgroundJob.update({ where: { id: job.id }, data: { status: retry ? "PENDING" : "FAILED", runAfter: new Date(Date.now() + Math.min(60_000, 2 ** job.attempts * 1000)), lockedAt: null, lastError: message } });
      if (!retry) await exposeTerminalFailure(job, message);
      results.push({ id: job.id, status: retry ? "RETRY" : "FAILED" });
    }
  }
  return results;
}
