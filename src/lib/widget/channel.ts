import { db } from "@/lib/db";
import { decryptCredentials, encryptCredentials } from "@/lib/security/encryption";
import { SEEN_THROTTLE_MS, type WebsiteChannelConfig } from "./settings";
import { resolveLook } from "./design";
import { workspaceAccess } from "@/lib/billing/access";
import { profileFromRules } from "@/lib/ai/profile";

export async function loadWebsiteWidget(employeeId: string) {
  const employee = await db.aIEmployee.findFirst({ where: { id: employeeId, status: "ACTIVE" }, select: { id: true, name: true, workspaceId: true, settings: { select: { handoffRules: true } }, workspace: { select: { name: true, settings: { select: { locale: true } } } }, channels: { where: { type: "WEBSITE", status: "CONNECTED" }, select: { id: true, configEncrypted: true }, take: 1 } } });
  const channel = employee?.channels[0];
  if (!employee || !channel) return null;
  let config: WebsiteChannelConfig = { allowedOrigins: [] };
  if (channel.configEncrypted) { try { const value = decryptCredentials<WebsiteChannelConfig>(channel.configEncrypted); config = { ...value, allowedOrigins: value.allowedOrigins ?? [] }; } catch { /* treat as empty */ } }
  // The card shows what the current plan allows; stored Custom settings stay in the config.
  const access = await workspaceAccess(employee.workspaceId);
  const profile = profileFromRules(employee.settings?.handoffRules);
  return { employee: { id: employee.id, name: employee.name }, company: employee.workspace.name, privacyUrl: profile.privacyUrl, locale: employee.workspace.settings?.locale === "en" ? "en" as const : "ru" as const, channelId: channel.id, config, look: resolveLook(config.widget, access.design), access };
}

// Remembers which sites load the widget, so the cabinet can confirm the install.
// Writes at most once per origin per throttle window.
export async function recordWidgetSeen(channelId: string, config: WebsiteChannelConfig, origin: string) {
  const now = Date.now();
  const seen = { ...(config.seen ?? {}) };
  if (seen[origin] && now - seen[origin] < SEEN_THROTTLE_MS) return;
  // Re-read right before writing so a settings save in between is not lost.
  const fresh = await db.channel.findUnique({ where: { id: channelId }, select: { configEncrypted: true } });
  if (!fresh?.configEncrypted) return;
  const current = decryptCredentials<WebsiteChannelConfig>(fresh.configEncrypted);
  const next = { ...(current.seen ?? {}), [origin]: now };
  const trimmed = Object.fromEntries(Object.entries(next).sort((a, b) => b[1] - a[1]).slice(0, 10));
  await db.channel.update({ where: { id: channelId }, data: { configEncrypted: encryptCredentials({ ...current, seen: trimmed }) } });
}
