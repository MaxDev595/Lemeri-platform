import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DESIGN, mergeForTier, normalizeAvatar, normalizeDesign, normalizePresets, resolveLook } from "../src/lib/widget/design.ts";

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
  const basic = resolveLook(stored, "basic");
  assert.equal(basic.avatarUrl, ""); assert.equal(basic.design.radius, DEFAULT_DESIGN.radius); assert.equal(basic.design.colors.accent, "#ff0000");
  const standard = resolveLook(stored, "standard");
  assert.equal(standard.avatarUrl, "https://x.test/a.png"); assert.notEqual(standard.design.radius, 3);
  assert.equal(resolveLook(stored, "custom").design.radius, 3);
  // A Starter save cannot wipe or change Custom fields…
  const saved = mergeForTier(stored, { title: "Bob" }, "standard");
  assert.equal(saved.title, "Bob"); assert.equal(saved.design?.radius, 3); assert.equal(saved.presets?.length, 1);
  // …and a Trial save keeps Starter fields too.
  const trial = mergeForTier(stored, { title: "C", avatarUrl: "https://evil.test/x.png" }, "basic");
  assert.equal(trial.avatarUrl, "https://x.test/a.png");
  // Custom can clear its design.
  assert.equal(mergeForTier(stored, { title: "D" }, "custom").design, undefined);
});
