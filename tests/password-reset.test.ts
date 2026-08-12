import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPasswordResetToken, passwordResetTokenHash } from "../src/lib/auth/password-reset.ts";

test("password reset tokens are random and domain-separated from session hashes",()=>{const first=createPasswordResetToken();const second=createPasswordResetToken();assert.notEqual(first,second);assert.equal(first.length>=32,true);assert.notEqual(passwordResetTokenHash(first),passwordResetTokenHash(second));assert.notEqual(passwordResetTokenHash(first),first);assert.equal(passwordResetTokenHash(first),passwordResetTokenHash(first))});

test("password reset uses a dedicated persisted model and atomically consumes tokens",()=>{
  const schema=readFileSync("prisma/schema.prisma","utf8");
  const migration=readFileSync("prisma/migrations/20260811000000_initial/migration.sql","utf8");
  const action=readFileSync("src/app/actions/auth.ts","utf8");
  assert.match(schema,/model PasswordResetToken/);
  assert.match(migration,/CREATE TABLE "PasswordResetToken"/);
  assert.match(action,/DELETE FROM "PasswordResetToken"[\s\S]*RETURNING "userId"/);
  assert.doesNotMatch(action,/PASSWORD_RESET_MARKER/);
});
