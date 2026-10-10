import type { SitePage } from "./page-read.ts";

// Pure part of the AI site overview (site-study.ts): prompt and rendering.
// No database or network — covered by unit tests.

export type SiteOverview = {
  company?: string; about?: string; audience?: string;
  offerings?: Array<{ name?: string; price?: string; details?: string; url?: string }>;
  pricing?: string; howToBuy?: string; delivery?: string; payment?: string; guarantees?: string;
  contacts?: { phone?: string; email?: string; address?: string; hours?: string; messengers?: string };
  faq?: Array<{ q?: string; a?: string }>;
  links?: Array<{ title?: string; url?: string }>;
};

export const OVERVIEW_SYSTEM = `You read the text of a company's website and write a factual brief for the company's AI sales consultant.
Use ONLY facts written on the pages. Never invent prices, discounts, terms, contacts or links. Copy prices exactly as written (with currency and period). If something is not on the site, omit the field.
Return JSON only:
{"company":"name","about":"2-4 sentences: what the company does and for whom","audience":"who the customers are","offerings":[{"name":"product/service/plan","price":"as written or omit","details":"1-2 sentences: what it is, key features, limits","url":"page url from the input"}],"pricing":"pricing rules, trials, discounts as written","howToBuy":"how to order / sign up / start","delivery":"","payment":"","guarantees":"guarantees, refunds, returns","contacts":{"phone":"","email":"","address":"","hours":"","messengers":""},"faq":[{"q":"","a":""}],"links":[{"title":"","url":"important page url from the input"}]}
Up to 15 offerings, 8 FAQ, 8 links. Write in the requested language, keep names and prices in the original.`;

export function pagesForPrompt(pages: SitePage[], budget = 26_000) {
  const perPage = Math.max(1200, Math.floor(budget / Math.max(1, pages.length)));
  let used = 0;
  const parts: string[] = [];
  for (const page of pages) {
    if (used >= budget) break;
    const body = page.content.slice(0, Math.min(perPage * (parts.length === 0 ? 2 : 1), budget - used));
    used += body.length;
    parts.push(`=== ${page.url}\nTITLE: ${page.title}${page.description ? `\nDESCRIPTION: ${page.description}` : ""}\n${body}`);
  }
  return parts.join("\n\n");
}

const clean = (value: unknown, max = 600) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
const safeUrl = (value: unknown, allowed: Set<string>, origin: string) => {
  const raw = clean(value, 500);
  if (!raw) return "";
  try { const url = new URL(raw, origin); return url.origin === origin || allowed.has(url.href) ? url.href : ""; } catch { return ""; }
};

/** Renders the overview as plain text for the knowledge base and the AI context. Links are kept only when they point at the studied site. */
export function renderOverview(overview: SiteOverview, pages: SitePage[], locale: "ru" | "en") {
  const ru = locale === "ru";
  const origin = pages[0] ? new URL(pages[0].url).origin : "";
  const allowed = new Set(pages.map(page => page.url));
  const lines: string[] = [];
  const head = clean(overview.company, 120) || pages[0]?.title || origin;
  lines.push(`${ru ? "Компания" : "Company"}: ${head}${origin ? ` (${origin})` : ""}`);
  if (clean(overview.about)) lines.push(clean(overview.about, 900));
  if (clean(overview.audience)) lines.push(`${ru ? "Клиенты" : "Customers"}: ${clean(overview.audience, 300)}`);
  const offerings = (overview.offerings ?? []).slice(0, 15).map(item => {
    const name = clean(item?.name, 120); if (!name) return "";
    const url = safeUrl(item?.url, allowed, origin);
    return `- ${name}${clean(item?.price, 120) ? ` — ${clean(item?.price, 120)}` : ""}${clean(item?.details, 300) ? `: ${clean(item?.details, 300)}` : ""}${url ? ` [${ru ? "страница" : "page"}](${url})` : ""}`;
  }).filter(Boolean);
  if (offerings.length) lines.push("", ru ? "Товары, услуги, тарифы:" : "Products, services, plans:", ...offerings);
  const facts: Array<[string, string]> = [
    [ru ? "Цены и условия" : "Pricing", clean(overview.pricing)], [ru ? "Как купить / начать" : "How to buy / start", clean(overview.howToBuy)],
    [ru ? "Доставка" : "Delivery", clean(overview.delivery)], [ru ? "Оплата" : "Payment", clean(overview.payment)], [ru ? "Гарантии и возврат" : "Guarantees & returns", clean(overview.guarantees)],
  ];
  const factLines = facts.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  if (factLines.length) lines.push("", ...factLines);
  const c = overview.contacts ?? {};
  const contacts = [[ru ? "телефон" : "phone", clean(c.phone, 80)], ["email", clean(c.email, 120)], [ru ? "адрес" : "address", clean(c.address, 200)], [ru ? "часы работы" : "hours", clean(c.hours, 120)], [ru ? "мессенджеры" : "messengers", clean(c.messengers, 160)]].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  if (contacts.length) lines.push("", `${ru ? "Контакты" : "Contacts"}: ${contacts.join("; ")}`);
  const faq = (overview.faq ?? []).slice(0, 8).filter(item => clean(item?.q) && clean(item?.a)).map(item => `- ${clean(item.q, 200)} — ${clean(item.a, 400)}`);
  if (faq.length) lines.push("", ru ? "Частые вопросы:" : "FAQ:", ...faq);
  const links = (overview.links ?? []).slice(0, 8).map(item => { const url = safeUrl(item?.url, allowed, origin); const title = clean(item?.title, 80); return url && title ? `- [${title}](${url})` : ""; }).filter(Boolean);
  if (links.length) lines.push("", ru ? "Полезные страницы:" : "Useful pages:", ...links);
  return lines.join("\n").trim();
}

/** Overview without a model: titles, descriptions and links of the pages read. */
export function fallbackOverview(pages: SitePage[], locale: "ru" | "en") {
  const ru = locale === "ru";
  const home = pages[0];
  const lines = [`${ru ? "Сайт" : "Website"}: ${home?.title ?? ""} (${home ? new URL(home.url).origin : ""})`];
  if (home?.description) lines.push(home.description);
  lines.push("", ru ? "Страницы сайта:" : "Site pages:", ...pages.slice(0, 20).map(page => `- [${page.title.slice(0, 90)}](${page.url})${page.description ? ` — ${page.description.slice(0, 200)}` : ""}`));
  return lines.join("\n");
}

