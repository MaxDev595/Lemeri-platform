import { cookies } from "next/headers";
import { getSessionUser, WORKSPACE_COOKIE } from "./session";
import { selectActiveMembership } from "./workspace";
export async function getApiWorkspace() {
  const user = await getSessionUser();
  if(!user)return null;
  const activeWorkspaceId=(await cookies()).get(WORKSPACE_COOKIE)?.value;
  const membership = selectActiveMembership(user.memberships,activeWorkspaceId);
  return membership ? { user, membership, workspaceId: membership.workspaceId, locale: membership.workspace.settings?.locale === "en" ? "en" as const : "ru" as const } : null;
}
