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

test("onboarding publication attestation can use the configured Groq secret in production",()=>{
  const previous={nodeEnv:process.env.NODE_ENV,credentials:process.env.CREDENTIALS_ENCRYPTION_KEY,cron:process.env.CRON_SECRET,groq:process.env.GROQ_API_KEY};
  process.env.NODE_ENV="production";delete process.env.CREDENTIALS_ENCRYPTION_KEY;delete process.env.CRON_SECRET;process.env.GROQ_API_KEY="test-groq-secret";
  try{const token=createOnboardingTestToken("config-groq",1_700_000_000_000);assert.equal(verifyOnboardingTestToken(token,"config-groq",1_700_000_001_000),true)}finally{
    if(previous.nodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous.nodeEnv;
    if(previous.credentials===undefined)delete process.env.CREDENTIALS_ENCRYPTION_KEY;else process.env.CREDENTIALS_ENCRYPTION_KEY=previous.credentials;
    if(previous.cron===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous.cron;
    if(previous.groq===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=previous.groq;
  }
});
