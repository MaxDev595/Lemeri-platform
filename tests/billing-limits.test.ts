import assert from "node:assert/strict";
import test from "node:test";
import { canActivateEmployee, canCreateConversation, effectivePlan } from "../src/lib/billing/plans.ts";

test("billing entitlement uses only active subscriptions and enforces employee and conversation caps", () => {
  assert.equal(effectivePlan("GROWTH", "ACTIVE"), "GROWTH");
  assert.equal(effectivePlan("START", "PAST_DUE"), "TRIAL");
  assert.equal(effectivePlan("UNKNOWN", "ACTIVE"), "TRIAL");
  assert.equal(canActivateEmployee(0, "TRIAL"), true);
  assert.equal(canActivateEmployee(1, "TRIAL"), false);
  assert.equal(canActivateEmployee(9, "GROWTH"), true);
  assert.equal(canActivateEmployee(10, "GROWTH"), false);
  assert.equal(canCreateConversation(99, "TRIAL"), true);
  assert.equal(canCreateConversation(100, "TRIAL"), false);
  assert.equal(canCreateConversation(4999, "GROWTH"), true);
  assert.equal(canCreateConversation(5000, "GROWTH"), false);
});
