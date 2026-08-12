import assert from "node:assert/strict";
import test from "node:test";
import { createWidgetToken, verifyWidgetToken } from "../src/lib/security/widget-token.ts";

test("widget token is bound to employee, browser-observed parent origin and expiry",()=>{const now=Date.now();const token=createWidgetToken({employeeId:"employee-a",origin:"https://customer.example",expiresAt:now+60_000});assert.equal(verifyWidgetToken(token,"employee-a","https://customer.example",now),true);assert.equal(verifyWidgetToken(token,"employee-a","https://attacker.example",now),false);assert.equal(verifyWidgetToken(token,"employee-b","https://customer.example",now),false);assert.equal(verifyWidgetToken(token,"employee-a","https://customer.example",now+60_001),false);assert.equal(verifyWidgetToken(`${token}x`,"employee-a","https://customer.example",now),false)});
