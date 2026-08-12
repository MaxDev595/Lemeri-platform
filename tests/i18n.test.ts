import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator, dateLocale } from "../src/lib/i18n.ts";

test("workspace translations support Russian, English and interpolation", () => {
  assert.equal(createTranslator("ru")("nav.conversations"), "Диалоги");
  assert.equal(createTranslator("en")("nav.conversations"), "Conversations");
  assert.equal(createTranslator("en")("dashboard.hello", { name: "Alex" }), "Hello, Alex");
  assert.equal(dateLocale("en"), "en-US");
});
