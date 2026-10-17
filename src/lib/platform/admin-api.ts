// Admin panel endpoints, served through /api/settings (?scope=platform and POST)
// so the size-limited Worker gets no new route. Only platform admins pass.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isPlatformAdmin, readPlatformAssistant, savePlatformAssistant } from "./settings";

type Auth = { user: { id: string; email: string }; workspaceId: string; locale: "ru" | "en" };

async function status(auth: Auth) {
  const settings = await readPlatformAssistant();
  const employee = settings.employeeId ? await db.aIEmployee.findUnique({ where: { id: settings.employeeId }, select: { id: true, name: true, status: true, workspaceId: true, workspace: { select: { name: true } } } }) : null;
  const channel = employee ? await db.channel.findFirst({ where: { workspaceId: employee.workspaceId, type: "WEBSITE" }, select: { status: true } }) : null;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [dialogs, leads] = employee ? await Promise.all([
    db.conversation.count({ where: { employeeId: employee.id, createdAt: { gte: since } } }),
    db.lead.count({ where: { workspaceId: employee.workspaceId, createdAt: { gte: since } } }),
  ]) : [0, 0];
  return {
    settings,
    employee: employee ? { id: employee.id, name: employee.name, status: employee.status, workspace: employee.workspace.name } : null,
    cardConnected: channel?.status === "CONNECTED",
    inThisWorkspace: Boolean(employee && employee.workspaceId === auth.workspaceId),
    stats: { dialogs, leads },
    model: { provider: process.env.AI_PROVIDER ?? "mock", configured: Boolean(process.env.OPENAI_API_KEY?.trim()), name: process.env.OPENAI_RESPONSE_MODEL || "gpt-4.1-mini" },
  };
}

export async function platformAdminGet(auth: Auth) {
  if (!isPlatformAdmin(auth.user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await status(auth), { headers: { "cache-control": "private, no-store" } });
}

export async function platformAdminPost(auth: Auth, body: unknown) {
  if (!isPlatformAdmin(auth.user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const v = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (v.action === "provision") {
    const { provisionAdminWorkspace } = await import("./admin");
    await provisionAdminWorkspace({ userId: auth.user.id, workspaceId: auth.workspaceId, locale: auth.locale });
  } else if (v.action === "assistant") {
    const patch: { landing?: boolean; app?: boolean } = {};
    if (typeof v.landing === "boolean") patch.landing = v.landing;
    if (typeof v.app === "boolean") patch.app = v.app;
    await savePlatformAssistant(patch);
  } else return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "PLATFORM_ASSISTANT_UPDATED", entityType: "Platform", entityId: "assistant", metadata: { action: String(v.action) } } });
  return NextResponse.json(await status(auth));
}
