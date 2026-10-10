import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/security/request";
import { decryptCredentials } from "@/lib/security/encryption";
import { OVERVIEW_TITLES, siteRootFromConfig } from "@/lib/knowledge/site-basics";
import { queueSiteStudy } from "@/lib/knowledge/site-queue";
import { ensureSiteOverview } from "@/lib/knowledge/site-study";
import { runSiteJobs } from "@/lib/knowledge/site-jobs";
import { workspaceAccess } from "@/lib/billing/access";
import { planNumber, planRequired } from "@/lib/billing/features";
import { normalizeStartUrl } from "@/lib/knowledge/page-read";

// «Изучить сайт с помощью ИИ»: GET — state for the cabinet (suggested address,
// progress, pages, overview); POST {url?} — start or repeat the study.

async function siteState(workspaceId: string) {
  const channel = await db.channel.findUnique({ where: { workspaceId_type: { workspaceId, type: "WEBSITE" } }, select: { configEncrypted: true } });
  let suggested: string | null = null;
  try { if (channel?.configEncrypted) suggested = siteRootFromConfig(decryptCredentials(channel.configEncrypted)); } catch { /* unreadable config */ }
  const sources = await db.knowledgeSource.findMany({ where: { workspaceId, type: "WEBSITE" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, uri: true, status: true, title: true, createdAt: true, _count: { select: { documents: true } }, documents: { where: { title: { in: OVERVIEW_TITLES } }, select: { content: true }, take: 1 } } });
  const source = (suggested ? sources.find(item => item.uri && new URL(item.uri).origin === new URL(suggested!).origin) : undefined) ?? sources[0];
  if (!source) return { suggestedUrl: suggested, source: null };
  const job = await db.backgroundJob.findFirst({ where: { workspaceId, type: "WEBSITE_INGEST", payload: { path: ["sourceId"], equals: source.id } }, orderBy: { createdAt: "desc" }, select: { status: true, lastError: true, completedAt: true, createdAt: true } });
  const studying = job?.status === "PENDING" || job?.status === "RUNNING";
  const overview = source.documents[0]?.content ?? "";
  // Pages are saved; the AI overview is written by the next poll (GET below).
  const summarizing = !studying && source.status === "READY" && !overview && source._count.documents > 0;
  return {
    suggestedUrl: suggested ?? source.uri,
    source: {
      id: source.id, url: source.uri, title: source.title,
      status: studying ? "STUDYING" : summarizing ? "SUMMARIZING" : source.status === "READY" ? "READY" : source.status === "FAILED" ? "FAILED" : "STUDYING",
      pages: Math.max(0, source._count.documents - (overview ? 1 : 0)),
      overview: overview.slice(0, 6000),
      studiedAt: job?.completedAt?.toISOString() ?? null,
      error: job?.status === "FAILED" || (job?.lastError && !studying && source.status !== "READY") ? job?.lastError?.slice(0, 200) ?? null : null,
      retrying: studying && Boolean(job?.lastError),
    },
  };
}

export async function GET() {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // A study that is still queued (e.g. the inline run was cut short) is pushed along on each poll.
  const state = await siteState(auth.workspaceId);
  if (state.source?.status === "STUDYING") after(() => runSiteJobs(1).then(() => undefined).catch(error => console.error("Site study failed", error instanceof Error ? error.message : error)));
  if (state.source?.status === "SUMMARIZING") after(() => ensureSiteOverview(auth.workspaceId, auth.locale, { force: true }).catch(error => console.error("Site overview failed", error instanceof Error ? error.message : error)));
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canWorkspace(auth.membership.role, "MANAGE_KNOWLEDGE")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { url?: unknown };
  const state = await siteState(auth.workspaceId);
  const target = typeof body.url === "string" && body.url.trim() ? body.url.trim() : state.suggestedUrl;
  if (!target) return NextResponse.json({ error: "URL_REQUIRED" }, { status: 400 });
  let origin = "";
  try { origin = normalizeStartUrl(target).origin; } catch { return NextResponse.json({ error: "INVALID_URL" }, { status: 400 }); }
  const access = await workspaceAccess(auth.workspaceId);
  const known = await db.knowledgeSource.findFirst({ where: { workspaceId: auth.workspaceId, type: "WEBSITE", uri: { startsWith: origin } }, select: { id: true } });
  const limit = planNumber(access, "knowledgeSources");
  if (!known && await db.knowledgeSource.count({ where: { workspaceId: auth.workspaceId } }) >= limit) return NextResponse.json({ ...planRequired("knowledgeSources"), plan: "STARTER", limit }, { status: 402 });
  const limited = await checkRateLimit("knowledge:study-site", auth.workspaceId, 6, 3600);
  if (!limited.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(limited.retryAfter) } });
  try {
    const source = await queueSiteStudy(auth.workspaceId, target, auth.locale === "en" ? "en" : "ru");
    // A new study replaces the old overview once the pages are read again.
    await db.knowledgeDocument.deleteMany({ where: { sourceId: source.id, title: { in: OVERVIEW_TITLES } } });
  }
  catch { return NextResponse.json({ error: "INVALID_URL" }, { status: 400 }); }
  await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "SITE_STUDY_STARTED", entityType: "KnowledgeSource", metadata: { url: target.slice(0, 300) } } }).catch(() => undefined);
  after(() => runSiteJobs(1).then(() => undefined).catch(error => console.error("Site study failed", error instanceof Error ? error.message : error)));
  return NextResponse.json(await siteState(auth.workspaceId), { status: 202 });
}
