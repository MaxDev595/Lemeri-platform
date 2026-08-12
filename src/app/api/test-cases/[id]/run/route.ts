import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { configuredAIProvider } from "@/lib/ai/provider";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canWorkspace(auth.membership.role, "RUN_AI_TESTS")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const item = await db.aITestCase.findFirst({ where: { id, workspaceId: auth.workspaceId }, include: { employee: { include: { settings: true } } } });
  if (!item?.employee.settings) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const knowledge = await retrieveKnowledge(auth.workspaceId, item.customerMessage);
  const result = await configuredAIProvider().generateResponse({ employeeName: item.employee.name, role: item.employee.role, goal: item.employee.settings.goal, tone: item.employee.settings.tone, messages: [{ role: "user", content: item.customerMessage }], knowledge });
  const passed = (!item.expectedContains || result.text.toLocaleLowerCase().includes(item.expectedContains.toLocaleLowerCase())) && (item.expectedHandoff == null || Boolean(result.handoffReason) === item.expectedHandoff);
  const status = passed ? "PASSED" : "FAILED";
  await db.aITestCase.update({ where: { id: item.id }, data: { lastStatus: status, lastResponse: result.text, lastConfidence: result.confidence, lastRunAt: new Date() } });
  await db.analyticsEvent.create({ data: { workspaceId: auth.workspaceId, type: "AI_TEST_RUN", payload: { testCaseId: item.id, status, confidence: result.confidence } } });
  return NextResponse.json({ status, response: result.text, confidence: result.confidence, handoff: Boolean(result.handoffReason), citations: result.usedSourceIds });
}
