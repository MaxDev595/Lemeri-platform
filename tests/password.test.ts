import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/lib/auth/password.ts";

test("password hashes are salted and verify in constant-time comparison path", async () => {
  const first = await hashPassword("a-secure-password");
  const second = await hashPassword("a-secure-password");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a-secure-password", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
  assert.equal(await verifyPassword("a-secure-password", "invalid"), false);
});
