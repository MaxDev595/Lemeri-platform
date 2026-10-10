import { db } from "@/lib/db";
import { jsonCompletion } from "@/lib/ai/endpoint";
import { chunkText } from "./chunk";
import { OVERVIEW_SYSTEM, fallbackOverview, pagesForPrompt, renderOverview, type SiteOverview } from "./site-overview";
import { OVERVIEW_TITLE, OVERVIEW_TITLES, pageFromDocument } from "./site-basics";
import type { SitePage } from "./page-read";

// AI overview of a studied site: what the company sells, prices as written,
// contacts, delivery, FAQ. Written once after the crawl (site-queue.ts) by the
// cabinet («Изучить сайт» status poll) or right after a chat reply, never inside
// the job runner — that keeps this code out of every route bundle.

export async function buildOverview(pages: SitePage[], locale: "ru" | "en") {
  try {
    const reply = await jsonCompletion<SiteOverview>(OVERVIEW_SYSTEM, `LANGUAGE: ${locale === "ru" ? "Russian" : "English"}\n\n${pagesForPrompt(pages)}`, 2600);
    const text = renderOverview(reply, pages, locale);
    if (text.split("\n").length >= 2) return text;
  } catch (error) {
    console.error("Site overview failed, using page list", error instanceof Error ? error.message : error);
  }
  return fallbackOverview(pages, locale);
}

const inflight = new Set<string>();
const checked = new Map<string, number>();

/** Writes the overview for every studied website source of the workspace that has none. */
export async function ensureSiteOverview(workspaceId: string, locale: "ru" | "en", { force = false } = {}) {
  if (!force && Date.now() - (checked.get(workspaceId) ?? 0) < 5 * 60_000) return;
  checked.set(workspaceId, Date.now());
  const sources = await db.knowledgeSource.findMany({ where: { workspaceId, type: "WEBSITE", status: "READY" }, select: { id: true, documents: { select: { id: true, title: true, content: true }, take: 40 } } });
  for (const source of sources) {
    if (inflight.has(source.id) || source.documents.some(doc => OVERVIEW_TITLES.includes(doc.title))) continue;
    const pages = source.documents.map(pageFromDocument).filter((page): page is SitePage => Boolean(page));
    if (!pages.length) continue;
    inflight.add(source.id);
    try {
      const overview = await buildOverview(pages, locale);
      const host = new URL(pages[0].url).hostname;
      await db.$transaction(async tx => {
        await tx.knowledgeDocument.deleteMany({ where: { sourceId: source.id, title: { in: OVERVIEW_TITLES } } });
        await tx.knowledgeDocument.create({ data: { sourceId: source.id, title: OVERVIEW_TITLE[locale], content: overview, chunks: { create: chunkText(overview).map((content, index) => ({ content, sourceLabel: `${OVERVIEW_TITLE[locale]} · ${host} · ${index + 1}` })) } } });
      });
    } finally { inflight.delete(source.id); }
  }
}
