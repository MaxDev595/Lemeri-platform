import { db } from "@/lib/db";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { configuredAIProvider } from "./provider";
import type { AIProvider } from "./types";
import { triggerAutomations } from "@/lib/automations/engine";
import { executeAllowedAction } from "@/lib/actions/execute";
import { getWorkspaceTranslator } from "@/lib/workspace-locale";
import { createTranslator, type MessageKey } from "@/lib/i18n";
import { employeeRoleLabel, employeeToneLabel } from "@/lib/employee-domain";

export async function handleIncomingMessage(params: { workspaceId: string; employeeId: string; conversationId: string; content: string; provider?: AIProvider }) {
  const employee = await db.aIEmployee.findFirst({ where: { id: params.employeeId, workspaceId: params.workspaceId }, include: { settings: true, permissions: { where: { enabled: true } } } });
  if (!employee?.settings) throw new Error("AI employee is not configured");
  const {locale,t}=await getWorkspaceTranslator(params.workspaceId);
  const history = await db.message.findMany({ where: { conversationId: params.conversationId }, orderBy: { createdAt: "desc" }, take: 20 });
  const knowledge = await retrieveKnowledge(params.workspaceId, params.content);
  const provider = params.provider ?? configuredAIProvider();
  const [conversation, settings] = await Promise.all([
    db.conversation.findFirst({ where: { id: params.conversationId, workspaceId: params.workspaceId }, select: { channelType: true, customer: { select: { name: true, phone: true, email: true } } } }),
    db.workspaceSettings.findUnique({ where: { workspaceId: params.workspaceId }, select: { timezone: true, workingHours: true } }),
  ]);
  const context = businessContext(settings?.timezone ?? "Europe/Moscow", settings?.workingHours, conversation);
  let result: Awaited<ReturnType<AIProvider["generateResponse"]>>;
  try {
    result = await provider.generateResponse({ context, employeeName: employee.name, role: employeeRoleLabel(employee.role,locale), goal: employee.settings.goal, tone: employeeToneLabel(employee.settings.tone,locale), instructions:employee.settings.instructions??undefined,handoffRules:employee.settings.handoffRules as Record<string,unknown>,messages: history.reverse().map(item => ({ role: item.direction === "INBOUND" ? "user" as const : "assistant" as const, content: item.content })), knowledge, allowedActionKeys: employee.permissions.map(permission=>permission.actionKey) });
  } catch (error) {
    // A provider outage must not leave the customer without an answer: the inbound
    // message is already stored, so channel retries would be dropped as duplicates.
    console.error("AI provider failed", error instanceof Error ? error.message : error);
    result = { text: locale === "en" ? "Sorry, I can't answer right now. I've passed your message to a manager, who will reply shortly." : "Извините, сейчас не получается ответить. Я передал ваше сообщение менеджеру — он скоро ответит.", confidence: 0, usedSourceIds: [], handoffReason: `AI provider error: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}` };
  }
  let responseText=result.text;let actionStatus:string|undefined;
  if(result.actionRequest){const russian=/[А-Яа-яЁё]/.test(result.text);try{await executeAllowedAction({workspaceId:params.workspaceId,employeeId:params.employeeId,conversationId:params.conversationId},result.actionRequest.key,result.actionRequest.input);const actionName=["createLead","createAppointment","notifyManager","handoffToHuman"].includes(result.actionRequest.key)?createTranslator(russian?"ru":"en")(`action.${result.actionRequest.key}.name` as MessageKey):result.actionRequest.key;responseText+=russian?`\n\nДействие «${actionName}» выполнено.`:`\n\nAction “${actionName}” completed.`;actionStatus="SUCCEEDED"}catch(error){const code=error instanceof Error?error.message:"";if(code==="SLOT_TAKEN"||code==="OUTSIDE_WORKING_HOURS"){responseText+=russian?(code==="SLOT_TAKEN"?"\n\nК сожалению, это время уже занято. Подскажите, пожалуйста, другое удобное время.":"\n\nЭто время вне наших рабочих часов. Подскажите, пожалуйста, другое удобное время."):(code==="SLOT_TAKEN"?"\n\nSorry, that time is already booked. Please suggest another time.":"\n\nThat time is outside our working hours. Please suggest another time.");actionStatus="REJECTED"}else{responseText+=russian?"\n\nНе удалось выполнить действие автоматически. Я передам запрос менеджеру.":"\n\nThe action could not be completed automatically. I will hand this request to a manager.";actionStatus="FAILED"}}}
  const effectiveHandoffReason=result.handoffReason??(actionStatus==="FAILED"?`Action ${result.actionRequest?.key} failed`:undefined);
  const saved=await db.$transaction(async tx => {
    const message = await tx.message.create({ data: { conversationId: params.conversationId, direction: "OUTBOUND", content: responseText, sources: result.usedSourceIds } });
    if (effectiveHandoffReason) {
      await tx.humanHandoff.create({ data: { conversationId: params.conversationId, reason: effectiveHandoffReason, summary: t("server.handoffSummary",{question:params.content.slice(0,300)}), status: "OPEN" } });
      await tx.conversation.update({ where: { id: params.conversationId }, data: { status: "NEEDS_ATTENTION" } });
      await tx.notification.create({data:{workspaceId:params.workspaceId,type:"HANDOFF",title:t("server.handoffTitle"),body:`${employee.name}: ${effectiveHandoffReason}`.slice(0,1000)}});
      const question=params.content.trim().replace(/\s+/g," ").slice(0,500);
      await tx.knowledgeGap.upsert({where:{workspaceId_question:{workspaceId:params.workspaceId,question}},create:{workspaceId:params.workspaceId,question},update:{occurrences:{increment:1},lastSeenAt:new Date(),status:"OPEN"}});
      await tx.analyticsEvent.create({ data: { workspaceId: params.workspaceId, type: "HANDOFF_CREATED", payload: { conversationId: params.conversationId, reason: effectiveHandoffReason } } });
    }
    await tx.analyticsEvent.create({ data: { workspaceId: params.workspaceId, type: "AI_RESPONSE", payload: { provider: provider.name, confidence: result.confidence, citedChunks: result.usedSourceIds.length, handoff: Boolean(effectiveHandoffReason), actionKey:result.actionRequest?.key,actionStatus } } });
    return { message, confidence: result.confidence, handoff: Boolean(effectiveHandoffReason) };
  });
  await triggerAutomations(effectiveHandoffReason?"HANDOFF_CREATED":"AI_RESPONSE",{workspaceId:params.workspaceId,employeeId:params.employeeId,conversationId:params.conversationId,data:{handoff:Boolean(effectiveHandoffReason),confidence:result.confidence}});
  return saved;
}

function businessContext(timezone: string, workingHours: unknown, conversation: { channelType: string; customer: { name: string; phone: string | null; email: string | null } } | null) {
  const now = new Date();
  let local = now.toISOString();
  try { local = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, dateStyle: "short", timeStyle: "short" }).format(now) + ` (${timezone})`; } catch { /* invalid zone: keep UTC */ }
  const hours = workingHours && typeof workingHours === "object" ? workingHours as { days?: number[]; start?: string; end?: string } : null;
  const days = hours?.days?.length ? hours.days.map(day => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][day]).join(",") : "Mon-Fri";
  const customer = conversation?.customer;
  return [
    `Current date and time: ${local}.`,
    `Business working hours: ${days} ${hours?.start ?? "09:00"}-${hours?.end ?? "18:00"}; only offer appointment times inside them.`,
    conversation ? `Channel: ${conversation.channelType}.` : "",
    customer ? `Known customer data (CRM): name=${customer.name.slice(0, 80)}; phone=${customer.phone?.slice(0, 40) ?? "unknown"}; email=${customer.email?.slice(0, 120) ?? "unknown"}. Ask for missing contact details before creating a lead or appointment.` : "",
  ].filter(Boolean).join(" ");
}
