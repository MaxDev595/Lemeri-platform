import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("human replies require takeover and atomically enqueue external delivery",()=>{
  const route=readFileSync("src/app/api/conversations/[id]/messages/route.ts","utf8");
  assert.match(route,/conversation\.status!=="HUMAN_ACTIVE"/);
  assert.match(route,/tx\.message\.create/);
  assert.match(route,/tx\.backgroundJob\.create/);
  assert.match(route,/type:"OUTBOUND_CHANNEL_MESSAGE"/);
  assert.match(route,/tx\.humanHandoff\.updateMany/);
});

test("website reply polling is bound to signed employee and visitor conversation",()=>{
  const route=readFileSync("src/app/api/widget/[employeeId]/messages/route.ts","utf8");
  assert.match(route,/verifyWidgetToken/);
  assert.match(route,/externalId:`widget:\$\{employeeId\}:\$\{visitorId\}`/);
  assert.match(route,/direction:"OUTBOUND"/);
});
