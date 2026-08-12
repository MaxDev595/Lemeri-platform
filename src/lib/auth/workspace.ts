export function selectActiveMembership<T extends { workspaceId: string }>(memberships: T[], activeWorkspaceId?: string) {
  return memberships.find((membership) => membership.workspaceId === activeWorkspaceId) ?? memberships[0];
}
