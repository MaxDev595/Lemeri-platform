import assert from "node:assert/strict";
import test from "node:test";
import { canWorkspace } from "../src/lib/auth/permissions.ts";

test("workspace RBAC capability matrix", () => {
  assert.equal(canWorkspace("OWNER", "CONFIGURE_AI"), true);
  assert.equal(canWorkspace("ADMIN", "MANAGE_KNOWLEDGE"), true);
  assert.equal(canWorkspace("MANAGER", "OPERATE_CRM"), true);
  assert.equal(canWorkspace("MANAGER", "TAKE_OVER_CONVERSATION"), true);
  assert.equal(canWorkspace("MANAGER", "MANAGE_ASSIGNMENTS"), true);
  assert.equal(canWorkspace("VIEWER", "MANAGE_ASSIGNMENTS"), false);
  assert.equal(canWorkspace("MANAGER", "CONFIGURE_AI"), false);
  assert.equal(canWorkspace("VIEWER", "OPERATE_CRM"), false);
  assert.equal(canWorkspace("VIEWER", "RUN_AI_TESTS"), false);
});
