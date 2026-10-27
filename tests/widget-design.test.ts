import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DESIGN, mergeForTier, normalizeAvatar, normalizeDesign, normalizePresets, normalizeProactive, resolveLook } from "../src/lib/widget/design.ts";

test("design input is clamped and never carries markup", () => {
  const d = normalizeDesign({ width: 9999, height: 10, radius: -5, colors: { accent: "red", text: "#ABCDEF" }, launcher: { size: 200, label: "<script>x</script>Help" }, font: "comic", shadow: "huge" });
  assert.equal(d.width, 480); assert.equal(d.height, 440); assert.equal(d.radius, 0);
  assert.equal(d.colors.accent, DEFAULT_DESIGN.colors.accent); assert.equal(d.colors.text, "#abcdef");
  assert.equal(d.launcher.size, 64); assert.ok(!d.launcher.label.includes("<"));
  assert.equal(d.font, "system"); assert.equal(d.shadow, DEFAULT_DESIGN.shadow);
  assert.equal(normalizePresets(new Array(30).fill({ name: "x" })).length, 12);
});

test("avatars accept https or small images only", () => {
  assert.equal(normalizeAvatar("javascript:alert(1)"), "");
  assert.equal(normalizeAvatar("http://example.com/a.png"), "");
  assert.equal(normalizeAvatar("https://example.com/a.png"), "https://example.com/a.png");
  assert.ok(normalizeAvatar("data:image/png;base64,iVBORw0KGgo=").startsWith("data:image/png"));
  assert.equal(normalizeAvatar("data:image/svg+xml;base64,PHN2Zz4="), "");
});

test("the card shows what the plan allows; Custom work survives a downgrade", () => {
  const stored = { accent: "#ff0000", title: "Anna", avatarUrl: "https://x.test/a.png", style: "dark", design: normalizeDesign({ radius: 3 }), presets: normalizePresets([{ name: "Mine", design: { radius: 2 } }]) };
  // Trial and Starter: fixed Lemeri design — no colour, avatar or styles; only light or dark.
  const basic = resolveLook(stored, "basic");
  assert.equal(basic.avatarUrl, ""); assert.deepEqual(basic.design, DEFAULT_DESIGN); assert.equal(basic.theme, "light");
  const standard = resolveLook({ ...stored, theme: "dark" }, "standard");
  assert.equal(standard.avatarUrl, ""); assert.deepEqual(standard.design, DEFAULT_DESIGN); assert.equal(standard.theme, "dark");
  assert.equal(resolveLook({ ...stored, theme: "auto" }, "standard").theme, "light");
  const custom = resolveLook(stored, "custom");
  assert.equal(custom.design.radius, 3); assert.equal(custom.avatarUrl, "https://x.test/a.png"); assert.equal(resolveLook({ accent: "#ff0000" }, "custom").design.colors.accent, "#ff0000");
  // A Starter save cannot wipe or change Custom fields…
  const saved = mergeForTier(stored, { title: "Bob", accent: "#00ff00", avatarUrl: "https://evil.test/x.png" }, "standard");
  assert.equal(saved.title, "Bob"); assert.equal(saved.design?.radius, 3); assert.equal(saved.presets?.length, 1);
  assert.equal(saved.accent, "#ff0000"); assert.equal(saved.avatarUrl, "https://x.test/a.png");
  // …and a Trial save keeps Starter fields too.
  const trial = mergeForTier(stored, { title: "C", avatarUrl: "https://evil.test/x.png" }, "basic");
  assert.equal(trial.avatarUrl, "https://x.test/a.png");
  // Custom can clear its design.
  assert.equal(mergeForTier(stored, { title: "D" }, "custom").design, undefined);
});

test("the AI's first message: Starter and Custom, validated, never markup", () => {
  const stored = { proactive: { enabled: true, messages: ["Здравствуйте! <b>Подсказать</b>?", "", "Второе", "Третье", "Четвёртое"], delay: 999 } };
  assert.equal(resolveLook(stored, "basic").proactive.enabled, false);
  const p = resolveLook(stored, "standard").proactive;
  assert.equal(p.enabled, true); assert.equal(p.messages.length, 3); assert.ok(!p.messages[0]!.includes("<")); assert.equal(p.delay, 120);
  assert.equal(normalizeProactive({ enabled: true, messages: [] }).enabled, false);
  assert.equal(normalizeProactive({ enabled: "yes", messages: ["Hi"] }).enabled, false);
  // Trial saves keep the stored first message instead of overwriting it.
  assert.deepEqual(mergeForTier(stored, { title: "T", proactive: { enabled: false, messages: [], delay: 0 } }, "basic").proactive, stored.proactive);
});

test("card texts in another language than the owner picked are found for translation", async () => {
  const { textsToTranslate, wrongLanguage } = await import("../src/lib/widget/card-language.ts");
  assert.equal(wrongLanguage("Hi! How can I help?", "ru"), true);
  assert.equal(wrongLanguage("Здравствуйте! Чем помочь с Lemeri AI?", "ru"), false);
  assert.equal(wrongLanguage("Сәлеметсіз бе!", "ru"), false);
  assert.equal(wrongLanguage("Привет", "en"), true);
  assert.equal(wrongLanguage("24/7", "ru"), false);
  assert.deepEqual(textsToTranslate({ greeting: "Привет!", status: "online", suggestions: ["Тарифы", "How to install?"], proactive: ["Здравствуйте!"] }, "ru"), { status: "online", suggestions: ["Тарифы", "How to install?"] });
});
