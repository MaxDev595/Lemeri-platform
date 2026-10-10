import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROFILE, normalizeProfile, profileFromRules, rulesWithProfile } from "../src/lib/ai/profile.ts";

test("sales profile is validated and stored next to legacy handoff rules", () => {
  const p = normalizeProfile({ language: "xx", contactTiming: "early", orderUrl: "javascript:alert(1)", privacyUrl: "https://shop.test/privacy", handoffPresets: ["complaint", "hack"], restrictions: "x".repeat(5000), upsell: "yes" });
  assert.equal(p.language, "auto"); assert.equal(p.contactTiming, "early"); assert.equal(p.orderUrl, "");
  assert.equal(p.privacyUrl, "https://shop.test/privacy"); assert.deepEqual(p.handoffPresets, ["complaint"]);
  assert.equal(p.restrictions.length, 1500); assert.equal(p.upsell, DEFAULT_PROFILE.upsell);
  const rules = rulesWithProfile({ uncertainty: true, complaint: false }, p);
  assert.equal((rules as Record<string, unknown>).uncertainty, true);
  assert.equal(profileFromRules(rules).privacyUrl, "https://shop.test/privacy");
  assert.deepEqual(profileFromRules(null), DEFAULT_PROFILE);
});
