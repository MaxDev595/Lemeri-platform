import { normalizeStartUrl } from "./page-read.ts";

// Small pure helpers of «Изучить сайт», shared by the chat path and the cabinet.

export const OVERVIEW_TITLE = { ru: "Обзор сайта (ИИ)", en: "Site overview (AI)" } as const;
export const OVERVIEW_TITLES: string[] = Object.values(OVERVIEW_TITLE);

/** Website root the card works on: the first allowed site, else the site the card was last seen on. */
export function siteRootFromConfig(config: { allowedOrigins?: unknown; seen?: unknown } | null | undefined) {
  const allowed = Array.isArray(config?.allowedOrigins) ? config.allowedOrigins.filter((item): item is string => typeof item === "string") : [];
  const seen = config?.seen && typeof config.seen === "object" ? Object.entries(config.seen as Record<string, unknown>).sort((a, b) => Number(b[1]) - Number(a[1])).map(([origin]) => origin) : [];
  for (const candidate of [...allowed, ...seen]) {
    try { const url = normalizeStartUrl(candidate); if (!/^(localhost|127\.)/.test(url.hostname) || process.env.LEMIRI_ALLOW_PRIVATE_SITE_FETCH === "1") return url.origin; } catch { /* skip invalid */ }
  }
  return null;
}

/** Page path from the widget: «/catalog?x=1» → absolute URL on the site origin, or undefined. */
export function pageUrlFor(origin: string | undefined, path: unknown) {
  if (!origin || typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > 300) return undefined;
  try { const url = new URL(path, origin); url.hash = ""; return url.origin === origin ? url.href : undefined; } catch { return undefined; }
}

/** Page documents store their address on the first line (site-queue.ts → saveSitePages). */
export function pageDocument(page: { url: string; title: string; description: string; content: string }) {
  return [page.url, page.title, page.description, page.content].filter(Boolean).join("\n\n");
}
export function pageFromDocument(doc: { title: string; content: string | null }) {
  const content = doc.content ?? "";
  const [first, ...rest] = content.split("\n\n");
  return /^https?:\/\//.test(first) ? { url: first, title: doc.title, description: "", content: rest.join("\n\n") } : null;
}
