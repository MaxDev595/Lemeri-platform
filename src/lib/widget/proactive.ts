// The AI's first message as configured for the plan the workspace has now.
import { workspaceAccess } from "@/lib/billing/access";
import { decryptCredentials } from "@/lib/security/encryption";
import { resolveLook } from "./design";
import type { WebsiteChannelConfig } from "./settings";

export async function proactiveForChannel(workspaceId: string, configEncrypted: string) {
  const config = decryptCredentials<WebsiteChannelConfig>(configEncrypted);
  const access = await workspaceAccess(workspaceId);
  const proactive = resolveLook(config.widget, access.design).proactive;
  return proactive.enabled ? proactive.messages : [];
}
