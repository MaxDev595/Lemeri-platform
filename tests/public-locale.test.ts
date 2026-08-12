import assert from "node:assert/strict";
import test from "node:test";
import { localeHref, safeReturnTo } from "../src/lib/locale-utils.ts";

test("public locale links preserve existing query parameters",()=>{
  assert.equal(localeHref("/login","en"),"/login?lang=en");
  assert.equal(localeHref("/login?returnTo=%2Finvite%2Fabc","ru"),"/login?returnTo=%2Finvite%2Fabc&lang=ru");
});

test("auth return paths only allow same-origin absolute paths",()=>{
  assert.equal(safeReturnTo("/invite/abc?lang=en"),"/invite/abc?lang=en");
  assert.equal(safeReturnTo("//evil.example/steal"),undefined);
  assert.equal(safeReturnTo("https://evil.example/steal"),undefined);
  assert.equal(safeReturnTo(undefined),undefined);
});
