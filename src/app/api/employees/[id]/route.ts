import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { assertEmployeeActivationAllowed, BillingLimitError } from "@/lib/billing/limits";
import { normalizeProfile, profileFromRules, rulesWithProfile } from "@/lib/ai/profile";
import type { Prisma } from "@/generated/prisma/client";

const update = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  status: z.enum(["DRAFT", "TRAINING", "TESTING", "ACTIVE", "PAUSED"]).optional(),
  role: z.enum(["ADMINISTRATOR", "SALES", "SUPPORT"]).optional(),
  goal: z.string().trim().min(10).max(500).optional(),
  tone: z.enum(["WARM_PROFESSIONAL", "CONCISE_BUSINESS", "FRIENDLY"]).optional(),
  instructions: z.string().trim().max(4000).optional(),
  profile: z.unknown().optional(),
});

/** Everything the «AI employee» screen edits. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const employee = await db.aIEmployee.findFirst({ where: { id, workspaceId: auth.workspaceId }, include: { settings: true, permissions: { select: { actionKey: true, enabled: true } } } });
  if (!employee) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ id: employee.id, name: employee.name, role: employee.role, status: employee.status, goal: employee.settings?.goal ?? "", tone: employee.settings?.tone ?? "WARM_PROFESSIONAL", instructions: employee.settings?.instructions ?? "", profile: profileFromRules(employee.settings?.handoffRules), permissions: employee.permissions }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canWorkspace(auth.membership.role, "CONFIGURE_AI")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = update.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const { id } = await params;
  const found = await db.aIEmployee.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!found) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const employee = await db.$transaction(async (tx) => {
      if (parsed.data.status === "ACTIVE" && found.status !== "ACTIVE") await assertEmployeeActivationAllowed(tx, auth.workspaceId);
      const { goal, tone, instructions, profile, ...fields } = parsed.data;
      if (goal !== undefined || tone !== undefined || instructions !== undefined || profile !== undefined) {
        const current = await tx.aIEmployeeSettings.findUnique({ where: { employeeId: id } });
        const handoffRules = profile !== undefined ? rulesWithProfile(current?.handoffRules, normalizeProfile(profile)) : current?.handoffRules ?? { uncertainty: true, complaint: true, humanRequested: true };
        await tx.aIEmployeeSettings.upsert({ where: { employeeId: id }, create: { employeeId: id, goal: goal ?? "Консультировать посетителей сайта и собирать заявки", tone: tone ?? "WARM_PROFESSIONAL", instructions: instructions ?? null, handoffRules: handoffRules as Prisma.InputJsonValue }, update: { ...(goal !== undefined ? { goal } : {}), ...(tone !== undefined ? { tone } : {}), ...(instructions !== undefined ? { instructions: instructions || null } : {}), ...(profile !== undefined ? { handoffRules: handoffRules as Prisma.InputJsonValue } : {}) } });
      }
      return tx.aIEmployee.update({ where: { id }, data: fields });
    });
    if (parsed.data.profile !== undefined || parsed.data.goal !== undefined || parsed.data.instructions !== undefined) await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "AI_EMPLOYEE_UPDATED", entityType: "AIEmployee", entityId: id, metadata: { fields: Object.keys(parsed.data) } } });
    if (parsed.data.status && parsed.data.status !== found.status) await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "EMPLOYEE_STATUS_CHANGED", entityType: "AIEmployee", entityId: id, metadata: { from: found.status, to: parsed.data.status } } });
    return NextResponse.json(employee);
  } catch (error) {
    if (error instanceof BillingLimitError) return NextResponse.json({ error: error.code }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canWorkspace(auth.membership.role, "CONFIGURE_AI")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  // The platform is built around at least one employee; deleting the last one
  // would send the workspace back to onboarding and orphan its channels.
  if ((await db.aIEmployee.count({ where: { workspaceId: auth.workspaceId } })) <= 1) return NextResponse.json({ error: "LAST_EMPLOYEE" }, { status: 409 });
  const result = await db.aIEmployee.deleteMany({ where: { id, workspaceId: auth.workspaceId } });
  if (result.count) await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "AI_EMPLOYEE_DELETED", entityType: "AIEmployee", entityId: id } });
  return result.count ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}
