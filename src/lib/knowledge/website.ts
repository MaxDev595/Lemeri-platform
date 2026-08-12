import { assertPublicHttpsUrl } from "@/lib/integrations/url-security";
import { isAllowedByRobots, parseRobots } from "./robots";

const maxBytes = 2_000_000;
const crawlerAgent = "LemiriKnowledgeBot";

async function fetchPublic(url: URL) {
  for (let redirects = 0; redirects < 4; redirects++) {
    await assertPublicHttpsUrl(url.href);
    const response = await fetch(url, { headers: { "user-agent": `${crawlerAgent}/1.0` }, redirect: "manual", signal: AbortSignal.timeout(12_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid website redirect");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`Website returned ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maxBytes) throw new Error("Website page is too large");
    const text = await response.text();
    if (text.length > maxBytes) throw new Error("Website page is too large");
    return { text, url, contentType: response.headers.get("content-type") ?? "" };
  }
  throw new Error("Too many website redirects");
}

async function loadRobots(root: URL) {
  try {
    return parseRobots((await fetchPublic(new URL("/robots.txt", root))).text);
  } catch {
    return [];
  }
}

function decode(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanHtml(html: string) {
  return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, "\n")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function links(html: string, base: URL) {
  const found: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], base);
      url.hash = "";
      if (url.origin === base.origin && url.protocol === "https:") found.push(url.href);
    } catch {}
  }
  return [...new Set(found)];
}

export async function crawlWebsite(start: string, limit = 20) {
  const root = await assertPublicHttpsUrl(start);
  const rules = await loadRobots(root);
  const queue = [root.href];
  const seen = new Set<string>();
  const pages: Array<{ url: string; title: string; content: string }> = [];
  while (queue.length && pages.length < limit) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    if (!isAllowedByRobots(new URL(next), rules)) continue;
    const page = await fetchPublic(new URL(next));
    if (!page.contentType.includes("text/html")) continue;
    const title = decode(page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? page.url.pathname);
    const content = cleanHtml(page.text);
    if (content.length >= 30) pages.push({ url: page.url.href, title, content });
    for (const link of links(page.text, page.url)) if (!seen.has(link) && queue.length < limit * 3) queue.push(link);
  }
  if (!pages.length) throw new Error("No readable website pages found");
  return pages;
}
