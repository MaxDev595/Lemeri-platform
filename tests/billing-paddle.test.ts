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

test("yearly billing: 20% off, yearly price ids, monthly AI allowance", async () => {
  const { planPriceUsd, yearlyMonthlyUsd, intervalFromPeriod, resolveAccess, normalizeInterval } = await import("../src/lib/billing/plans.ts");
  const { planPriceText } = await import("../src/lib/billing/offer.ts");
  const { paddlePriceId, paddlePriceInfo, paddleYearlyConfigured } = await import("../src/lib/billing/paddle.ts");
  assert.equal(planPriceUsd("STARTER", "year"), 182.4);
  assert.equal(planPriceUsd("CUSTOM", "year"), 278.4);
  assert.equal(planPriceUsd("STARTER"), 19);
  assert.equal(yearlyMonthlyUsd("STARTER"), 15.2);
  assert.equal(yearlyMonthlyUsd("CUSTOM"), 23.2);
  assert.equal(planPriceText("STARTER", "year", "ru").total, "$182.40");
  assert.equal(planPriceText("CUSTOM", "year", "en").price, "$23.20");
  assert.match(planPriceText("STARTER", "year", "ru").note, /экономия \$45\.60/);
  assert.equal(planPriceText("STARTER", "month", "en").price, "$19");
  assert.equal(normalizeInterval("annual"), "year");
  assert.equal(normalizeInterval(undefined), "month");

  const env = { PADDLE_API_KEY: "k", PADDLE_CLIENT_TOKEN: "test_t", PADDLE_STARTER_PRICE_ID: "pri_s", PADDLE_CUSTOM_PRICE_ID: "pri_c", PADDLE_STARTER_YEARLY_PRICE_ID: "pri_sy", PADDLE_CUSTOM_YEARLY_PRICE_ID: "pri_cy" };
  assert.equal(paddlePriceId("STARTER", env, "year"), "pri_sy");
  assert.equal(paddlePriceId("CUSTOM", env), "pri_c");
  assert.deepEqual(paddlePriceInfo("pri_cy", env), { plan: "CUSTOM", interval: "year" });
  assert.deepEqual(paddlePriceInfo("pri_s", env), { plan: "STARTER", interval: "month" });
  assert.equal(paddlePlanFromPriceId("pri_sy", env), "STARTER");
  assert.equal(paddleYearlyConfigured(env), true);
  assert.equal(paddleYearlyConfigured({ ...env, PADDLE_CUSTOM_YEARLY_PRICE_ID: "" }), false);

  assert.equal(intervalFromPeriod("2026-10-10T00:00:00Z", "2027-10-10T00:00:00Z"), "year");
  assert.equal(intervalFromPeriod("2026-10-10T00:00:00Z", "2026-11-10T00:00:00Z"), "month");
  // A yearly subscriber gets the monthly allowance, counted per calendar month.
  const access = resolveAccess({ subscription: { plan: "STARTER", status: "ACTIVE", currentPeriodStart: "2026-10-10T00:00:00Z", currentPeriodEnd: "2027-10-10T00:00:00Z" }, now: new Date("2027-03-15T12:00:00Z"), env: {} });
  assert.equal(access.state, "active");
  assert.equal(access.interval, "year");
  assert.equal(access.periodStart, "2027-03-01T00:00:00.000Z");
  assert.equal(access.periodEnd, "2027-04-01T00:00:00.000Z");
  assert.equal(access.messageLimit, 1000);
  const monthly = resolveAccess({ subscription: { plan: "CUSTOM", status: "ACTIVE", currentPeriodStart: "2026-10-10T00:00:00Z", currentPeriodEnd: "2026-11-10T00:00:00Z" }, now: new Date("2026-10-20T00:00:00Z"), env: {} });
  assert.equal(monthly.interval, "month");
  assert.equal(monthly.periodEnd, "2026-11-10T00:00:00.000Z");
});
