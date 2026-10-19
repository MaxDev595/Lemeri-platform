import assert from "node:assert/strict";
import test from "node:test";
import { isPlatformAdmin, normalizePlatformAssistant } from "../src/lib/platform/access.ts";
import { PLATFORM_MESSAGE_LIMIT, resolveAccess } from "../src/lib/billing/plans.ts";

test("platform admins come only from LEMIRI_ADMIN_EMAILS, case-insensitive", () => {
  const env = { LEMIRI_ADMIN_EMAILS: " Owner@Example.com ,second@example.com" };
  assert.equal(isPlatformAdmin("owner@example.com", env), true);
  assert.equal(isPlatformAdmin("OWNER@EXAMPLE.COM", env), true);
  assert.equal(isPlatformAdmin("someone@example.com", env), false);
  assert.equal(isPlatformAdmin("", env), false);
  assert.equal(isPlatformAdmin("owner@example.com", {}), false);
});

test("assistant switches default to on and reject odd ids", () => {
  assert.deepEqual(normalizePlatformAssistant({}), { workspaceId: null, employeeId: null, landing: true, app: true, updatedAt: null });
  const v = normalizePlatformAssistant({ employeeId: "bad id'; drop", landing: false, app: "no" });
  assert.equal(v.employeeId, null); assert.equal(v.landing, false); assert.equal(v.app, true);
});

test("Lemeri's own workspace has Custom without a reply allowance", () => {
  const now = new Date("2026-10-17T10:00:00Z");
  const access = resolveAccess({ subscription: { plan: "CUSTOM", status: "ACTIVE", provider: "platform", currentPeriodStart: now, currentPeriodEnd: new Date("2100-01-01T00:00:00Z") }, now, env: {} });
  assert.equal(access.plan, "CUSTOM"); assert.equal(access.design, "custom"); assert.equal(access.messageLimit, PLATFORM_MESSAGE_LIMIT);
  const paid = resolveAccess({ subscription: { plan: "CUSTOM", status: "ACTIVE", provider: "P2P", currentPeriodStart: now, currentPeriodEnd: new Date("2026-11-17T10:00:00Z") }, now, env: {} });
  assert.equal(paid.messageLimit, 2000);
});
