import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { isStaleStripeEvent, stripePlanForSubscription, stripePlanFromPriceId, verifyStripeSignature } from "../src/lib/billing/stripe.ts";
import { billingPlans, getBillingPlan } from "../src/lib/billing/plans.ts";

test("stripe webhook signature validates payload and timestamp",()=>{
  const raw=JSON.stringify({id:"evt_1",type:"checkout.session.completed"});const secret="whsec_test_secret";const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256",secret).update(`${timestamp}.${raw}`).digest("hex");
  assert.equal(verifyStripeSignature(raw,`t=${timestamp},v1=${signature}`,secret),true);
  assert.equal(verifyStripeSignature(`${raw}x`,`t=${timestamp},v1=${signature}`,secret),false);
  assert.equal(verifyStripeSignature(raw,`t=${timestamp-1000},v1=${signature}`,secret),false);
});

test("stripe event cursor rejects duplicates and older events but permits equal-second distinct events",()=>{
  const cursor={id:"evt_new",createdAt:new Date("2026-08-11T10:00:00.000Z")};
  assert.equal(isStaleStripeEvent(cursor,{id:"evt_new",createdAt:new Date("2026-08-11T10:00:01.000Z")}),true);
  assert.equal(isStaleStripeEvent(cursor,{id:"evt_old",createdAt:new Date("2026-08-11T09:59:59.000Z")}),true);
  assert.equal(isStaleStripeEvent(cursor,{id:"evt_peer",createdAt:new Date("2026-08-11T10:00:00.000Z")}),false);
  assert.equal(isStaleStripeEvent(cursor,{id:"evt_latest",createdAt:new Date("2026-08-11T10:00:01.000Z")}),false);
});

test("stripe accepts any valid v1 signature during secret rotation and maps only configured prices",()=>{
  const raw=JSON.stringify({id:"evt_rotation"});const secret="whsec_rotation";const timestamp=Math.floor(Date.now()/1000);
  const valid=createHmac("sha256",secret).update(`${timestamp}.${raw}`).digest("hex");
  assert.equal(verifyStripeSignature(raw,`t=${timestamp},v1=${"0".repeat(64)},v1=${valid}`,secret),true);
  const env={STRIPE_STARTER_PRICE_ID:"price_starter",STRIPE_CUSTOM_PRICE_ID:"price_custom",STRIPE_START_PRICE_ID:"price_start_legacy",STRIPE_GROWTH_PRICE_ID:"price_growth_legacy"};
  assert.equal(stripePlanFromPriceId("price_starter",env),"STARTER");
  assert.equal(stripePlanFromPriceId("price_custom",env),"CUSTOM");
  // Subscriptions sold before the restructuring keep a plan.
  assert.equal(stripePlanFromPriceId("price_start_legacy",env),"STARTER");
  assert.equal(stripePlanFromPriceId("price_growth_legacy",env),"CUSTOM");
  assert.equal(stripePlanFromPriceId("price_unknown",env),null);
  assert.equal(stripePlanForSubscription("","GROWTH","CANCELED",env),"CUSTOM");
  assert.equal(stripePlanForSubscription("","STARTER","CANCELED",env),"STARTER");
  assert.equal(stripePlanForSubscription("price_unknown","CUSTOM","ACTIVE",env),null);
});

test("plan catalog: Trial $0, Starter $19, Custom $29; legacy keys map to new plans",()=>{
  assert.equal(billingPlans.TRIAL.priceUsd,0);assert.equal(billingPlans.STARTER.priceUsd,19);assert.equal(billingPlans.CUSTOM.priceUsd,29);
  assert.equal(getBillingPlan("START"),billingPlans.STARTER);assert.equal(getBillingPlan("GROWTH"),billingPlans.CUSTOM);assert.equal(getBillingPlan("unknown"),billingPlans.TRIAL);
  // Starter and Custom differ only in card design.
  assert.equal(billingPlans.STARTER.employeeLimit,billingPlans.CUSTOM.employeeLimit);assert.equal(billingPlans.STARTER.design,"standard");assert.equal(billingPlans.CUSTOM.design,"custom");
});
