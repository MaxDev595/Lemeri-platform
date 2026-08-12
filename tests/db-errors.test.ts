import assert from "node:assert/strict";
import test from "node:test";
import { isUniqueConstraintError } from "../src/lib/db-errors.ts";

test("Prisma unique constraint races are recognized without swallowing other errors", () => {
  assert.equal(isUniqueConstraintError({ code: "P2002" }), true);
  assert.equal(isUniqueConstraintError({ code: "P2025" }), false);
  assert.equal(isUniqueConstraintError(new Error("P2002")), false);
  assert.equal(isUniqueConstraintError(null), false);
});
