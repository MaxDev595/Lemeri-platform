import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { guardMutation } from "@/lib/security/request";
import { runAssistant } from "@/lib/assistant/engine";
import { SECTION_IDS, type SectionId } from "@/lib/assistant/guide";

export const runtime = "nodejs";

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(40),
  page: z.string().optional(),
  locale: z.enum(["ru", "en"]).optional(),
});

// In-dashboard assistant. It reads workspace data through scoped tools and only
// *prepares* changes; the browser executes a prepared change through the normal
// API (with the user's own permissions) after the user presses "Confirm".
export async function POST(request: Request) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const guard = await guardMutation(request, "assistant", 40, 60);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status, headers: guard.retryAfter ? { "retry-after": String(guard.retryAfter) } : undefined });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId: auth.workspaceId }, select: { timezone: true } });
  const page = SECTION_IDS.includes(parsed.data.page as SectionId) ? parsed.data.page as SectionId : undefined;
  const locale = parsed.data.locale ?? auth.locale;
  try {
    const result = await runAssistant({ workspaceId: auth.workspaceId, role: auth.membership.role, locale, userName: auth.user.name ?? auth.user.email, timezone: settings?.timezone ?? "UTC" }, parsed.data.messages.slice(-16), page);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Assistant failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ASSISTANT_FAILED" }, { status: 500 });
  }
}
