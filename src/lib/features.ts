// Product scope switches. Lemeri AI ships as one product — an AI sales assistant
// for websites — and every module outside that scope stays in the codebase but is
// switched off here. See docs/FUTURE_FEATURES.md before turning anything on.
//
// Turn a module back on with the LEMIRI_FEATURES env var (comma separated keys),
// e.g. LEMIRI_FEATURES="crm,team". Pure module: safe in server and client code.

export const FEATURE_KEYS = [
  "crm",            // deals, contacts, companies, tasks, products, CRM reports and settings
  "team",           // team messenger, report requests, employee accounts, employee AI
  "messengers",     // Telegram, WhatsApp, Email channels
  "integrations",   // external CRM webhooks
  "automations",    // rules / automations builder
  "appointments",   // online booking (createAppointment action, appointments page)
  "actionsPage",    // raw AI action permissions page (the MVP exposes them as toggles)
  "analyticsPro",   // advanced analytics page and AI insights
  "workspaceAssistant", // in-app AI assistant for the owner (floating card in the cabinet)
  "multiWorkspace", // switching between several workspaces
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

function parse(raw: string | undefined) {
  const on = new Set((raw ?? "").split(",").map(item => item.trim()).filter(Boolean));
  return Object.fromEntries(FEATURE_KEYS.map(key => [key, on.has(key) || on.has("all")])) as Record<FeatureKey, boolean>;
}

/** Server-side truth. Client code receives the same map from the server as a prop. */
export function features(): Record<FeatureKey, boolean> {
  return parse(typeof process !== "undefined" ? process.env.LEMIRI_FEATURES : undefined);
}
export const featureEnabled = (key: FeatureKey) => features()[key];

/** JSON body for API routes of switched-off modules. */
export const FEATURE_DISABLED = { error: "FEATURE_DISABLED" } as const;
