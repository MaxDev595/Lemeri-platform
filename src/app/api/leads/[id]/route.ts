import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { enqueueCrmEvent } from "@/lib/integrations/queue";
import { drainJobsAfterResponse } from "@/lib/jobs/kick";

const schema = z.object({ stage: z.enum(["NEW", "QUALIFIED", "WON", "LOST"]) });

// Managers move leads through the pipeline; the change is audited and sent to the connected CRM.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canWorkspace(auth.membership.role, "OPERATE_CRM")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const { id } = await params;
  const lead = await db.lead.findFirst({ where: { id, workspaceId: auth.workspaceId }, include: { customer: true } });
  if (!lead) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (lead.stage === parsed.data.stage) return NextResponse.json(lead);
  const updated = await db.lead.update({ where: { id }, data: { stage: parsed.data.stage } });
  await db.auditLog.create({ data: { workspaceId: auth.workspaceId, userId: auth.user.id, actorType: "USER", action: "LEAD_STAGE_CHANGED", entityType: "Lead", entityId: id, metadata: { from: lead.stage, to: parsed.data.stage } } });
  await enqueueCrmEvent(auth.workspaceId, "lead.updated", { ...updated, previousStage: lead.stage, customer: lead.customer });
  drainJobsAfterResponse();
  return NextResponse.json(updated);
}
