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
  assert.equal(stripePlanFromPriceId("price_start","price_start","price_growth"),"START");
  assert.equal(stripePlanFromPriceId("price_growth","price_start","price_growth"),"GROWTH");
  assert.equal(stripePlanFromPriceId("price_unknown","price_start","price_growth"),null);
  assert.equal(stripePlanForSubscription("","price_start","price_growth","GROWTH","CANCELED"),"GROWTH");
  assert.equal(stripePlanForSubscription("price_unknown","price_start","price_growth","GROWTH","ACTIVE"),null);
});

test("billing limits come from the central plan catalog",()=>{assert.equal(getBillingPlan("START"),billingPlans.START);assert.equal(getBillingPlan("unknown"),billingPlans.TRIAL);assert.ok(billingPlans.GROWTH.conversationLimit>billingPlans.START.conversationLimit);assert.ok(billingPlans.START.employeeLimit>billingPlans.TRIAL.employeeLimit)});
