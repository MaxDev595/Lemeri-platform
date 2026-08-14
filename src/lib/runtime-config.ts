const requiredProductionVariables = [
  "DATABASE_URL",
  "PUBLIC_APP_URL",
  "CREDENTIALS_ENCRYPTION_KEY",
  "CRON_SECRET",
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_START_PRICE_ID",
  "STRIPE_GROWTH_PRICE_ID",
  "RESEND_API_KEY",
  "EMAIL_FROM",
] as const;

export function runtimeConfigurationErrors(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== "production") return [];
  const localSmoke = environment.LEMIRI_LOCAL_SMOKE === "true" && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(environment.PUBLIC_APP_URL ?? "");
  if (localSmoke) return [];
  const errors = requiredProductionVariables.filter((name) => !environment[name]?.trim()).map((name) => `${name} is required`);
  if (!environment.OPENAI_EMBEDDING_MODEL?.trim()) errors.push("OPENAI_EMBEDDING_MODEL is required");
  if (environment.AI_PROVIDER === "openai" && !environment.OPENAI_RESPONSE_MODEL?.trim()) errors.push("OPENAI_RESPONSE_MODEL is required");
  if (environment.AI_PROVIDER === "groq" && !environment.GROQ_API_KEY?.trim()) errors.push("GROQ_API_KEY is required");
  if (environment.AI_PROVIDER === "groq" && !environment.GROQ_CHAT_MODEL?.trim()) errors.push("GROQ_CHAT_MODEL is required");
  if (!environment.AI_PROVIDER || !["openai","groq"].includes(environment.AI_PROVIDER)) errors.push("AI_PROVIDER must be openai or groq");
  if (environment.PUBLIC_APP_URL && !environment.PUBLIC_APP_URL.startsWith("https://")) errors.push("PUBLIC_APP_URL must use HTTPS");
  if (environment.CREDENTIALS_ENCRYPTION_KEY && environment.CREDENTIALS_ENCRYPTION_KEY.length < 32) errors.push("CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters");
  if (environment.CRON_SECRET && environment.CRON_SECRET.length < 32) errors.push("CRON_SECRET must be at least 32 characters");
  return errors;
}
