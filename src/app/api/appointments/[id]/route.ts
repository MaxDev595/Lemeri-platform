import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { enqueueCrmEvent } from "@/lib/integrations/queue";
import { drainJobsAfterResponse } from "@/lib/jobs/kick";

const schema = z.object({ status: z.enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"]) });

// Confirm, complete or cancel an appointment booked by the AI employee.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canWorkspace(auth.membership.role, "OPERATE_CRM")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const { id } = await params;
  const appointment = await db.appointment.findFirst({ where: { id, workspaceId: auth.workspaceId }, include: { customer: true } });
  if (!appointment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (appointment.status === parsed.data.status) return NextResponse.json(appointment);
  const updated = await db.appointment.update({ where: { id }, data: { status: parsed.data.status } });
  await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "APPOINTMENT_STATUS_CHANGED", entityType: "Appointment", entityId: id, metadata: { from: appointment.status, to: parsed.data.status } } });
  await enqueueCrmEvent(auth.workspaceId, parsed.data.status === "CANCELLED" ? "appointment.cancelled" : "appointment.updated", { ...updated, previousStatus: appointment.status, customer: appointment.customer });
  drainJobsAfterResponse();
  return NextResponse.json(updated);
}
