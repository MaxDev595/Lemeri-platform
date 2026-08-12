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
