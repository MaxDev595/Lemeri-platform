import assert from "node:assert/strict";
import test from "node:test";
import { createOnboardingTestToken, verifyOnboardingTestToken } from "../src/lib/onboarding/test-attestation.ts";

test("onboarding publication attestation is configuration-bound and expires",()=>{
  const now=1_700_000_000_000;const token=createOnboardingTestToken("config-a",now);
  assert.equal(verifyOnboardingTestToken(token,"config-a",now+1_000),true);
  assert.equal(verifyOnboardingTestToken(token,"config-b",now+1_000),false);
  assert.equal(verifyOnboardingTestToken(`${token}x`,"config-a",now+1_000),false);
  assert.equal(verifyOnboardingTestToken(token,"config-a",now+30*60_000+1),false);
});
