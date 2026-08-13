import { cookies, headers } from "next/headers";
import { getSessionUser, WORKSPACE_COOKIE } from "./session";
import { selectActiveMembership } from "./workspace";
import { isSameOrigin } from "@/lib/security/origin";
export async function getApiWorkspace() {
  const source=await headers();
  const origin=source.get("origin");
  if(origin&&!isSameOrigin(origin,process.env.PUBLIC_APP_URL??origin))return null;
  const user = await getSessionUser();
  if(!user)return null;
  const activeWorkspaceId=(await cookies()).get(WORKSPACE_COOKIE)?.value;
  const membership = selectActiveMembership(user.memberships,activeWorkspaceId);
  return membership ? { user, membership, workspaceId: membership.workspaceId, locale: membership.workspace.settings?.locale === "en" ? "en" as const : "ru" as const } : null;
}
