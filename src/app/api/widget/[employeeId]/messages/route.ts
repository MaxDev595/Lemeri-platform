import { NextResponse } from "next/server";
import { z } from "zod";
import { handleIncomingMessage } from "@/lib/ai/orchestrator";
import { triggerAutomations } from "@/lib/automations/engine";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isUniqueConstraintError } from "@/lib/db-errors";
import { assertConversationCreationAllowed, BillingLimitError, lockConversationCreation } from "@/lib/billing/limits";
import { checkRateLimit, requestIp } from "@/lib/security/request";
import { verifyWidgetToken } from "@/lib/security/widget-token";
import { getWorkspaceTranslator } from "@/lib/workspace-locale";

const payloadSchema = z.object({ conversationId: z.string().cuid().optional(), visitorId: z.string().min(8).max(128), messageId: z.string().uuid(), name: z.string().trim().min(2).max(80).optional(), message: z.string().trim().min(1).max(4000) });

export async function GET(request:Request,{params}:{params:Promise<{employeeId:string}>}){
  const {employeeId}=await params;const url=new URL(request.url);const conversationId=url.searchParams.get("conversationId")??"";const visitorId=url.searchParams.get("visitorId")??"";const after=url.searchParams.get("after");
  if(!/^c[a-z0-9]{20,}$/i.test(conversationId)||visitorId.length<8||visitorId.length>128)return NextResponse.json({error:"INVALID_REQUEST"},{status:400});
  const limited=await checkRateLimit("widget:poll",`${requestIp(request.headers)}:${visitorId}`,120,60);if(!limited.allowed)return NextResponse.json({error:"RATE_LIMITED"},{status:429});
  const candidate=request.headers.get("x-lemiri-parent-origin")??"";let origin="";try{origin=new URL(candidate).origin}catch{}
  if(!origin||!verifyWidgetToken(request.headers.get("x-lemiri-widget-token")??"",employeeId,origin))return NextResponse.json({error:"WIDGET_AUTH_REQUIRED"},{status:403});
  const conversation=await db.conversation.findFirst({where:{id:conversationId,employeeId,externalId:`widget:${employeeId}:${visitorId}`},select:{id:true}});if(!conversation)return NextResponse.json({error:"NOT_FOUND"},{status:404});
  const afterDate=after&&Number.isFinite(Date.parse(after))?new Date(after):new Date(0);
  const messages=await db.message.findMany({where:{conversationId,direction:"OUTBOUND",createdAt:{gte:afterDate}},orderBy:{createdAt:"asc"},take:100,select:{id:true,content:true,createdAt:true}});
  return NextResponse.json({messages:messages.map(message=>({...message,createdAt:message.createdAt.toISOString()}))});
}

export async function POST(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const limited = await checkRateLimit("widget:message", `${requestIp(request.headers)}:${parsed.data.visitorId}`, 30, 60);
  if (!limited.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(limited.retryAfter) } });
  const { employeeId } = await params;
  const employee = await db.aIEmployee.findFirst({ where: { id: employeeId, status: "ACTIVE" } });
  if (!employee) return NextResponse.json({ error: "EMPLOYEE_UNAVAILABLE" }, { status: 404 });
  const website = await db.channel.findFirst({ where: { workspaceId: employee.workspaceId, type: "WEBSITE", status: "CONNECTED" } });
  if (!website) return NextResponse.json({ error: "CHANNEL_UNAVAILABLE" }, { status: 404 });
  if (!website.configEncrypted) return NextResponse.json({ error: "CHANNEL_CONFIGURATION_INVALID" }, { status: 503 });
  const {t}=await getWorkspaceTranslator(employee.workspaceId);

  const candidate = request.headers.get("x-lemiri-parent-origin") ?? "";
  let origin = "";
  try { origin = new URL(candidate).origin; } catch { /* Invalid origins never authenticate. */ }
  const signed = Boolean(origin && verifyWidgetToken(request.headers.get("x-lemiri-widget-token") ?? "", employeeId, origin));
  const sessionUser = signed ? null : await getSessionUser();
  const member = Boolean(sessionUser?.memberships.some((item) => item.workspaceId === employee.workspaceId));
  if (!signed && !member) return NextResponse.json({ error: "WIDGET_AUTH_REQUIRED" }, { status: 403 });

  const visitorExternalId = `widget:${employeeId}:${parsed.data.visitorId}`;
  let conversation = parsed.data.conversationId ? await db.conversation.findFirst({ where: { id: parsed.data.conversationId, workspaceId: employee.workspaceId, employeeId, externalId: visitorExternalId } }) : null;
  if (!conversation) {
    const existing = await db.conversation.findUnique({ where: { workspaceId_channelType_externalId: { workspaceId: employee.workspaceId, channelType: "WEBSITE", externalId: visitorExternalId } } });
    if (existing?.employeeId === employeeId) conversation = existing;
    else if (!existing) {
      try {
        const result = await db.$transaction(async (tx) => {
          await lockConversationCreation(tx, employee.workspaceId);
          const raced = await tx.conversation.findUnique({ where: { workspaceId_channelType_externalId: { workspaceId: employee.workspaceId, channelType: "WEBSITE", externalId: visitorExternalId } } });
          if (raced) return { conversation: raced, created: false };
          await assertConversationCreationAllowed(tx, employee.workspaceId);
          const customer = await tx.customer.upsert({ where: { workspaceId_externalId: { workspaceId: employee.workspaceId, externalId: visitorExternalId } }, create: { workspaceId: employee.workspaceId, externalId: visitorExternalId, name: parsed.data.name ?? t("server.visitor",{suffix:parsed.data.visitorId.slice(-4)}) }, update: parsed.data.name ? { name: parsed.data.name } : {} });
          const created = await tx.conversation.create({ data: { workspaceId: employee.workspaceId, employeeId, customerId: customer.id, status: "AI_ACTIVE", channelType: "WEBSITE", externalId: visitorExternalId } });
          await tx.analyticsEvent.create({ data: { workspaceId: employee.workspaceId, type: "CONVERSATION_STARTED", payload: { conversationId: created.id, channelType: "WEBSITE" } } });
          return { conversation: created, created: true };
        });
        if (result.conversation.employeeId === employeeId) conversation = result.conversation;
      } catch (error) {
        if (error instanceof BillingLimitError) return NextResponse.json({ error: error.code }, { status: 402 });
        if (!isUniqueConstraintError(error)) throw error;
        const raced = await db.conversation.findUnique({ where: { workspaceId_channelType_externalId: { workspaceId: employee.workspaceId, channelType: "WEBSITE", externalId: visitorExternalId } } });
        if (raced?.employeeId === employeeId) conversation = raced;
      }
    }
  }
  if (!conversation) return NextResponse.json({ error: "VISITOR_CONVERSATION_CONFLICT" }, { status: 409 });
  const messageExternalId = `widget:${employee.workspaceId}:${parsed.data.messageId}`;
  if (await db.message.findUnique({ where: { externalId: messageExternalId } })) return NextResponse.json({ conversationId: conversation.id, message: t("server.messageAccepted"), duplicate: true });
  try {
    await db.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", content: parsed.data.message, externalId: messageExternalId } });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return NextResponse.json({ conversationId: conversation.id, message: t("server.messageAccepted"), duplicate: true });
  }
  await triggerAutomations("MESSAGE_RECEIVED", { workspaceId: employee.workspaceId, employeeId, conversationId: conversation.id, data: { channelType: "WEBSITE", text: parsed.data.message, visitorId: parsed.data.visitorId } });
  const state = await db.conversation.findUnique({ where: { id: conversation.id }, select: { status: true } });
  if (state?.status !== "AI_ACTIVE") {
    await db.notification.create({ data: { workspaceId: employee.workspaceId, type: "MESSAGE", title: t("server.managerMessageTitle"), body: parsed.data.message.slice(0, 1000) } });
    return NextResponse.json({ conversationId: conversation.id, message: t("server.messageToManager"), confidence: 1, handoff: true });
  }
  const result = await handleIncomingMessage({ workspaceId: employee.workspaceId, employeeId, conversationId: conversation.id, content: parsed.data.message });
  return NextResponse.json({ conversationId: conversation.id, messageId:result.message.id, message: result.message.content, confidence: result.confidence, handoff: result.handoff });
}
