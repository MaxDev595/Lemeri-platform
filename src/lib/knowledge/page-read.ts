import { assertPublicHttpsUrl } from "../integrations/url-security.ts";

// Reading one public web page safely: used by the site crawler (website.ts) and by
// the live page reads during a conversation (site-live.ts). Public https
// addresses only; every redirect hop is checked again.
// LEMIRI_ALLOW_PRIVATE_SITE_FETCH=1 lifts the address check for local tests only.

const maxBytes = 2_000_000;
const crawlerAgent = "LemeriKnowledgeBot";

export type SitePage = { url: string; title: string; description: string; content: string };

export function privateAllowed() { return process.env.LEMIRI_ALLOW_PRIVATE_SITE_FETCH === "1"; }

/** Accepts «example.com», «https://example.com/page»; returns a URL or throws INVALID_URL. */
export function normalizeStartUrl(raw: string) {
  const value = raw.trim();
  if (!value || value.length > 500) throw new Error("INVALID_URL");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { throw new Error("INVALID_URL"); }
  if (!privateAllowed() && url.protocol === "http:") url.protocol = "https:";
  if (url.username || url.password || !/^https?:$/.test(url.protocol)) throw new Error("INVALID_URL");
  if (!url.hostname.includes(".") && !(privateAllowed() && url.hostname === "localhost")) throw new Error("INVALID_URL");
  url.hash = "";
  return url;
}

export async function guard(url: URL) {
  if (privateAllowed()) { if (!/^https?:$/.test(url.protocol)) throw new Error("INVALID_URL"); return url; }
  return assertPublicHttpsUrl(url.href);
}

export async function fetchPublic(url: URL, timeoutMs = 12_000) {
  for (let redirects = 0; redirects < 4; redirects++) {
    await guard(url);
    const response = await fetch(url, { headers: { "user-agent": `Mozilla/5.0 (compatible; ${crawlerAgent}/1.0; +https://lemeriai.com)`, accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5", "accept-language": "ru,en;q=0.8" }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
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

export function decode(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/** Readable text of an HTML page: scripts, styles, svg and forms removed, block tags become line breaks. */
export function cleanHtml(html: string) {
  return decode(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|select)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|td|th|header|footer|nav|main|aside|dd|dt|figcaption|blockquote)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function pageMeta(html: string, url: URL) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "") || url.pathname;
  const description = decode(html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? html.match(/<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? "").trim();
  return { title: title.slice(0, 200), description: description.slice(0, 500) };
}

