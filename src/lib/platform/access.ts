// Pure platform rules (no I/O): admin emails and the stored assistant switches.

export const ADMIN_WORKSPACE_NAME = "Lemeri AI";

/** Emails with platform admin rights (env LEMIRI_ADMIN_EMAILS). */
export function adminEmails(env: Record<string, string | undefined> = process.env) {
  return (env.LEMIRI_ADMIN_EMAILS ?? "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
}
export function isPlatformAdmin(email: string | null | undefined, env: Record<string, string | undefined> = process.env) {
  return Boolean(email) && adminEmails(env).includes(String(email).trim().toLowerCase());
}

// ------------------------------------------------------------------ settings
/** Where Lemeri's own assistant is shown. Stored in the additive PlatformSetting table. */
export type PlatformAssistant = { workspaceId: string | null; employeeId: string | null; landing: boolean; app: boolean; updatedAt: string | null };
export const DEFAULT_PLATFORM_ASSISTANT: PlatformAssistant = { workspaceId: null, employeeId: null, landing: true, app: true, updatedAt: null };
export type AssistantPlace = "landing" | "app";

export function normalizePlatformAssistant(raw: unknown, updatedAt: string | null = null): PlatformAssistant {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
  return { workspaceId: id(v.workspaceId), employeeId: id(v.employeeId), landing: typeof v.landing === "boolean" ? v.landing : true, app: typeof v.app === "boolean" ? v.app : true, updatedAt };
}
