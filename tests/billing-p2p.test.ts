import assert from "node:assert/strict";
import test from "node:test";
import { FEATURE_MATRIX, planAllows, planFor, planNumber, planValue } from "../src/lib/billing/features.ts";
import { addPeriod, daysLeft, formatAmount, p2pAmount, p2pConfig, p2pPeriod, paymentCode } from "../src/lib/billing/p2p.ts";
import { resolveAccess } from "../src/lib/billing/plans.ts";

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

test("yearly billing: 20% off, yearly price ids, monthly AI allowance", async () => {
  const { planPriceUsd, yearlyMonthlyUsd, intervalFromPeriod, resolveAccess, normalizeInterval } = await import("../src/lib/billing/plans.ts");
  const { planPriceText } = await import("../src/lib/billing/offer.ts");
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

test("p2p: config from env, amounts and payment code", () => {
  assert.equal(p2pConfig({}).configured, false);
  const config = p2pConfig({ LEMIRI_P2P_RECIPIENT: " Recipient ", LEMIRI_P2P_DETAILS: "Bank A | 0000 ", LEMIRI_P2P_CURRENCY: "eur", LEMIRI_P2P_RATE: "0.9" });
  assert.equal(config.configured, true);
  assert.equal(config.recipient, "Recipient");
  assert.deepEqual(config.details, ["Bank A", "0000"]);
  assert.equal(config.currency, "EUR");
  assert.equal(p2pAmount("STARTER", "month", config), 17);
  assert.equal(p2pAmount("STARTER", "month", p2pConfig({})), 19);
  assert.equal(p2pAmount("CUSTOM", "year", p2pConfig({})), 278.4);
  assert.equal(p2pConfig({ LEMIRI_P2P_RATE: "-3" }).rate, 1);
  assert.equal(formatAmount(182.4, "USD", "en"), "$182.40");
  assert.equal(formatAmount(17, "EUR", "en"), "17 EUR");
  const code = paymentCode("ws_123");
  assert.match(code, /^LM-[0-9A-Z]{6}$/);
  assert.equal(paymentCode("ws_123"), code);
  assert.notEqual(paymentCode("ws_124"), code);
});

test("p2p: paid periods, extension and expiry", () => {
  assert.equal(addPeriod(new Date("2026-01-31T10:00:00Z"), "month").toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(addPeriod(new Date("2026-10-19T00:00:00Z"), "year").toISOString(), "2027-10-19T00:00:00.000Z");
  const now = new Date("2026-10-19T00:00:00Z");
  const fresh = p2pPeriod({ plan: "STARTER", interval: "month", now, current: null });
  assert.equal(fresh.end.toISOString(), "2026-11-19T00:00:00.000Z");
  assert.equal(fresh.extended, false);
  const extended = p2pPeriod({ plan: "STARTER", interval: "month", now, current: { plan: "STARTER", provider: "P2P", status: "ACTIVE", currentPeriodEnd: "2026-10-25T00:00:00Z" } });
  assert.equal(extended.end.toISOString(), "2026-11-25T00:00:00.000Z");
  assert.equal(extended.extended, true);
  // Another plan starts from today.
  assert.equal(p2pPeriod({ plan: "CUSTOM", interval: "month", now, current: { plan: "STARTER", provider: "P2P", status: "ACTIVE", currentPeriodEnd: "2026-10-25T00:00:00Z" } }).extended, false);
  assert.equal(daysLeft("2026-10-24T00:00:00Z", now), 5);
  assert.equal(daysLeft("2026-10-01T00:00:00Z", now), 0);
  // A prepaid period simply ends: no grace like PAST_DUE.
  const sub = { plan: "STARTER", status: "ACTIVE", provider: "P2P", currentPeriodStart: "2026-09-19T00:00:00Z", currentPeriodEnd: "2026-10-19T00:00:00Z" };
  assert.equal(resolveAccess({ subscription: sub, now: new Date("2026-10-18T00:00:00Z"), env: {} }).state, "active");
  assert.notEqual(resolveAccess({ subscription: sub, now: new Date("2026-10-20T00:00:00Z"), env: {} }).state, "active");
});

test("crypto: unique USDT amounts and on-chain matching", async () => {
  const { cryptoAmount, cryptoConfig, matchCryptoPayments, parseTronTransfers, pickTail, USDT_TRC20_CONTRACT } = await import("../src/lib/billing/p2p.ts");
  const wallet = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";
  assert.equal(cryptoConfig({}).configured, false);
  assert.equal(cryptoConfig({ LEMIRI_CRYPTO_USDT_TRC20: "0xabc" }).configured, false);
  assert.equal(cryptoConfig({ LEMIRI_CRYPTO_USDT_TRC20: ` ${wallet} ` }).address, wallet);
  assert.equal(cryptoAmount("STARTER", "month", 137), 19.0137);
  assert.equal(cryptoAmount("CUSTOM", "year", 5), 278.4005);
  assert.equal(pickTail(new Set([500]), () => 0.5), 1); // 500 is taken → first free tail
  const all = new Set(Array.from({ length: 998 }, (_, i) => i + 1));
  assert.equal(pickTail(all, () => 0), 999);

  const created = new Date("2026-10-19T10:00:00Z");
  const at = (minutes: number) => created.getTime() + minutes * 60_000;
  const transfers = parseTronTransfers({ data: [
    { transaction_id: "tx_wrong_amount", to: wallet, value: "19000000", block_timestamp: at(2), type: "Transfer", token_info: { address: USDT_TRC20_CONTRACT } },
    { transaction_id: "tx_fake_token", to: wallet, value: "19013700", block_timestamp: at(3), type: "Transfer", token_info: { address: "TFakeToken" } },
    { transaction_id: "tx_before", to: wallet, value: "29001000", block_timestamp: at(-30), type: "Transfer", token_info: { address: USDT_TRC20_CONTRACT } },
    { transaction_id: "tx_ok", to: wallet, value: "19013700", block_timestamp: at(4), type: "Transfer", token_info: { address: USDT_TRC20_CONTRACT } },
    { transaction_id: 5, to: wallet },
  ] });
  assert.equal(transfers.length, 4);
  const invoices = [{ id: "a", amount: 19.0137, createdAt: created }, { id: "b", amount: 29.001, createdAt: created }, { id: "c", amount: 19.0137, createdAt: created }];
  // Exact amount + real USDT + after the invoice; one transaction pays one invoice.
  assert.deepEqual(matchCryptoPayments(invoices, transfers, wallet), [{ invoiceId: "a", txId: "tx_ok" }]);
  assert.deepEqual(matchCryptoPayments(invoices, transfers, wallet, new Set(["tx_ok"])), []);
  assert.deepEqual(matchCryptoPayments([{ id: "late", amount: 19.0137, createdAt: new Date(at(-4 * 60)) }], transfers, wallet), []);
  assert.deepEqual(parseTronTransfers(null), []);
});
