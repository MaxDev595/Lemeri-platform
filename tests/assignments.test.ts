import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canReceiveAssignment } from "../src/lib/assignments.ts";

test("only operational workspace roles can receive assignments",()=>{
  assert.equal(canReceiveAssignment("OWNER"),true);
  assert.equal(canReceiveAssignment("ADMIN"),true);
  assert.equal(canReceiveAssignment("MANAGER"),true);
  assert.equal(canReceiveAssignment("VIEWER"),false);
});

test("assignment persistence is member-based and tenant-scoped",()=>{
  const schema=readFileSync("prisma/schema.prisma","utf8");
  const route=readFileSync("src/app/api/assignments/route.ts","utf8");
  assert.match(schema,/assignedConversations Conversation\[\]/);
  assert.match(schema,/assignedEmployees AIEmployee\[\]/);
  assert.match(schema,/assignedLeads Lead\[\]/);
  assert.equal((route.match(/workspaceId:auth\.workspaceId/g)??[]).length>=4,true);
});
