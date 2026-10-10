import assert from "node:assert/strict";
import test from "node:test";
import { canActivateEmployee, canCreateConversation, canSendAiReply, effectivePlan, messageLimit, resolveAccess, trialEndsAt } from "../src/lib/billing/plans.ts";

const day = 86_400_000;
const env = { LEMIRI_TRIAL_EPOCH: "2026-01-01T00:00:00Z" };

test("legacy entitlement helpers still map old plans", () => {
  assert.equal(effectivePlan("GROWTH", "ACTIVE"), "CUSTOM");
  assert.equal(effectivePlan("START", "ACTIVE"), "STARTER");
  assert.equal(effectivePlan("START", "PAST_DUE"), "TRIAL");
  assert.equal(effectivePlan("UNKNOWN", "ACTIVE"), "TRIAL");
  assert.equal(canActivateEmployee(0, "TRIAL"), true);
  assert.equal(canActivateEmployee(1, "CUSTOM"), false);
  assert.equal(canCreateConversation(10_000, "TRIAL"), true);
});

test("trial lasts 14 days from the owner's sign-up and is granted once", () => {
  const signup = new Date("2026-10-01T10:00:00Z");
  assert.equal(trialEndsAt(signup, env).toISOString(), "2026-10-15T10:00:00.000Z");
  const during = resolveAccess({ subscription: null, ownerCreatedAt: signup, now: new Date(signup.getTime() + 3 * day), env });
  assert.equal(during.plan, "TRIAL"); assert.equal(during.state, "trial"); assert.equal(during.aiAllowed, true); assert.equal(during.design, "basic");
  const after = resolveAccess({ subscription: null, ownerCreatedAt: signup, now: new Date(signup.getTime() + 15 * day), env });
  assert.equal(after.state, "expired"); assert.equal(after.aiAllowed, false);
  // Accounts older than billing get the trial from the epoch.
  const old = resolveAccess({ subscription: null, ownerCreatedAt: new Date("2025-05-01"), now: new Date("2026-01-05"), env });
  assert.equal(old.state, "trial");
});

test("paid plans: active, past due grace, cancelled, design tiers", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const sub = (plan: string, status: string, end = "2026-11-01T00:00:00Z") => ({ plan, status, currentPeriodStart: "2026-10-01T00:00:00Z", currentPeriodEnd: end });
  const starter = resolveAccess({ subscription: sub("STARTER", "ACTIVE"), ownerCreatedAt: "2025-01-01", now, env });
  assert.deepEqual([starter.plan, starter.state, starter.design, starter.aiAllowed], ["STARTER", "active", "standard", true]);
  const custom = resolveAccess({ subscription: sub("GROWTH", "ACTIVE"), ownerCreatedAt: "2025-01-01", now, env });
  assert.deepEqual([custom.plan, custom.design], ["CUSTOM", "custom"]);
  const pastDue = resolveAccess({ subscription: sub("CUSTOM", "PAST_DUE", "2026-10-18T00:00:00Z"), ownerCreatedAt: "2025-01-01", now, env });
  assert.equal(pastDue.state, "past_due"); assert.equal(pastDue.aiAllowed, true);
  const lapsed = resolveAccess({ subscription: sub("CUSTOM", "PAST_DUE", "2026-10-01T00:00:00Z"), ownerCreatedAt: "2025-01-01", now, env });
  assert.equal(lapsed.state, "expired");
  const cancelled = resolveAccess({ subscription: sub("CUSTOM", "CANCELED"), ownerCreatedAt: "2025-01-01", now, env });
  assert.deepEqual([cancelled.plan, cancelled.state, cancelled.design], ["TRIAL", "expired", "basic"]);
  const comp = resolveAccess({ subscription: null, ownerCreatedAt: "2025-01-01", workspaceId: "ws_team", now, env: { ...env, LEMIRI_COMP_WORKSPACES: "ws_team" } });
  assert.deepEqual([comp.plan, comp.state], ["CUSTOM", "active"]);
});

test("message limits are configurable and enforced per period", () => {
  assert.equal(messageLimit("STARTER", {}), 2000);
  assert.equal(messageLimit("STARTER", { LEMIRI_LIMIT_STARTER_MESSAGES: "3500" }), 3500);
  assert.equal(messageLimit("TRIAL", { LEMIRI_LIMIT_TRIAL_MESSAGES: "nope" }), 150);
  assert.equal(canSendAiReply(1999, { aiAllowed: true, messageLimit: 2000 }), true);
  assert.equal(canSendAiReply(2000, { aiAllowed: true, messageLimit: 2000 }), false);
  assert.equal(canSendAiReply(0, { aiAllowed: false, messageLimit: 2000 }), false);
});
