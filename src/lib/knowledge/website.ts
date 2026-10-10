import { isAllowedByRobots, parseRobots } from "./robots.ts";
import { cleanHtml, fetchPublic, guard, normalizeStartUrl, pageMeta, decode, type SitePage } from "./page-read.ts";

export { cleanHtml, normalizeStartUrl, type SitePage } from "./page-read.ts";

// Website crawler for the knowledge base («Изучить сайт»): robots.txt is respected,
// sitemap.xml seeds the queue, useful pages go first.

const maxPageText = 20_000;
const skipExtensions = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|rar|7z|gz|mp4|webm|mov|mp3|wav|woff2?|ttf|otf|eot|css|js|mjs|json|xml|rss|txt|csv|xlsx?|docx?|pptx?)$/i;
const skipPaths = /\/(login|log-in|signin|sign-in|signup|sign-up|register|logout|auth|oauth|account|profile|cart|basket|checkout|dashboard|admin|wp-admin|wp-login|password|reset-password|forgot-password|verify-email|search|room|api|cdn-cgi)(\/|$|\?)/i;
const usefulPaths = /(price|pricing|tarif|tariff|plan|cena|ceny|stoim|prais|catalog|katalog|product|tovar|shop|store|service|usług|uslug|about|o-nas|o-kompanii|company|contact|kontakt|delivery|dostavk|shipping|payment|oplat|faq|vopros|help|support|docs|guide|feature|vozmozhn|how|kak|warranty|garant|return|vozvrat)/i;

async function loadRobots(root: URL) {
  try {
    return parseRobots((await fetchPublic(new URL("/robots.txt", root), 6000)).text);
  } catch {
    return [];
  }
}

async function loadSitemap(root: URL) {
  try {
    const xml = (await fetchPublic(new URL("/sitemap.xml", root), 6000)).text;
    return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(match => decode(match[1])).slice(0, 300);
  } catch {
    return [];
  }
}

/** Removes lines repeated on most pages (menus, footers) after the first page, so pages keep their own content. */
function dropBoilerplate(pages: SitePage[]) {
  if (pages.length < 4) return pages;
  const counts = new Map<string, number>();
  for (const page of pages) for (const line of new Set(page.content.split("\n").map(item => item.trim()).filter(item => item.length > 2))) counts.set(line, (counts.get(line) ?? 0) + 1);
  const common = new Set([...counts].filter(([, count]) => count >= Math.max(3, pages.length * 0.6)).map(([line]) => line));
  return pages.map((page, index) => index === 0 ? page : { ...page, content: page.content.split("\n").filter(line => !common.has(line.trim())).join("\n").replace(/\n{3,}/g, "\n\n").trim() });
}

function links(html: string, base: URL, origin: string) {
  const found: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    const href = decode(match[1]);
    if (/^(mailto|tel|javascript|data):/i.test(href)) continue;
    try {
      const url = new URL(href, base);
      url.hash = "";
      if (url.origin === origin && crawlable(url)) found.push(url.href);
    } catch { /* bad href */ }
  }
  return [...new Set(found)];
}

function crawlable(url: URL) { return !skipExtensions.test(url.pathname) && !skipPaths.test(url.pathname) && url.search.length < 120; }

/** Order of the queue: home first, then pages that usually hold prices, catalog, contacts and FAQ, shallow before deep. */
function priority(url: string) {
  const path = new URL(url).pathname;
  return (usefulPaths.test(path) ? 0 : 10) + path.split("/").filter(Boolean).length;
}

/**
 * Reads up to `limit` pages of a site: robots.txt is respected, sitemap.xml seeds the
 * queue, useful pages (prices, catalog, contacts, delivery, FAQ) go first.
 * Subrequests: robots + sitemap + pages (≤ limit + 2), within the Workers budget.
 */
export async function crawlWebsite(start: string, limit = 20): Promise<SitePage[]> {
  const root = normalizeStartUrl(start);
  await guard(root);
  const [rules, sitemap] = await Promise.all([loadRobots(root), loadSitemap(root)]);
  const queue = new Set<string>([root.href]);
  for (const entry of sitemap) { try { const url = new URL(entry); url.hash = ""; if (url.origin === root.origin && crawlable(url)) queue.add(url.href); } catch { /* bad loc */ } }
  const seen = new Set<string>();
  const pages: SitePage[] = [];
  const fingerprints = new Set<string>();
  let failures = 0;
  while (pages.length < limit && failures < 6) {
    const next = [...queue].filter(url => !seen.has(url)).sort((a, b) => (a === root.href ? -1 : b === root.href ? 1 : priority(a) - priority(b)))[0];
    if (!next) break;
    seen.add(next);
    if (!isAllowedByRobots(new URL(next), rules)) continue;
    let page: Awaited<ReturnType<typeof fetchPublic>>;
    try { page = await fetchPublic(new URL(next)); } catch { failures++; continue; }
    if (page.contentType && !/html|xml/i.test(page.contentType)) continue;
    const meta = pageMeta(page.text, page.url);
    const content = cleanHtml(page.text).slice(0, maxPageText);
    const fingerprint = content.slice(0, 400);
    if (content.length >= 30 && !fingerprints.has(fingerprint) && !pages.some(item => item.url === page.url.href)) {
      fingerprints.add(fingerprint);
      pages.push({ url: page.url.href, title: meta.title, description: meta.description, content });
    }
    if (queue.size < limit * 6) for (const link of links(page.text, page.url, root.origin)) queue.add(link);
  }
  if (!pages.length) throw new Error("No readable website pages found");
  return dropBoilerplate(pages);
}
