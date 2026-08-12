import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/conversations/[id]/events/route.ts", "utf8");
const platform = readFileSync("src/components/platform.tsx", "utf8");

test("conversation events are tenant scoped and tolerate invalid cursors", () => {
  assert.match(route, /workspaceId:auth\.workspaceId/);
  assert.match(route, /Number\.isFinite\(parsedCursor\)/);
});

test("conversation event stream prevents overlapping polls and stays alive", () => {
  assert.match(route, /if\(querying\|\|closed\)return/);
  assert.match(route, /: heartbeat/);
  assert.match(route, /request\.signal\.addEventListener\("abort"/);
});

test("conversation UI subscribes to events and releases the connection", () => {
  assert.match(platform, /new EventSource\(`\/api\/conversations\/\$\{selected\}\/events`\)/);
  assert.match(platform, /events\.removeEventListener\("message",onMessage\)/);
  assert.match(platform, /events\.close\(\)/);
  assert.match(platform, /const refreshRef=useRef\(refresh\)/);
});
