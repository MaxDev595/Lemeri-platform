import { db } from "@/lib/db";
import { claimJobs, SITE_JOB_TYPES } from "@/lib/jobs/queue";
import { configuredEmbeddingProvider } from "@/lib/ai/embeddings";
import { workspaceAccess } from "@/lib/billing/access";
import { planNumber } from "@/lib/billing/features";
import { getWorkspaceTranslator } from "@/lib/workspace-locale";
import { crawlWebsite } from "./website";
import { saveSitePages } from "./site-queue";

// Runner for website crawls («Изучить сайт»). Kept apart from the general job runner
// (lib/jobs/worker.ts, bundled into every route that drains the queue) so the crawler
// ships only with the routes that need it: study-site, the widget chat and the cron.

export async function runSiteJobs(limit = 1) {
  const jobs = await claimJobs(limit, new Date(), { only: SITE_JOB_TYPES });
  const results: Array<{ id: string; status: string }> = [];
  for (const job of jobs) {
    const payload = job.payload as { sourceId?: string };
    try {
      if (!payload.sourceId) throw new Error("WEBSITE_INGEST requires sourceId");
      const source = await db.knowledgeSource.findFirst({ where: { id: payload.sourceId, workspaceId: job.workspaceId } });
      if (!source?.uri) throw new Error("Website source not found");
      const pages = await crawlWebsite(source.uri, planNumber(await workspaceAccess(job.workspaceId), "siteStudyPages") || 10);
      const { t } = await getWorkspaceTranslator(job.workspaceId);
      // The AI overview of the business is written afterwards (site-study.ts).
      await saveSitePages(source.id, pages, index => t("server.fragment", { index }));
      if (configuredEmbeddingProvider()) await db.backgroundJob.create({ data: { workspaceId: job.workspaceId, type: "KNOWLEDGE_INDEX", payload: { sourceId: source.id } } });
      await db.backgroundJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null } });
      results.push({ id: job.id, status: "COMPLETED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown failure";
      const retry = job.attempts + 1 < 5;
      await db.backgroundJob.update({ where: { id: job.id }, data: { status: retry ? "PENDING" : "FAILED", runAfter: new Date(Date.now() + Math.min(60_000, 2 ** job.attempts * 1000)), lockedAt: null, lastError: message } });
      if (!retry && payload.sourceId) {
        // A source that already answers (READY) keeps its previous pages.
        await db.knowledgeSource.updateMany({ where: { id: payload.sourceId, workspaceId: job.workspaceId, status: { not: "READY" } }, data: { status: "FAILED" } });
        const { t } = await getWorkspaceTranslator(job.workspaceId);
        await db.notification.create({ data: { workspaceId: job.workspaceId, type: "JOB", title: t("server.jobFailedTitle"), body: `WEBSITE_INGEST: ${message}`.slice(0, 1000) } });
      }
      results.push({ id: job.id, status: retry ? "RETRY" : "FAILED" });
    }
  }
  return results;
}
