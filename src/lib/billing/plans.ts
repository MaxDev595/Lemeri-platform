// Lemeri AI plans: Trial ($0, 14 days) → Starter ($19) → Custom ($29).
// Paid plans are billed monthly or yearly; yearly costs 20% less (YEARLY_DISCOUNT).
// Starter and Custom have the same AI sales assistant; Custom adds the advanced
// visual editor for the website card. Nothing else differs (see docs/CLAUDE_CONTEXT.md).
//
// Pure module (no I/O): used by API routes, the widget renderer and tests.

export type PlanKey = "TRIAL" | "STARTER" | "CUSTOM";
/** How far the website card can be customised. */
export type DesignTier = "basic" | "standard" | "custom";

export const TRIAL_DAYS = 14;

export const billingPlans = {
  TRIAL: { key: "TRIAL", name: "Trial", priceUsd: 0, employeeLimit: 1, design: "basic" },
  STARTER: { key: "STARTER", name: "Starter", priceUsd: 19, employeeLimit: 1, design: "standard" },
  CUSTOM: { key: "CUSTOM", name: "Custom", priceUsd: 29, employeeLimit: 1, design: "custom" },
} as const satisfies Record<PlanKey, { key: PlanKey; name: string; priceUsd: number; employeeLimit: number; design: DesignTier }>;
export type BillingPlanKey = PlanKey;

/** How often a paid plan is billed. Yearly = 12 months minus YEARLY_DISCOUNT. */
export type BillingInterval = "month" | "year";
export const YEARLY_DISCOUNT = 0.2;
export function normalizeInterval(value: unknown): BillingInterval {
  const key = String(value ?? "").toLowerCase();
  return key === "year" || key === "yearly" || key === "annual" ? "year" : "month";
}
/** Price in USD for one billing period: Starter $19 / $182.40, Custom $29 / $278.40. */
export function planPriceUsd(plan: PlanKey, interval: BillingInterval = "month") {
  const monthly = billingPlans[plan].priceUsd;
  return interval === "year" ? Math.round(monthly * 12 * (1 - YEARLY_DISCOUNT) * 100) / 100 : monthly;
}
/** Monthly equivalent of the yearly price ($15.20 for Starter). */
export function yearlyMonthlyUsd(plan: PlanKey) { return Math.round((planPriceUsd(plan, "year") / 12) * 100) / 100; }
export function formatUsd(value: number) { return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`; }
/** A subscription period longer than ~6 weeks is a yearly one (no extra column needed). */
export function intervalFromPeriod(start: Date | string | null | undefined, end: Date | string | null | undefined): BillingInterval {
  const from = start ? new Date(start).getTime() : NaN, to = end ? new Date(end).getTime() : NaN;
  return Number.isFinite(from) && Number.isFinite(to) && to - from > 45 * 86_400_000 ? "year" : "month";
}

// Plans sold before the restructuring keep working: START → Starter, GROWTH → Custom.
const LEGACY: Record<string, PlanKey> = { START: "STARTER", GROWTH: "CUSTOM", PRO: "CUSTOM", BUSINESS: "CUSTOM" };
export function normalizePlan(value: string | null | undefined): PlanKey {
  const key = String(value ?? "").toUpperCase();
  if (key === "TRIAL" || key === "STARTER" || key === "CUSTOM") return key;
  return LEGACY[key] ?? "TRIAL";
}
export function getBillingPlan(value: string) { return billingPlans[normalizePlan(value)]; }

/**
 * Monthly AI reply allowance per plan. Configurable because it must follow model
 * prices: LEMIRI_LIMIT_TRIAL_MESSAGES, LEMIRI_LIMIT_STARTER_MESSAGES,
 * LEMIRI_LIMIT_CUSTOM_MESSAGES. Defaults and their cost maths are in
 * docs/CLAUDE_CONTEXT.md ("Лимиты и экономика").
 */
export const DEFAULT_MESSAGE_LIMITS: Record<PlanKey, number> = { TRIAL: 150, STARTER: 1000, CUSTOM: 2000 };
export function messageLimit(plan: PlanKey, env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}) {
  const value = Number(env[`LEMIRI_LIMIT_${plan}_MESSAGES`]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MESSAGE_LIMITS[plan];
}

export type SubscriptionLike = { plan?: string | null; status?: string | null; provider?: string | null; currentPeriodStart?: Date | string | null; currentPeriodEnd?: Date | string | null } | null | undefined;
export type Access = {
  plan: PlanKey;
  /** trial: free trial running · active: paid · past_due: paid, payment retrying · expired: nothing active */
  state: "trial" | "active" | "past_due" | "expired";
  aiAllowed: boolean;
  design: DesignTier;
  trialEndsAt: string;
  periodStart: string;
  periodEnd: string;
  messageLimit: number;
  /** Billing period of a paid subscription (absent for Trial). AI replies are counted per month either way. */
  interval?: BillingInterval;
  /** Testing period: every plan feature is unlocked for everyone (LEMIRI_OPEN_ACCESS). */
  openAccess?: boolean;
};

/**
 * While the product is being tested every workspace gets the full Custom plan for
 * free. Switch off by removing LEMIRI_OPEN_ACCESS (wrangler.jsonc vars) — nothing in
 * the database changes, so plans, trials and subscriptions resume as they were.
 * The AI reply allowance still applies so tokens stay bounded.
 */
export function openAccessEnabled(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}) {
  return ["1", "true", "on", "yes"].includes(String(env.LEMIRI_OPEN_ACCESS ?? "").trim().toLowerCase());
}

const DAY = 86_400_000;
export const PLATFORM_MESSAGE_LIMIT = 1_000_000;
const PAST_DUE_GRACE_DAYS = 7;
/**
 * Trials of accounts created before billing went live start on this date instead
 * of the sign-up date (LEMIRI_TRIAL_EPOCH overrides it).
 */
export const TRIAL_EPOCH = "2026-10-10T00:00:00Z";

export function trialEndsAt(ownerCreatedAt: Date | string | null | undefined, env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}) {
  const epoch = Date.parse(env.LEMIRI_TRIAL_EPOCH || TRIAL_EPOCH);
  const created = ownerCreatedAt ? new Date(ownerCreatedAt).getTime() : Date.now();
  const start = Math.max(Number.isFinite(created) ? created : Date.now(), Number.isFinite(epoch) ? epoch : 0);
  return new Date(start + TRIAL_DAYS * DAY);
}

/**
 * The single place that decides what a workspace may use right now. The trial is
 * counted from the owner's sign-up, so it is granted once per account.
 */
export function resolveAccess(input: { subscription: SubscriptionLike; ownerCreatedAt?: Date | string | null; workspaceId?: string; now?: Date; env?: Record<string, string | undefined> }): Access {
  const env = input.env ?? (typeof process !== "undefined" ? process.env : {});
  const now = input.now ?? new Date();
  const trialEnd = trialEndsAt(input.ownerCreatedAt, env);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const make = (plan: PlanKey, state: Access["state"], start: Date, end: Date): Access => ({
    plan, state, aiAllowed: state !== "expired", design: billingPlans[plan].design,
    trialEndsAt: trialEnd.toISOString(), periodStart: start.toISOString(), periodEnd: end.toISOString(), messageLimit: messageLimit(plan, env),
  });
  // Complimentary access for the team's own and partner workspaces.
  const comp = (env.LEMIRI_COMP_WORKSPACES ?? "").split(",").map(item => item.trim()).filter(Boolean);
  if (input.workspaceId && comp.includes(input.workspaceId)) return make("CUSTOM", "active", monthStart, monthEnd);
  if (openAccessEnabled(env)) return { ...make("CUSTOM", "active", monthStart, monthEnd), openAccess: true };
  const sub = input.subscription;
  const paid = sub ? normalizePlan(sub.plan) : "TRIAL";
  const status = String(sub?.status ?? "").toUpperCase();
  const periodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  if (sub && paid !== "TRIAL") {
    const start = sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : monthStart;
    const end = periodEnd && periodEnd > start ? periodEnd : monthEnd;
    const interval = intervalFromPeriod(start, end);
    // Usage is counted per calendar month inside long periods so limits stay monthly
    // (a yearly plan gets the monthly allowance every month, not once a year).
    const usageStart = start > monthStart ? start : monthStart;
    const usageEnd = interval === "year" && end > monthEnd ? monthEnd : end;
    // Lemeri's own workspace (platform admin): no reply allowance — it answers Lemeri's own visitors.
    if (sub.provider === "platform" && (status === "ACTIVE" || status === "TRIALING")) return { ...make(paid, "active", monthStart, monthEnd), messageLimit: PLATFORM_MESSAGE_LIMIT };
    if (status === "ACTIVE" || status === "TRIALING") return { ...make(paid, "active", usageStart, usageEnd), interval };
    if (status === "PAST_DUE" && periodEnd && now.getTime() < periodEnd.getTime() + PAST_DUE_GRACE_DAYS * DAY) return { ...make(paid, "past_due", usageStart, usageEnd), interval };
  }
  if (now < trialEnd) return make("TRIAL", "trial", new Date(trialEnd.getTime() - TRIAL_DAYS * DAY), trialEnd);
  return make("TRIAL", "expired", monthStart, monthEnd);
}

/** Back-compat helpers used by older call sites and tests. */
export function effectivePlan(plan: string | null | undefined, status: string | null | undefined): PlanKey {
  if (status !== "ACTIVE" && status !== "TRIALING") return "TRIAL";
  return normalizePlan(plan);
}
export function canActivateEmployee(activeEmployees: number, plan: PlanKey) { return activeEmployees < billingPlans[normalizePlan(plan)].employeeLimit; }
export function canSendAiReply(repliesThisPeriod: number, access: Pick<Access, "aiAllowed" | "messageLimit">) { return access.aiAllowed && repliesThisPeriod < access.messageLimit; }
/** Conversations are no longer capped per plan; AI replies are (see messageLimit). */
export function canCreateConversation(_monthlyConversations: number, _plan: PlanKey) { void _monthlyConversations; void _plan; return true; }
export const designAllows = (tier: DesignTier, needed: DesignTier) => ({ basic: 0, standard: 1, custom: 2 })[tier] >= ({ basic: 0, standard: 1, custom: 2 })[needed];
