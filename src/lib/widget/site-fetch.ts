// Downloads a public website's HTML and a few stylesheets for "Подобрать под сайт".
// Only public http(s) addresses; private networks, localhost and IP literals are
// refused (LEMIRI_ALLOW_PRIVATE_SITE_FETCH=1 lifts this for local testing).
// Small budget: 1 page + up to 4 stylesheets (Workers subrequest limit).

const PAGE_LIMIT = 1_500_000, CSS_LIMIT = 400_000, CSS_TOTAL = 1_200_000;
const UA = "Mozilla/5.0 (compatible; LemeriDesignBot/1.0; +https://lemeriai.com)";

export type SiteFetchCode = "INVALID_URL" | "PRIVATE_ADDRESS" | "UNREACHABLE" | "NOT_HTML";
export class SiteFetchError extends Error { code: SiteFetchCode; constructor(code: SiteFetchCode) { super(code); this.code = code; } }

function privateHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true; // IP literals: sites have names
  if (h.includes(":")) return true; // IPv6 literal
  return false;
}

export function normalizeSiteUrl(raw: string) {
  const value = raw.trim();
  if (!value || value.length > 500) throw new SiteFetchError("INVALID_URL");
  // Another scheme (ftp://, javascript:) is refused rather than guessed.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) throw new SiteFetchError("INVALID_URL");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { throw new SiteFetchError("INVALID_URL"); }
  const allowPrivate = process.env.LEMIRI_ALLOW_PRIVATE_SITE_FETCH === "1";
  if (!url.hostname.includes(".") && !(allowPrivate && url.hostname === "localhost")) throw new SiteFetchError("INVALID_URL");
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SiteFetchError("INVALID_URL");
  if (url.username || url.password) throw new SiteFetchError("INVALID_URL");
  if (!allowPrivate && privateHost(url.hostname)) throw new SiteFetchError("PRIVATE_ADDRESS");
  url.hash = "";
  return url;
}

async function readText(response: Response, limit: number) {
  if (!response.body) return (await response.text()).slice(0, limit);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let text = "";
  while (text.length < limit) { const { done, value } = await reader.read(); if (done) break; text += decoder.decode(value, { stream: true }); }
  await reader.cancel().catch(() => undefined);
  return text.slice(0, limit);
}

async function get(url: URL, accept: string, ms: number) {
  // Redirects are followed by hand so every hop passes the same address check.
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(current, { headers: { "user-agent": UA, accept, "accept-language": "ru,en;q=0.8" }, redirect: "manual", signal: AbortSignal.timeout(ms) });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) { current = normalizeSiteUrl(new URL(response.headers.get("location")!, current).toString()); continue; }
    return { response, url: current };
  }
  throw new SiteFetchError("UNREACHABLE");
}

export async function fetchSiteSnapshot(raw: string) {
  const start = normalizeSiteUrl(raw);
  let page: Awaited<ReturnType<typeof get>>;
  try { page = await get(start, "text/html,application/xhtml+xml", 9000); } catch (error) { if (error instanceof SiteFetchError) throw error; throw new SiteFetchError("UNREACHABLE"); }
  if (!page.response.ok) throw new SiteFetchError("UNREACHABLE");
  const type = page.response.headers.get("content-type") ?? "";
  if (type && !/html|xml/i.test(type)) throw new SiteFetchError("NOT_HTML");
  const html = await readText(page.response, PAGE_LIMIT);
  // Stylesheets: same-site first, skip font CSS and well-known third parties.
  const hrefs = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]).filter(tag => /rel=["']?[^"'>]*stylesheet/i.test(tag)).map(tag => tag.match(/href=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&")).filter((href): href is string => Boolean(href));
  const urls: URL[] = [];
  for (const href of hrefs) {
    try {
      const u = new URL(href, page.url);
      if (!/^https?:$/.test(u.protocol) || /fonts\.googleapis|fontawesome|cdnjs|jsdelivr\.net\/npm\/(bootstrap-icons|@fortawesome)|unpkg\.com\/(aos|swiper)/i.test(u.href)) continue;
      urls.push(u);
    } catch { /* bad href */ }
  }
  urls.sort((a, b) => Number(b.hostname === page.url.hostname) - Number(a.hostname === page.url.hostname));
  const sheets = await Promise.all(urls.slice(0, 4).map(async u => {
    try { const r = await get(normalizeSiteUrl(u.toString()), "text/css,*/*;q=0.1", 7000); return r.response.ok ? await readText(r.response, CSS_LIMIT) : ""; } catch { return ""; }
  }));
  return { url: page.url.toString(), html, css: sheets.join("\n").slice(0, CSS_TOTAL) };
}
