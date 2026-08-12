export type WorkspaceRole = "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";

export type WorkspaceCapability =
  | "CONFIGURE_AI"
  | "MANAGE_KNOWLEDGE"
  | "OPERATE_CRM"
  | "RUN_AI_TESTS"
  | "TAKE_OVER_CONVERSATION"
  | "MANAGE_ASSIGNMENTS";

const allowedRoles: Record<WorkspaceCapability, readonly WorkspaceRole[]> = {
  CONFIGURE_AI: ["OWNER", "ADMIN"],
  MANAGE_KNOWLEDGE: ["OWNER", "ADMIN"],
  OPERATE_CRM: ["OWNER", "ADMIN", "MANAGER"],
  RUN_AI_TESTS: ["OWNER", "ADMIN", "MANAGER"],
  TAKE_OVER_CONVERSATION: ["OWNER", "ADMIN", "MANAGER"],
  MANAGE_ASSIGNMENTS: ["OWNER", "ADMIN", "MANAGER"],
};

export function canWorkspace(role: string, capability: WorkspaceCapability) {
  return allowedRoles[capability].includes(role as WorkspaceRole);
}
