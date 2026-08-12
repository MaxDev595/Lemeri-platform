import { db } from "@/lib/db";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { configuredAIProvider } from "./provider";
import type { AIProvider } from "./types";
import { triggerAutomations } from "@/lib/automations/engine";
import { executeAllowedAction } from "@/lib/actions/execute";
import { getWorkspaceTranslator } from "@/lib/workspace-locale";
import { employeeRoleLabel, employeeToneLabel } from "@/lib/employee-domain";

export async function handleIncomingMessage(params: { workspaceId: string; employeeId: string; conversationId: string; content: string; provider?: AIProvider }) {
  const employee = await db.aIEmployee.findFirst({ where: { id: params.employeeId, workspaceId: params.workspaceId }, include: { settings: true, permissions: { where: { enabled: true } } } });
  if (!employee?.settings) throw new Error("AI employee is not configured");
  const {locale,t}=await getWorkspaceTranslator(params.workspaceId);
  const history = await db.message.findMany({ where: { conversationId: params.conversationId }, orderBy: { createdAt: "desc" }, take: 20 });
  const knowledge = await retrieveKnowledge(params.workspaceId, params.content);
  const provider = params.provider ?? configuredAIProvider();
  const result = await provider.generateResponse({ employeeName: employee.name, role: employeeRoleLabel(employee.role,locale), goal: employee.settings.goal, tone: employeeToneLabel(employee.settings.tone,locale), instructions:employee.settings.instructions??undefined,handoffRules:employee.settings.handoffRules as Record<string,unknown>,messages: history.reverse().map(item => ({ role: item.direction === "INBOUND" ? "user" as const : "assistant" as const, content: item.content })), knowledge, allowedActionKeys: employee.permissions.map(permission=>permission.actionKey) });
  let responseText=result.text;let actionStatus:string|undefined;
  if(result.actionRequest){const russian=/[А-Яа-яЁё]/.test(result.text);try{await executeAllowedAction({workspaceId:params.workspaceId,employeeId:params.employeeId,conversationId:params.conversationId},result.actionRequest.key,result.actionRequest.input);responseText+=russian?`\n\nДействие «${result.actionRequest.key}» выполнено.`:`\n\nAction “${result.actionRequest.key}” completed.`;actionStatus="SUCCEEDED"}catch{responseText+=russian?"\n\nНе удалось выполнить действие автоматически. Я передам запрос менеджеру.":"\n\nThe action could not be completed automatically. I will hand this request to a manager.";actionStatus="FAILED"}}
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
