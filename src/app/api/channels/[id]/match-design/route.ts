import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { decryptCredentials } from "@/lib/security/encryption";
import { checkRateLimit } from "@/lib/security/request";
import { workspaceAccess } from "@/lib/billing/access";
import { designAllows } from "@/lib/billing/plans";
import { jsonCompletion } from "@/lib/ai/endpoint";
import { FONTS } from "@/lib/widget/design";
import { fetchSiteSnapshot, SiteFetchError } from "@/lib/widget/site-fetch";
import { applyPatch, designFromTokens, readSiteTokens, tokensForPrompt, type DesignPatch } from "@/lib/widget/site-style";
import type { WebsiteChannelConfig } from "@/lib/widget/settings";

// «Подобрать под сайт»: reads the owner's website, builds a matching card design and
// lets the AI refine it. Nothing is saved here — the editor shows the result in the
// preview and the owner saves it (or not). Custom design tier (open during testing).

const SYSTEM = `You are a senior product designer. You adapt a website chat card (an AI sales consultant) to the visual style of a client's website so it looks native to that site, tasteful and premium.
You get design tokens extracted from the site's CSS and a draft design built from them. Return JSON only:
{"patch":{...},"summary":"one sentence","notes":["2-4 short points: what you matched and why"]}
"patch" may contain ONLY these keys (omit what should stay as in the draft):
accent (#rrggbb brand colour for buttons/visitor messages), accentText (#rrggbb readable on accent), useGradient (bool), gradientTo (#rrggbb, a harmonious second brand colour, only if the site itself uses gradients or two brand colours),
font, headingFont (one of: ${Object.keys(FONTS).join(", ")}, or "same"), headerStyle (solid|accent|gradient|minimal|glass), bubbleStyle (rounded|tail|square), shadow (none|soft|medium|strong),
radius (card corners 0-28), bubbleRadius (2-24), buttonRadius (0-24), launcherShape (circle|rounded|square), launcherIcon (chat|sparkles|message|help),
pattern (none|dots|grid|diagonal|aurora|noise), glass (bool), glow (bool), messageAnimation (rise|pop|fade|none), typing (dots|wave|pulse), composerStyle (outlined|filled|pill), launcherLabel (short CTA, max 30 chars, in the site's language) .
Rules: keep the brand colour if one was found; never invent colours that clash with the site; keep text readable (WCAG AA); match corner radii to the site's buttons; luxury/fashion/beauty sites suit serif headings and restraint; tech/SaaS sites suit clean sans fonts and subtle effects; kids/food/hobby sites may be softer and rounder. Prefer restraint: effects only when they fit the site. Write summary and notes in the requested language.`;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(auth.membership.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const access = await workspaceAccess(auth.workspaceId);
  if (!designAllows(access.design, "custom")) return NextResponse.json({ error: "PLAN_REQUIRED", plan: "CUSTOM" }, { status: 402 });
  const limited = await checkRateLimit("widget:match-design", auth.workspaceId, 8, 600);
  if (!limited.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(limited.retryAfter) } });

  const { id } = await params;
  const channel = await db.channel.findFirst({ where: { id, workspaceId: auth.workspaceId, type: "WEBSITE" }, select: { configEncrypted: true } });
  if (!channel) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { url?: unknown; locale?: unknown };
  const locale = body.locale === "en" ? "en" : "ru";
  let config: WebsiteChannelConfig = { allowedOrigins: [] };
  try { if (channel.configEncrypted) config = decryptCredentials<WebsiteChannelConfig>(channel.configEncrypted); } catch { /* empty config */ }
  // The address typed in the editor, else the site the card is installed on.
  const seen = Object.entries(config.seen ?? {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0];
  const target = typeof body.url === "string" && body.url.trim() ? body.url : config.allowedOrigins?.[0] ?? seen ?? "";
  if (!target) return NextResponse.json({ error: "URL_REQUIRED" }, { status: 400 });

  let snapshot: Awaited<ReturnType<typeof fetchSiteSnapshot>>;
  try { snapshot = await fetchSiteSnapshot(target); }
  catch (error) { return NextResponse.json({ error: error instanceof SiteFetchError ? error.code : "UNREACHABLE" }, { status: 422 }); }

  const tokens = readSiteTokens(snapshot);
  const draft = designFromTokens(tokens);
  let design = draft.design, summary = "", notes: string[] = [], ai = false;
  try {
    const reply = await jsonCompletion<{ patch?: DesignPatch; summary?: string; notes?: string[] }>(SYSTEM, JSON.stringify({
      language: locale === "ru" ? "Russian" : "English",
      tokens: tokensForPrompt(tokens),
      draft: { accent: draft.design.colors.accent, accentText: draft.design.colors.accentText, font: draft.design.font, headingFont: draft.design.headingFont, radius: draft.design.radius, bubbleRadius: draft.design.bubbleRadius, buttonRadius: draft.design.buttonRadius, headerStyle: draft.design.header.style, bubbleStyle: draft.design.bubbleStyle, shadow: draft.design.shadow, launcherShape: draft.design.launcher.shape, theme: draft.theme },
    }), 1400);
    design = applyPatch(draft.design, reply.patch ?? {});
    summary = typeof reply.summary === "string" ? reply.summary.slice(0, 300) : "";
    notes = Array.isArray(reply.notes) ? reply.notes.filter((n): n is string => typeof n === "string").map(n => n.slice(0, 200)).slice(0, 4) : [];
    ai = true;
  } catch { /* the deterministic design is still a good match */ }
  if (!summary) summary = locale === "ru"
    ? `Карточка подобрана под ${new URL(snapshot.url).hostname}: ${tokens.accent ? "фирменный цвет" : "монохромная гамма"}, шрифт и скругления как на сайте.`
    : `Matched to ${new URL(snapshot.url).hostname}: ${tokens.accent ? "brand colour" : "monochrome palette"}, font and corners like the site.`;

  return NextResponse.json({
    design, theme: draft.theme, summary, notes, ai,
    found: { url: snapshot.url, title: tokens.title, accent: tokens.accent, palette: tokens.palette.slice(0, 5), background: tokens.background, text: tokens.text, dark: tokens.dark, bodyFont: tokens.bodyFont, headingFont: tokens.headingFont, buttonRadius: tokens.buttonRadius },
  }, { headers: { "cache-control": "no-store" } });
}
