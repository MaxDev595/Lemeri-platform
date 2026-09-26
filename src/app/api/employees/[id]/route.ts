import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { assertEmployeeActivationAllowed, BillingLimitError } from "@/lib/billing/limits";

const update = z.object({ name: z.string().min(2).max(60).optional(), status: z.enum(["DRAFT", "TRAINING", "TESTING", "ACTIVE", "PAUSED"]).optional() });

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
      return tx.aIEmployee.update({ where: { id }, data: parsed.data });
    });
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
