import { db } from "@/lib/db";
import type { KnowledgeMatch } from "@/lib/ai/types";
import { checkRateLimit } from "@/lib/security/request";
import { cleanHtml, fetchPublic, normalizeStartUrl, pageMeta } from "./page-read";
import { queueSiteStudy } from "./site-queue";
import { OVERVIEW_TITLES } from "./site-basics";
import { bestPassages } from "./text-match";

// The AI seller studies the site during the conversation, so it can answer even
// when the owner filled in nothing:
// - the AI overview of the studied site is always in the context;
// - the page the visitor is on is read live (cached for 10 minutes);
// - while the site is not studied yet, the home page is read live as well and a
//   full study is queued once (the next replies use the whole site).
// Budget per reply: one DB query + at most three page fetches (current, home, and
// while the site is not studied, the home-page link that best fits the question).

type Page = { title: string; description: string; content: string; links: Array<{ url: string; text: string }> };
const cache = new Map<string, { at: number; page: Page | null }>();
const TTL = 10 * 60_000;

async function readPage(url: string): Promise<Page | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.page;
  let page: Page | null = null;
  try {
    const result = await fetchPublic(new URL(url), 5000);
    if (!result.contentType || /html|xml/i.test(result.contentType)) {
      const meta = pageMeta(result.text, result.url);
      const content = cleanHtml(result.text).slice(0, 30_000);
      const links: Page["links"] = [];
      for (const match of result.text.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        try { const link = new URL(match[1], result.url); link.hash = ""; if (link.origin === result.url.origin && links.length < 80) links.push({ url: link.href, text: cleanHtml(match[2]).slice(0, 80) }); } catch { /* bad href */ }
      }
      if (content.length >= 30 || meta.description) page = { ...meta, content, links };
    }
  } catch { /* unreachable page: answer from what we have */ }
  if (cache.size > 200) cache.clear();
  cache.set(url, { at: Date.now(), page });
  return page;
}

export type SiteHint = { origin?: string; page?: string };

export async function siteKnowledge(params: { workspaceId: string; query: string; locale: "ru" | "en"; hint?: SiteHint; fallbackRoot?: string | null; retrieved: KnowledgeMatch[] }) {
  const sources = await db.knowledgeSource.findMany({
    where: { workspaceId: params.workspaceId, type: "WEBSITE" },
    select: { id: true, status: true, uri: true, _count: { select: { documents: true } }, documents: { where: { title: { in: OVERVIEW_TITLES } }, select: { id: true, content: true }, take: 1 } },
    orderBy: { createdAt: "asc" }, take: 5,
  });
  let origin: string | undefined;
  for (const candidate of [params.hint?.origin, params.fallbackRoot, ...sources.map(source => source.uri)]) {
    if (!candidate) continue;
    try { origin = normalizeStartUrl(candidate).origin; break; } catch { /* next */ }
  }
  const studied = sources.find(source => source.status === "READY" && source._count.documents > 0);
  const extra: KnowledgeMatch[] = [];
  const seenIds = new Set(params.retrieved.map(item => item.id));
  const ru = params.locale === "ru";

  const overviewRetrieved = params.retrieved.some(item => OVERVIEW_TITLES.some(title => item.sourceLabel.startsWith(title)));
  if (studied?.documents[0]?.content && !overviewRetrieved) {
    extra.push({ id: `site-overview-${studied.documents[0].id}`, content: studied.documents[0].content.slice(0, 3500), sourceLabel: ru ? "Обзор сайта компании" : "Company website overview", score: 1 });
  }
  const pageUrl = params.hint?.page && origin && new URL(params.hint.page).origin === origin ? params.hint.page : undefined;
  const reads: Array<Promise<KnowledgeMatch | null>> = [];
  const live = (url: string, id: string, label: string) => readPage(url).then(page => page ? { id, content: [page.title, page.description, bestPassages(page.content, params.query, 2500)].filter(Boolean).join("\n"), sourceLabel: `${label} · ${url}`, score: 0.9 } : null);
  if (pageUrl) reads.push(live(pageUrl, "site-page-current", ru ? "Страница, которую сейчас смотрит посетитель" : "Page the visitor is viewing"));
  // Not studied yet (or nothing relevant in the knowledge): read the home page now.
  const weak = !params.retrieved.length || params.retrieved[0].score < 0.25;
  if (origin && (!studied || weak) && pageUrl !== `${origin}/`) reads.push(live(`${origin}/`, "site-page-home", ru ? "Главная страница сайта" : "Website home page"));
  for (const item of await Promise.all(reads)) if (item && !seenIds.has(item.id)) extra.push(item);
  // Not studied yet: follow the home-page link that best fits the question (prices → «Тарифы»).
  if (origin && !studied && weak) {
    const home = cache.get(`${origin}/`)?.page;
    const best = home ? pickLink(home.links, params.query, [pageUrl, `${origin}/`]) : null;
    if (best) { const item = await live(best, "site-page-related", ru ? "Подходящая страница сайта" : "Related website page"); if (item) extra.push(item); }
  }

  // First conversation on a site nobody studied: study it once in the background.
  let studyQueued = sources.some(source => source.status === "PROCESSING");
  if (origin && !sources.length) {
    try {
      const limited = await checkRateLimit("site:auto-study", params.workspaceId, 1, 6 * 3600);
      if (limited.allowed) { await queueSiteStudy(params.workspaceId, origin, params.locale); studyQueued = true; }
    } catch (error) { console.error("Auto site study failed", error instanceof Error ? error.message : error); }
  }
  const context = pageUrl ? (ru ? `Посетитель сейчас на странице ${pageUrl}.` : `The visitor is on the page ${pageUrl}.`) : "";
  // Pages are read but the AI overview is not written yet: the caller writes it after the reply.
  const needsOverview = Boolean(studied && !studied.documents.length);
  return { extra, context, origin, needsOverview, studyQueued };
}

const PRICE = /(цен|стои|стоит|сколько|тариф|прайс|оплат|price|pricing|cost|plan|tarif)/i;
const LINK_PRICE = /(цен|стоим|тариф|прайс|price|pricing|plans?\b|tarif)/i;
/** Same-site link whose text or address best matches the question; prices map to pricing pages. */
export function pickLink(links: Array<{ url: string; text: string }>, query: string, skip: Array<string | undefined>) {
  const words = (query.toLowerCase().replace(/ё/g, "е").match(/[a-zа-я0-9]{3,}/g) ?? []).map(word => word.slice(0, 4));
  let best: { url: string; score: number } | null = null;
  for (const link of links) {
    if (skip.includes(link.url) || /\.(pdf|jpe?g|png|zip)$/i.test(link.url) || /(login|sign-?in|sign-?up|register|cart|account|dashboard)/i.test(link.url)) continue;
    const hay = `${link.text} ${decodeURIComponent(new URL(link.url).pathname)}`.toLowerCase().replace(/ё/g, "е");
    let score = words.filter(word => hay.includes(word)).length;
    if (PRICE.test(query) && LINK_PRICE.test(hay)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { url: link.url, score };
  }
  return best?.url ?? null;
}
