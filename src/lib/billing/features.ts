import { messageLimit, type Access, type PlanKey } from "./plans.ts";

// What each plan gives, as data: the server checks these values (planAllows /
// planValue) and the cabinet and landing draw the comparison table from the same
// list, so the promise and the enforcement can never drift apart.
// Pure module: no I/O. Open testing access (LEMIRI_OPEN_ACCESS) resolves to Custom.

export type FeatureKey =
  | "aiReplies" | "employees" | "knowledgeSources" | "documents" | "siteStudyPages" | "liveSiteReading"
  | "leads" | "leadForm" | "history" | "managerReplies" | "analytics"
  | "design" | "readyStyles" | "visualEditor" | "matchDesign" | "hideBranding";

type Value = boolean | number | string;
export type FeatureRow = { key: FeatureKey; group: "ai" | "knowledge" | "sales" | "card"; label: { ru: string; en: string }; values: Record<PlanKey, Value>; hint?: { ru: string; en: string } };

export const FEATURE_MATRIX: FeatureRow[] = [
  { key: "aiReplies", group: "ai", label: { ru: "Ответы ИИ в месяц", en: "AI replies per month" }, values: { TRIAL: 150, STARTER: 2000, CUSTOM: 2000 } },
  { key: "employees", group: "ai", label: { ru: "ИИ-сотрудник (продавец)", en: "AI employee (seller)" }, values: { TRIAL: 1, STARTER: 1, CUSTOM: 1 } },
  { key: "liveSiteReading", group: "ai", label: { ru: "ИИ читает страницу, где сейчас посетитель", en: "AI reads the page the visitor is on" }, values: { TRIAL: true, STARTER: true, CUSTOM: true } },
  { key: "knowledgeSources", group: "knowledge", label: { ru: "Источников в базе знаний", en: "Knowledge sources" }, values: { TRIAL: 5, STARTER: 50, CUSTOM: 50 } },
  { key: "siteStudyPages", group: "knowledge", label: { ru: "«Изучить сайт»: страниц за раз", en: "“Study the site”: pages per run" }, values: { TRIAL: 10, STARTER: 20, CUSTOM: 20 } },
  { key: "documents", group: "knowledge", label: { ru: "Загрузка документов (PDF, DOCX, XLSX)", en: "Document upload (PDF, DOCX, XLSX)" }, values: { TRIAL: false, STARTER: true, CUSTOM: true } },
  { key: "leads", group: "sales", label: { ru: "Сбор заявок ИИ в чате", en: "AI collects requests in chat" }, values: { TRIAL: true, STARTER: true, CUSTOM: true } },
  { key: "leadForm", group: "sales", label: { ru: "Форма заявки с согласием", en: "Request form with consent" }, values: { TRIAL: true, STARTER: true, CUSTOM: true } },
  { key: "history", group: "sales", label: { ru: "История диалогов и заявок", en: "Conversation and request history" }, values: { TRIAL: true, STARTER: true, CUSTOM: true } },
  { key: "managerReplies", group: "sales", label: { ru: "Менеджер отвечает клиенту из кабинета", en: "Manager replies from the cabinet" }, values: { TRIAL: false, STARTER: true, CUSTOM: true } },
  { key: "analytics", group: "sales", label: { ru: "Аналитика", en: "Analytics" }, values: { TRIAL: "basic", STARTER: "basic", CUSTOM: "basic" } },
  { key: "design", group: "card", label: { ru: "Цвет, имя, приветствие, сторона, тема", en: "Colour, name, greeting, side, theme" }, values: { TRIAL: true, STARTER: true, CUSTOM: true } },
  { key: "readyStyles", group: "card", label: { ru: "Аватар, быстрые вопросы, 12 готовых стилей", en: "Avatar, quick questions, 12 ready styles" }, values: { TRIAL: false, STARTER: true, CUSTOM: true } },
  { key: "visualEditor", group: "card", label: { ru: "Визуальный редактор и премиум-эффекты", en: "Visual editor and premium effects" }, values: { TRIAL: false, STARTER: false, CUSTOM: true } },
  { key: "matchDesign", group: "card", label: { ru: "ИИ подбирает дизайн под сайт", en: "AI matches the design to your site" }, values: { TRIAL: false, STARTER: false, CUSTOM: true } },
  { key: "hideBranding", group: "card", label: { ru: "Без подписи «Lemiri AI» в карточке", en: "No “Lemiri AI” label in the card" }, values: { TRIAL: false, STARTER: false, CUSTOM: true } },
];

const byKey = new Map(FEATURE_MATRIX.map(row => [row.key, row]));

/** Value of a feature for the plan the workspace has right now. */
export function planValue(access: Pick<Access, "plan" | "openAccess">, key: FeatureKey, env?: Record<string, string | undefined>): Value {
  const plan: PlanKey = access.openAccess ? "CUSTOM" : access.plan;
  if (key === "aiReplies") return messageLimit(plan, env);
  return byKey.get(key)!.values[plan];
}
export function planAllows(access: Pick<Access, "plan" | "openAccess">, key: FeatureKey) { const value = planValue(access, key); return value === true || (typeof value === "number" && value > 0) || (typeof value === "string" && value !== ""); }
export function planNumber(access: Pick<Access, "plan" | "openAccess">, key: FeatureKey, env?: Record<string, string | undefined>) { const value = planValue(access, key, env); return typeof value === "number" ? value : 0; }
/** Cheapest plan that includes a feature (for «Доступно в тарифе …» hints and 402 answers). */
export function planFor(key: FeatureKey): PlanKey { const row = byKey.get(key)!; return (["TRIAL", "STARTER", "CUSTOM"] as const).find(plan => { const value = row.values[plan]; return value === true || (typeof value === "number" && value > 0); }) ?? "CUSTOM"; }
/** 402 body the API returns when the plan does not include a feature. */
export const planRequired = (key: FeatureKey) => ({ error: "PLAN_REQUIRED", feature: key, plan: planFor(key) });
