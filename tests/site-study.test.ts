import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { buildSystemPrompt } from "../src/lib/ai/prompt.ts";
import { DEFAULT_PROFILE } from "../src/lib/ai/profile.ts";
import { bestPassages, overlap, stems } from "../src/lib/knowledge/text-match.ts";
import { fallbackOverview, renderOverview } from "../src/lib/knowledge/site-overview.ts";
import { pageUrlFor, siteRootFromConfig } from "../src/lib/knowledge/site-basics.ts";
import { cleanHtml, crawlWebsite, normalizeStartUrl } from "../src/lib/knowledge/website.ts";
import { pageDocument, pageFromDocument } from "../src/lib/knowledge/site-basics.ts";

const base = { employeeName: "Аня", role: "консультант", goal: "", tone: "дружелюбный", messages: [], knowledge: [], allowedActionKeys: ["createLead"] };

test("sales prompt asks for contacts briefly and only in context", () => {
  const prompt = buildSystemPrompt({ ...base, profile: DEFAULT_PROFILE });
  assert.match(prompt, /never pushy/);
  assert.match(prompt, /at most ONE short sentence/);
  assert.match(prompt, /Do NOT end every reply with a call to leave a request/);
  assert.match(prompt, /If the visitor ignores the offer, drop it/);
  assert.doesNotMatch(prompt, /Turn interested visitors into requests/);
  const early = buildSystemPrompt({ ...base, profile: { ...DEFAULT_PROFILE, contactTiming: "early" } });
  assert.match(early, /Do not ask again unless the visitor brings it up/);
});

test("stem matching handles word forms", () => {
  assert.ok(overlap(stems("Сколько стоит доставка?"), "Стоимость доставки по городу — 300 ₽") > 0.3);
  assert.ok(overlap(stems("pricing plans"), "Our prices and plan options") > 0.9);
  const text = ["Добро пожаловать в Ламинарию", "x".repeat(3000), "Тариф Pro — 29 $ в месяц, до 500 участников", "y".repeat(3000)].join("\n\n");
  const passage = bestPassages(text, "сколько стоит тариф pro", 1200);
  assert.match(passage, /Тариф Pro — 29 \$/);
  assert.ok(passage.length <= 1200);
});

test("site root comes from allowed sites, then from where the card was seen", () => {
  assert.equal(siteRootFromConfig({ allowedOrigins: ["https://shop.test"] }), "https://shop.test");
  assert.equal(siteRootFromConfig({ allowedOrigins: [], seen: { "https://old.test": 1, "https://new.test": 5 } }), "https://new.test");
  assert.equal(siteRootFromConfig({ allowedOrigins: ["javascript:alert(1)"] }), null);
  assert.equal(siteRootFromConfig(null), null);
});

test("visitor page path stays on the site origin", () => {
  assert.equal(pageUrlFor("https://shop.test", "/catalog?x=1"), "https://shop.test/catalog?x=1");
  assert.equal(pageUrlFor("https://shop.test", "//evil.test/x"), undefined);
  assert.equal(pageUrlFor("https://shop.test", "https://evil.test/"), undefined);
  assert.equal(pageUrlFor(undefined, "/x"), undefined);
});

test("overview keeps only facts and links of the studied site", () => {
  const pages = [{ url: "https://shop.test/", title: "Shop", description: "Gifts", content: "..." }, { url: "https://shop.test/price", title: "Prices", description: "", content: "..." }];
  const text = renderOverview({ company: "Shop", about: "Подарки <b>ручной</b> работы.", offerings: [{ name: "Набор", price: "1 990 ₽", url: "https://shop.test/price" }, { name: "Чужое", url: "https://evil.test/x" }], contacts: { phone: "+7 900 000-00-00" }, links: [{ title: "Фишинг", url: "https://evil.test" }, { title: "Цены", url: "/price" }] }, pages, "ru");
  assert.match(text, /Набор — 1 990 ₽ \[страница\]\(https:\/\/shop\.test\/price\)/);
  assert.doesNotMatch(text, /evil\.test/);
  assert.match(text, /\[Цены\]\(https:\/\/shop\.test\/price\)/);
  assert.match(text, /телефон: \+7 900/);
  assert.match(fallbackOverview(pages, "en"), /Site pages:\n- \[Shop\]\(https:\/\/shop\.test\/\) — Gifts/);
});

test("address normalisation and HTML cleaning", () => {
  assert.equal(normalizeStartUrl("laminarias.com").href, "https://laminarias.com/");
  assert.throws(() => normalizeStartUrl("ftp://x"));
  assert.throws(() => normalizeStartUrl("localhost"));
  assert.equal(cleanHtml("<nav>Menu</nav><script>x()</script><h1>Title</h1><p>A&amp;B</p><ul><li>One</li></ul>"), "Menu\nTitle\nA&B\n\n- One");
});

test("crawler: robots, sitemap, useful pages first, no login pages, menu text dropped", async () => {
  const menu = "<nav>Главная Тарифы Контакты Войти</nav>";
  const pages: Record<string, string> = {
    "/": `<html><head><title>Ламинария</title><meta name="description" content="Вебинары"></head><body>${menu}<h1>Платформа вебинаров</h1><a href="/pricing">Тарифы</a><a href="/sign-in">Войти</a><a href="/blog/1">Блог</a><a href="/secret">S</a><a href="/logo.png">i</a></body></html>`,
    "/pricing": `<html><head><title>Тарифы</title></head><body>${menu}<p>Pro — 29 $ в месяц</p></body></html>`,
    "/contacts": `<html><head><title>Контакты</title></head><body>${menu}<p>hello@laminaria.test</p></body></html>`,
    "/blog/1": `<html><head><title>Блог</title></head><body>${menu}<p>Статья про вебинары и продажи</p></body></html>`,
    "/sign-in": "<html><body>login form with enough text to be indexed</body></html>",
    "/secret": "<html><body>secret page that robots forbid to read at all</body></html>",
  };
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/robots.txt") { res.end("User-agent: *\nDisallow: /secret"); return; }
    if (path === "/sitemap.xml") { res.setHeader("content-type", "application/xml"); res.end(`<urlset><url><loc>http://localhost:${port}/contacts</loc></url><url><loc>http://localhost:${port}/blog/1</loc></url></urlset>`); return; }
    const html = pages[path]; if (!html) { res.statusCode = 404; res.end(); return; }
    res.setHeader("content-type", "text/html; charset=utf-8"); res.end(html);
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  process.env.LEMIRI_ALLOW_PRIVATE_SITE_FETCH = "1";
  try {
    const result = await crawlWebsite(`http://localhost:${port}`, 10);
    const paths = result.map(page => new URL(page.url).pathname);
    assert.equal(paths[0], "/");
    assert.ok(paths.indexOf("/pricing") < paths.indexOf("/blog/1"));
    assert.ok(paths.indexOf("/contacts") < paths.indexOf("/blog/1"));
    assert.ok(!paths.includes("/sign-in") && !paths.includes("/secret") && !paths.includes("/logo.png"));
    assert.equal(result[0].description, "Вебинары");
    assert.match(result[0].content, /Главная Тарифы/); // home keeps the menu once
    assert.doesNotMatch(result.find(page => page.url.endsWith("/pricing"))!.content, /Главная Тарифы/);
  } finally { delete process.env.LEMIRI_ALLOW_PRIVATE_SITE_FETCH; server.close(); }
});

test("page documents keep their address for the overview", () => {
  const page = { url: "https://shop.test/price", title: "Prices", description: "All prices", content: "Pro — $29\n\nFree — $0" };
  assert.deepEqual(pageFromDocument({ title: "Prices", content: pageDocument(page) }), { url: page.url, title: "Prices", description: "", content: "Prices\n\nAll prices\n\nPro — $29\n\nFree — $0" });
  assert.equal(pageFromDocument({ title: "Text", content: "no address" }), null);
});
