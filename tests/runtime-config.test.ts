import assert from "node:assert/strict";
import test from "node:test";
import { runtimeConfigurationErrors } from "../src/lib/runtime-config.ts";

test("development configuration permits optional providers", () => {
  assert.deepEqual(runtimeConfigurationErrors({ NODE_ENV: "development" }), []);
});

test("production configuration fails closed for missing providers and insecure origin", () => {
  const errors = runtimeConfigurationErrors({ NODE_ENV: "production", PUBLIC_APP_URL: "http://example.com", AI_PROVIDER: "mock", CREDENTIALS_ENCRYPTION_KEY: "short", CRON_SECRET: "short" });
  assert.ok(errors.some((error) => error.includes("DATABASE_URL")));
  assert.ok(errors.some((error) => error.includes("HTTPS")));
  assert.ok(errors.some((error) => error.includes("AI_PROVIDER")));
  assert.ok(errors.some((error) => error.includes("CREDENTIALS_ENCRYPTION_KEY")));
});

test("explicit local smoke mode is restricted to loopback origins", () => {
  assert.deepEqual(runtimeConfigurationErrors({ NODE_ENV: "production", LEMIRI_LOCAL_SMOKE: "true", PUBLIC_APP_URL: "http://localhost:3100", AI_PROVIDER: "mock" }), []);
  assert.ok(runtimeConfigurationErrors({ NODE_ENV: "production", LEMIRI_LOCAL_SMOKE: "true", PUBLIC_APP_URL: "https://lemiri.example", AI_PROVIDER: "mock" }).length > 0);
});

test("production accepts Groq responses with OpenAI embeddings", () => {
  const environment={NODE_ENV:"production",DATABASE_URL:"postgres://example",PUBLIC_APP_URL:"https://example.com",AI_PROVIDER:"groq",GROQ_API_KEY:"groq-test",GROQ_CHAT_MODEL:"openai/gpt-oss-120b",OPENAI_API_KEY:"openai-test",OPENAI_EMBEDDING_MODEL:"text-embedding-3-small",CREDENTIALS_ENCRYPTION_KEY:"x".repeat(32),CRON_SECRET:"y".repeat(32),STRIPE_SECRET_KEY:"stripe",STRIPE_WEBHOOK_SECRET:"stripe-hook",STRIPE_START_PRICE_ID:"start",STRIPE_GROWTH_PRICE_ID:"growth",RESEND_API_KEY:"resend",EMAIL_FROM:"test@example.com"};
  assert.deepEqual(runtimeConfigurationErrors(environment),[]);
});
