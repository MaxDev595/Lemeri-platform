import assert from "node:assert/strict";
import test from "node:test";
import { openAccessEnabled, resolveAccess } from "../src/lib/billing/plans.ts";
import { DEFAULT_DESIGN, normalizeDesign, READY_STYLES, resolveLook, chatVars, shellConfig } from "../src/lib/widget/design.ts";
import { applyPatch, contrast, designFromTokens, matchFont, parseColor, readSiteTokens } from "../src/lib/widget/site-style.ts";

test("open access: everyone gets Custom while testing, nothing changes when it is off", () => {
  const now = new Date("2027-03-01T00:00:00Z");
  const expired = resolveAccess({ subscription: null, ownerCreatedAt: "2026-01-01", now, env: {} });
  assert.equal(expired.state, "expired"); assert.equal(expired.openAccess, undefined);
  const open = resolveAccess({ subscription: null, ownerCreatedAt: "2026-01-01", now, env: { LEMIRI_OPEN_ACCESS: "1" } });
  assert.equal(open.plan, "CUSTOM"); assert.equal(open.state, "active"); assert.equal(open.design, "custom"); assert.equal(open.aiAllowed, true); assert.equal(open.openAccess, true);
  // The reply allowance stays so token spend is bounded.
  assert.equal(open.messageLimit, 2000);
  assert.equal(openAccessEnabled({ LEMIRI_OPEN_ACCESS: "true" }), true);
  assert.equal(openAccessEnabled({ LEMIRI_OPEN_ACCESS: "0" }), false);
  assert.equal(openAccessEnabled({}), false);
});

test("premium settings are validated and older saved designs get defaults", () => {
  const old = JSON.parse(JSON.stringify(DEFAULT_DESIGN)); delete old.effects; delete old.attention; delete old.composer;
  const d = normalizeDesign(old);
  assert.equal(d.effects.glass, false); assert.equal(d.attention.teaser, ""); assert.equal(d.composer.style, "outlined");
  const bad = normalizeDesign({ effects: { pattern: "url(javascript:x)", blur: 999, glass: "yes" }, attention: { teaser: "<img onerror=x>Hi", teaserDelay: 0 }, accentGradient: { enabled: true, to: "red" }, headingFont: "Comic" });
  assert.equal(bad.effects.pattern, "none"); assert.equal(bad.effects.blur, 32); assert.equal(bad.effects.glass, false);
  assert.ok(!bad.attention.teaser.includes("<")); assert.equal(bad.attention.teaserDelay, 2);
  assert.equal(bad.accentGradient.to, DEFAULT_DESIGN.accentGradient.to); assert.equal(bad.headingFont, "same");
  // Glass allows a lower opacity, plain cards keep at least 85%.
  assert.equal(normalizeDesign({ opacity: 50 }).opacity, 85);
  assert.equal(normalizeDesign({ opacity: 50, effects: { glass: true } }).opacity, 55);
  // Every ready style is a valid design and renders.
  for (const [key, style] of Object.entries(READY_STYLES)) {
    assert.deepEqual(normalizeDesign(style.design), style.design, key);
    assert.ok(chatVars(style.design, false)["--lw-user-fill"]); assert.ok(shellConfig(style.design).light.accent);
  }
  const glass = resolveLook({ style: "glass" }, "custom");
  assert.equal(glass.design.effects.glass, true);
  assert.match(chatVars(READY_STYLES.aurora!.design, false)["--lw-user-fill"]!, /^linear-gradient/);
});

const SITE_HTML = `<!doctype html><html><head><title>Цветочная лавка</title><meta name="theme-color" content="#1f7a5c">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Montserrat:wght@400&display=swap" rel="stylesheet">
<style>:root{--color-primary:#1F7A5C;--radius:999px} body{background:#FBF8F3;color:#2b2b2b;font-family:"Montserrat",sans-serif} h1,h2{font-family:'Playfair Display',serif}
.btn,button{background:var(--color-primary);color:#fff;border-radius:var(--radius)} a{color:#1f7a5c} .card{border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.1)} .product-card{box-shadow:0 1px 2px #0002}</style></head><body></body></html>`;

test("site tokens: brand colour, fonts, radii and theme are read from HTML/CSS", () => {
  const t = readSiteTokens({ url: "https://flowers.test/", html: SITE_HTML, css: "" });
  assert.equal(t.accent, "#1f7a5c"); assert.equal(t.background, "#fbf8f3"); assert.equal(t.dark, false);
  assert.equal(t.bodyFont, "Montserrat"); assert.equal(t.headingFont, "Playfair Display"); assert.equal(t.pill, true); assert.equal(t.cardRadius, 14); assert.equal(t.shadowy, true);
  const { design, theme } = designFromTokens(t);
  assert.equal(theme, "light"); assert.equal(design.colors.accent, "#1f7a5c"); assert.equal(design.font, "montserrat"); assert.equal(design.headingFont, "playfair");
  assert.equal(design.launcher.shape, "circle"); assert.equal(design.composer.style, "pill"); assert.equal(design.colors.background, "#fbf8f3");
  assert.ok(contrast(design.colors.accentText, design.colors.accent) >= 3);
  // Dark sites get a dark card.
  const dark = designFromTokens(readSiteTokens({ url: "https://x.test", html: "<style>body{background:#0b0c10;color:#e8e8e8}.btn{background:#ff5a1f;border-radius:4px}</style>", css: "" }));
  assert.equal(dark.theme, "dark"); assert.equal(dark.design.dark.background, "#0b0c10"); assert.equal(dark.design.colors.accent, "#ff5a1f");
  // A monochrome site gets an ink accent instead of a made-up colour.
  const mono = readSiteTokens({ url: "https://x.test", html: "<style>body{background:#fff;color:#111}button{background:#111;color:#fff;border-radius:0}</style>", css: "" });
  assert.equal(mono.accent, ""); assert.equal(designFromTokens(mono).design.colors.accent, "#17191f"); assert.equal(designFromTokens(mono).design.bubbleStyle, "square");
});

test("AI patch is applied safely", () => {
  const base = designFromTokens(readSiteTokens({ url: "https://flowers.test/", html: SITE_HTML, css: "" })).design;
  const patched = applyPatch(base, { accent: "#ffff00", accentText: "#ffffff", font: "Comic Sans", headingFont: "cormorant", radius: 500, pattern: "evil", glass: true, useGradient: true, gradientTo: "#2a9d8f", launcherLabel: "<b>Помочь?</b>" });
  assert.equal(patched.colors.accent, "#ffff00"); assert.notEqual(patched.colors.accentText, "#ffffff"); // white on yellow is unreadable
  assert.equal(patched.font, base.font); assert.equal(patched.headingFont, "cormorant"); assert.equal(patched.radius, 28);
  assert.equal(patched.effects.pattern, base.effects.pattern); assert.equal(patched.effects.glass, true); assert.ok(patched.opacity <= 76);
  assert.equal(patched.accentGradient.enabled, true); assert.ok(!patched.launcher.label.includes("<"));
  assert.equal(parseColor("rgb(31 122 92 / 80%)"), "#1f7a5c"); assert.equal(parseColor("rgba(0,0,0,0.1)"), null); assert.equal(parseColor("hsl(160, 60%, 30%)")?.length, 7);
  assert.equal(matchFont("Gilroy"), "system"); assert.equal(matchFont("Cormorant Garamond"), "cormorant"); assert.equal(matchFont("PT Serif"), "lora");
});
