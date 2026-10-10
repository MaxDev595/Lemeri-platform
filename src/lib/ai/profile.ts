// Sales profile of the AI employee: character, language, goals, limits, how it
// asks for contacts and when it hands the visitor to a person. Stored inside
// AIEmployeeSettings.handoffRules.profile (existing JSON column, no migration).
// Pure module: used by the API, the prompt builder and the cabinet.

export const CONTACT_TIMINGS = ["when_interested", "early", "on_request"] as const;
export const PRIMARY_GOALS = ["lead", "sale", "consult"] as const;
export const LANGUAGES = ["auto", "ru", "en", "uk", "kk", "uz", "de", "es", "fr", "tr"] as const;
export const HANDOFF_PRESETS = ["complaint", "discount", "custom_order", "legal", "angry", "asks_human"] as const;

export type SalesProfile = {
  personality: string;
  language: (typeof LANGUAGES)[number];
  primaryGoal: (typeof PRIMARY_GOALS)[number];
  goals: string;
  restrictions: string;
  contactTiming: (typeof CONTACT_TIMINGS)[number];
  requirePhone: boolean;
  requireEmail: boolean;
  askBudget: boolean;
  extraFields: string;
  handoffPresets: Array<(typeof HANDOFF_PRESETS)[number]>;
  handoffWhen: string;
  upsell: boolean;
  orderUrl: string;
  privacyUrl: string;
};

export const DEFAULT_PROFILE: SalesProfile = {
  personality: "", language: "auto", primaryGoal: "lead", goals: "", restrictions: "",
  contactTiming: "when_interested", requirePhone: true, requireEmail: false, askBudget: true, extraFields: "",
  handoffPresets: ["complaint", "custom_order", "asks_human"], handoffWhen: "", upsell: true, orderUrl: "", privacyUrl: "",
};

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const oneOf = <T extends readonly string[]>(list: T, value: unknown, fallback: T[number]): T[number] => (list as readonly string[]).includes(String(value)) ? value as T[number] : fallback;
const url = (value: unknown) => { const raw = text(value, 500); if (!raw) return ""; try { const parsed = new URL(raw); return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : ""; } catch { return ""; } };

export function normalizeProfile(raw: unknown): SalesProfile {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (key: keyof SalesProfile) => typeof v[key] === "boolean" ? v[key] as boolean : DEFAULT_PROFILE[key] as boolean;
  return {
    personality: text(v.personality, 600), language: oneOf(LANGUAGES, v.language, "auto"), primaryGoal: oneOf(PRIMARY_GOALS, v.primaryGoal, "lead"),
    goals: text(v.goals, 800), restrictions: text(v.restrictions, 1500),
    contactTiming: oneOf(CONTACT_TIMINGS, v.contactTiming, "when_interested"),
    requirePhone: bool("requirePhone"), requireEmail: bool("requireEmail"), askBudget: bool("askBudget"), extraFields: text(v.extraFields, 300),
    handoffPresets: Array.isArray(v.handoffPresets) ? [...new Set(v.handoffPresets.filter(item => (HANDOFF_PRESETS as readonly string[]).includes(String(item))))] as SalesProfile["handoffPresets"] : DEFAULT_PROFILE.handoffPresets,
    handoffWhen: text(v.handoffWhen, 800), upsell: bool("upsell"), orderUrl: url(v.orderUrl), privacyUrl: url(v.privacyUrl),
  };
}

/** Reads the profile out of the handoffRules JSON column. */
export function profileFromRules(rules: unknown): SalesProfile {
  return normalizeProfile(rules && typeof rules === "object" ? (rules as Record<string, unknown>).profile : undefined);
}
/** Writes the profile back, keeping any other keys stored in handoffRules. */
export function rulesWithProfile(rules: unknown, profile: SalesProfile) {
  return { ...(rules && typeof rules === "object" && !Array.isArray(rules) ? rules as Record<string, unknown> : {}), profile };
}
