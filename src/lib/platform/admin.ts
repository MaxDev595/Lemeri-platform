// Platform administration: who is a Lemeri admin, the "Lemeri AI" workspace that
// powers Lemeri's own assistant (landing page and cabinet), and its switches.
//
// Admins are listed in env LEMIRI_ADMIN_EMAILS (comma separated). The first time
// an admin opens the cabinet, their workspace is set up automatically — no
// onboarding: it is renamed «Lemeri AI», gets the Custom plan for good, an AI
// seller «Lemeri» with knowledge about the product, and a website card allowed on
// Lemeri's own domain. Everything is idempotent and only adds data.

import { db } from "@/lib/db";
import { ADMIN_WORKSPACE_NAME, readPlatformAssistant, savePlatformAssistant } from "./settings";
import { encryptCredentials } from "@/lib/security/encryption";
import { chunkText } from "@/lib/knowledge/chunk";
import { actionCatalog } from "@/lib/actions/registry";
import { LEMERI_ASSISTANT_INSTRUCTIONS, lemeriKnowledge } from "./lemeri-knowledge";

// ------------------------------------------------------------------ provisioning
const appOrigins = () => {
  const out = new Set(["https://lemeriai.com", "https://www.lemeriai.com"]);
  try { if (process.env.PUBLIC_APP_URL) out.add(new URL(process.env.PUBLIC_APP_URL).origin); } catch { /* invalid env */ }
  return [...out];
};
const FOREVER = new Date("2100-01-01T00:00:00Z");

/**
 * Sets up the admin's workspace as «Lemeri AI». Safe to call on every admin visit:
 * existing employees, knowledge and card settings are never replaced.
 */
export async function provisionAdminWorkspace(input: { userId: string; workspaceId: string; locale?: "ru" | "en" }) {
  const settings = await readPlatformAssistant();
  // One platform workspace: the first one an admin opened, unless it no longer exists.
  let workspaceId = input.workspaceId;
  if (settings.workspaceId && settings.workspaceId !== input.workspaceId) {
    const member = await db.workspaceMember.findFirst({ where: { workspaceId: settings.workspaceId, userId: input.userId }, select: { id: true } });
    if (member) workspaceId = settings.workspaceId;
  }
  await db.workspace.update({ where: { id: workspaceId }, data: { name: ADMIN_WORKSPACE_NAME } });
  // Lemeri's own workspace never runs out: Custom, active until 2100.
  const now = new Date();
  await db.subscription.upsert({ where: { workspaceId }, create: { workspaceId, provider: "platform", plan: "CUSTOM", status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: FOREVER }, update: { provider: "platform", plan: "CUSTOM", status: "ACTIVE", currentPeriodEnd: FOREVER, cancelAtPeriodEnd: false } });

  let employee = await db.aIEmployee.findFirst({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  let created = false;
  if (!employee) {
    const locale = input.locale ?? "ru";
    const knowledge = lemeriKnowledge(locale);
    const title = locale === "en" ? "About Lemeri AI" : "О Lemeri AI";
    const chunks = chunkText(knowledge).map((content, index) => ({ content, sourceLabel: `${title} · ${index + 1}` }));
    const handoffRules = { uncertainty: true, complaint: true, humanRequested: true, businessTemplate: "custom", profile: { personality: locale === "en" ? "Friendly product expert of Lemeri AI" : "Дружелюбный эксперт по продукту Lemeri AI", language: "auto", primaryGoal: "consult", goals: locale === "en" ? "Explain how Lemeri works, help choose a plan and get started" : "Объяснить, как работает Lemeri, помочь выбрать тариф и начать", restrictions: "", contactTiming: "on_request", requirePhone: false, requireEmail: true, askBudget: false, extraFields: "", handoffPresets: ["complaint", "asks_human"], handoffWhen: "", upsell: false, orderUrl: "", privacyUrl: "" } };
    const base = { workspaceId, name: "Lemeri", role: "SALES", goal: locale === "en" ? "Consult visitors about Lemeri AI and help them start" : "Консультировать посетителей о Lemeri AI и помогать начать", tone: "FRIENDLY", instructions: LEMERI_ASSISTANT_INSTRUCTIONS };
    const config = encryptCredentials({ allowedOrigins: appOrigins(), widget: { title: "Lemeri", greeting: locale === "en" ? "Hi! I'm the Lemeri assistant" : "Привет! Я ассистент Lemeri", help: locale === "en" ? "Ask about plans, setup or how the AI seller works" : "Спросите о тарифах, подключении или о том, как работает ИИ-продавец", theme: "auto" } });
    if (process.env.NODE_ENV === "production") {
      const { createDirectOnboardingEmployee, createDirectActionPermissions } = await import("@/lib/neon-direct");
      const { employeeId } = await createDirectOnboardingEmployee({ ...base, userId: input.userId, status: "ACTIVE", handoffRules, knowledgeTitle: title, knowledgeContent: knowledge, chunks, websiteConfigEncrypted: config, auditMetadata: { provisionedBy: "platform-admin" } });
      await createDirectActionPermissions({ employeeId, definitions: actionCatalog.map(action => ({ key: action.key, name: action.name, description: action.description })), enabledKeys: ["createLead", "notifyManager", "handoffToHuman"] });
      employee = { id: employeeId };
    } else {
      const { ensureActionDefinitions } = await import("@/lib/actions/registry");
      await ensureActionDefinitions();
      const definitions = await db.actionDefinition.findMany({ where: { key: { in: actionCatalog.map(item => item.key) } } });
      const row = await db.aIEmployee.create({ data: { workspaceId, name: base.name, role: base.role, status: "ACTIVE", settings: { create: { goal: base.goal, tone: base.tone, instructions: base.instructions, handoffRules } } } });
      if (definitions.length) await db.actionPermission.createMany({ data: definitions.map(definition => ({ employeeId: row.id, actionId: definition.id, actionKey: definition.key, enabled: ["createLead", "notifyManager", "handoffToHuman"].includes(definition.key) })) });
      const source = await db.knowledgeSource.create({ data: { workspaceId, type: "TEXT", title, status: "PROCESSING", documents: { create: { title, content: knowledge, chunks: { create: chunks } } } } });
      await db.channel.create({ data: { workspaceId, employeeId: row.id, type: "WEBSITE", status: "CONNECTED", externalId: "embedded-widget", configEncrypted: config } });
      const { enqueueJob } = await import("@/lib/jobs/queue");
      await enqueueJob(workspaceId, "KNOWLEDGE_INDEX", { sourceId: source.id });
      employee = { id: row.id };
    }
    created = true;
  } else {
    // An admin workspace set up by hand may lack the website card the assistant needs.
    const channel = await db.channel.findFirst({ where: { workspaceId, type: "WEBSITE" }, select: { id: true, status: true } });
    if (!channel) await db.channel.create({ data: { workspaceId, employeeId: employee.id, type: "WEBSITE", status: "CONNECTED", externalId: "embedded-widget", configEncrypted: encryptCredentials({ allowedOrigins: appOrigins() }) } });
  }
  const saved = await savePlatformAssistant({ workspaceId, employeeId: settings.employeeId && !created ? settings.employeeId : employee.id });
  return { workspaceId, employeeId: saved.employeeId, created };
}
