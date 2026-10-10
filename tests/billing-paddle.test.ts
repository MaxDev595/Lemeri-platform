import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { FEATURE_MATRIX, planAllows, planFor, planNumber, planValue } from "../src/lib/billing/features.ts";
import { looksLikeCardData, paddlePlanFromPriceId, paddleStatus, verifyPaddleSignature } from "../src/lib/billing/paddle.ts";

const trial = { plan: "TRIAL" as const }, starter = { plan: "STARTER" as const }, custom = { plan: "CUSTOM" as const };

test("feature matrix: what each plan gets", () => {
  assert.equal(planAllows(trial, "documents"), false);
  assert.equal(planAllows(starter, "documents"), true);
  assert.equal(planAllows(trial, "managerReplies"), false);
  assert.equal(planAllows(starter, "managerReplies"), true);
  assert.equal(planAllows(starter, "hideBranding"), false);
  assert.equal(planAllows(custom, "hideBranding"), true);
  assert.equal(planNumber(trial, "siteStudyPages"), 10);
  assert.equal(planNumber(starter, "siteStudyPages"), 20);
  assert.equal(planNumber(trial, "knowledgeSources"), 5);
  assert.equal(planNumber(trial, "aiReplies", {}), 150);
  assert.equal(planNumber(starter, "aiReplies", { LEMIRI_LIMIT_STARTER_MESSAGES: "3000" }), 3000);
  // Testing period: everything as in Custom.
  assert.equal(planAllows({ plan: "TRIAL", openAccess: true }, "matchDesign"), true);
  assert.equal(planFor("documents"), "STARTER");
  assert.equal(planFor("matchDesign"), "CUSTOM");
  assert.equal(planFor("leads"), "TRIAL");
  // Every row has a value for every plan; higher plans never get less.
  const rank = (v: unknown) => v === true ? 1 : v === false ? 0 : typeof v === "number" ? v : 0;
  for (const row of FEATURE_MATRIX) {
    assert.ok(rank(row.values.STARTER) >= rank(row.values.TRIAL), row.key);
    assert.ok(rank(row.values.CUSTOM) >= rank(row.values.STARTER), row.key);
    assert.notEqual(planValue(custom, row.key), undefined);
  }
});

test("paddle webhook signature", async () => {
  const secret = "pdl_ntfset_test", raw = '{"event_id":"evt_1"}', ts = Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex");
  assert.equal(await verifyPaddleSignature(raw, `ts=${ts};h1=${h1}`, secret), true);
  assert.equal(await verifyPaddleSignature(raw + " ", `ts=${ts};h1=${h1}`, secret), false);
  assert.equal(await verifyPaddleSignature(raw, `ts=${ts};h1=${h1}`, "other"), false);
  assert.equal(await verifyPaddleSignature(raw, `ts=${ts - 1000};h1=${createHmac("sha256", secret).update(`${ts - 1000}:${raw}`).digest("hex")}`, secret), false);
  assert.equal(await verifyPaddleSignature(raw, "", secret), false);
});

test("paddle prices, statuses and card guard", () => {
  const env = { PADDLE_STARTER_PRICE_ID: "pri_s", PADDLE_CUSTOM_PRICE_ID: "pri_c" };
  assert.equal(paddlePlanFromPriceId("pri_s", env), "STARTER");
  assert.equal(paddlePlanFromPriceId("pri_c", env), "CUSTOM");
  assert.equal(paddlePlanFromPriceId("pri_x", env), null);
  assert.equal(paddleStatus("active"), "ACTIVE");
  assert.equal(paddleStatus("past_due"), "PAST_DUE");
  assert.equal(paddleStatus("canceled"), "CANCELED");
  assert.equal(looksLikeCardData({ details: { address: "4111 1111 1111 1111" } }), true);
  assert.equal(looksLikeCardData({ cvc: "123" }), true);
  assert.equal(looksLikeCardData({ details: { fullName: "Иван Петров", postalCode: "050000", address: "ул. Абая 10, кв 5", taxId: "123456789012" } }), false);
});
