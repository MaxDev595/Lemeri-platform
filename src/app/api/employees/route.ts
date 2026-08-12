import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { employeeSchema } from "@/lib/validation/employee";

export async function GET() {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json(await db.aIEmployee.findMany({ where: { workspaceId: auth.workspaceId }, include: { settings: true }, orderBy: { createdAt: "desc" } }));
}

export async function POST(request: Request) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canWorkspace(auth.membership.role, "CONFIGURE_AI")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = employeeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  const employee = await db.aIEmployee.create({ data: { workspaceId: auth.workspaceId, name: parsed.data.name, role: parsed.data.role, status: "DRAFT", settings: { create: { goal: parsed.data.goal, tone: parsed.data.tone, handoffRules: { uncertainty: true, complaint: true, humanRequested: true } } } }, include: { settings: true } });
  return NextResponse.json(employee, { status: 201 });
}
