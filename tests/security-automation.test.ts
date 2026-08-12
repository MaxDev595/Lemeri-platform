import assert from "node:assert/strict";
import test from "node:test";
import { isSameOrigin } from "../src/lib/security/origin.ts";
import { matchesConditions } from "../src/lib/automations/conditions.ts";
test("origin validation rejects cross-site and malformed origins",()=>{assert.equal(isSameOrigin("https://app.lemiri.ai","https://app.lemiri.ai/path"),true);assert.equal(isSameOrigin("https://evil.example","https://app.lemiri.ai"),false);assert.equal(isSameOrigin("not a url","https://app.lemiri.ai"),false);assert.equal(isSameOrigin(null,"https://app.lemiri.ai"),false)});
test("automation conditions require every configured condition",()=>{assert.equal(matchesConditions({handoff:true,channel:"TELEGRAM"},{handoff:true,channel:"TELEGRAM",confidence:.2}),true);assert.equal(matchesConditions({handoff:true},{handoff:false}),false);assert.equal(matchesConditions({},{}),true)});
