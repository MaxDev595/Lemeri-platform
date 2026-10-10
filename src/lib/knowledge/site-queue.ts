import { db } from "@/lib/db";
import { chunkText } from "./chunk";
import { normalizeStartUrl, type SitePage } from "./page-read";
import { pageDocument } from "./site-basics";

// Queue side of «Изучить сайт»: create (or reuse) the website source and its
// crawl job, and save crawled pages. Kept small: it is bundled with the job
// runner and the chat path. The AI overview is written later by site-study.ts.

/** Creates (or reuses) the website source of this site and queues a crawl. */
export async function queueSiteStudy(workspaceId: string, rawUrl: string, locale: "ru" | "en") {
  const root = normalizeStartUrl(rawUrl);
  const start = root.pathname === "/" ? root.origin : root.href;
  const existing = await db.knowledgeSource.findFirst({ where: { workspaceId, type: "WEBSITE", OR: [{ uri: start }, { uri: `${root.origin}/` }, { uri: root.origin }] }, orderBy: { createdAt: "asc" } });
  const source = existing
    ? await db.knowledgeSource.update({ where: { id: existing.id }, data: { status: existing.status === "READY" ? "READY" : "PROCESSING" } })
    : await db.knowledgeSource.create({ data: { workspaceId, title: `${locale === "ru" ? "Сайт" : "Website"}: ${root.hostname}`, type: "WEBSITE", status: "PROCESSING", uri: start } });
  const pending = await db.backgroundJob.findFirst({ where: { workspaceId, type: "WEBSITE_INGEST", status: { in: ["PENDING", "RUNNING"] }, payload: { path: ["sourceId"], equals: source.id } }, select: { id: true } }).catch(() => null);
  if (!pending) await db.backgroundJob.create({ data: { workspaceId, type: "WEBSITE_INGEST", payload: { sourceId: source.id } } });
  return source;
}

/** Replaces the source's documents with one document per page; usable at once (lexical search). */
export async function saveSitePages(sourceId: string, pages: SitePage[], fragment: (index: number) => string) {
  await db.$transaction(async tx => {
    await tx.knowledgeDocument.deleteMany({ where: { sourceId } });
    for (const page of pages) {
      const content = pageDocument(page);
      await tx.knowledgeDocument.create({ data: { sourceId, title: page.title.slice(0, 200), content, chunks: { create: chunkText(content).map((chunk, index) => ({ content: chunk, sourceLabel: `${page.title.slice(0, 80)} · ${page.url} · ${fragment(index + 1)}` })) } } });
    }
    await tx.knowledgeSource.update({ where: { id: sourceId }, data: { status: "READY" } });
  });
}
