import { withSalesPrompt } from "@/lib/ai/prompt";
import { db } from "@/lib/db";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { configuredAIProvider } from "./provider";
import type { AIProvider } from "./types";
import { triggerAutomations } from "@/lib/automations/engine";
import { executeAllowedAction } from "@/lib/actions/execute";
import { getWorkspaceTranslator } from "@/lib/workspace-locale";
import { createTranslator, type MessageKey } from "@/lib/i18n";
import { employeeRoleLabel, employeeToneLabel } from "@/lib/employee-domain";
import { profileFromRules } from "./profile";
import { aiReplyGate } from "@/lib/billing/access";
import { featureEnabled } from "@/lib/features";
import type { SiteHint } from "@/lib/knowledge/site-live";

export async function handleIncomingMessage(params: { workspaceId: string; employeeId: string; conversationId: string; content: string; provider?: AIProvider; site?: SiteHint; siteRoot?: string | null }) {
  const employee = await db.aIEmployee.findFirst({ where: { id: params.employeeId, workspaceId: params.workspaceId }, include: { settings: true, permissions: { where: { enabled: true } } } });
  if (!employee?.settings) throw new Error("AI employee is not configured");
  const {locale,t}=await getWorkspaceTranslator(params.workspaceId);
  // Plan check before any model call: an ended trial/subscription or a used-up
  // monthly allowance must never cost model tokens.
  const gate=await aiReplyGate(params.workspaceId);
  if(!gate.ok)return limitedReply({...params,locale,employeeName:employee.name,reason:gate.reason});
  // Only this visit counts as context: a visitor returning hours later starts fresh.
  const history = await db.message.findMany({ where: { conversationId: params.conversationId, createdAt: { gte: new Date(Date.now() - 3 * 3_600_000) } }, orderBy: { createdAt: "desc" }, take: 12 });
  // Short follow-ups («а сколько стоит?») are searched together with the previous question.
  const previousQuestion = history.filter(item => item.direction === "INBOUND" && item.content !== params.content)[0]?.content ?? "";
  const query = `${params.content} ${params.content.length < 60 ? previousQuestion.slice(0, 300) : ""}`.trim();
  const retrieved = await retrieveKnowledge(params.workspaceId, query);
  // The AI studies the website itself (overview, current page, home page) — see site-live.ts.
  const { siteKnowledge } = await import("@/lib/knowledge/site-live");
  const site = await siteKnowledge({ workspaceId: params.workspaceId, query, locale: locale === "en" ? "en" : "ru", hint: params.site, fallbackRoot: params.siteRoot, retrieved }).catch(error => { console.error("Site knowledge failed", error instanceof Error ? error.message : error); return { extra: [], context: "", origin: undefined, needsOverview: false, studyQueued: false }; });
  const knowledge = [...retrieved, ...site.extra];
  // Created inside the try below: a missing or wrong key must hand off, not crash with a 500.
  let provider: AIProvider | undefined = params.provider;
  const [conversation, workspace, settings] = await Promise.all([
    db.conversation.findFirst({ where: { id: params.conversationId, workspaceId: params.workspaceId }, select: { channelType: true, customer: { select: { name: true, phone: true, email: true } } } }),
    db.workspace.findUnique({ where: { id: params.workspaceId }, select: { name: true } }),
    db.workspaceSettings.findUnique({ where: { workspaceId: params.workspaceId }, select: { timezone: true, workingHours: true } }),
  ]);
  // Lemeri's own assistant (landing page and cabinet) always knows the current contacts
  // and launch offer — its knowledge base was written once at provisioning.
  // It goes in as verified knowledge, so the model treats it like the rest of the base.
  const isLemeri = await import("@/lib/platform/settings").then(async m => { const p = await m.readPlatformAssistant(); return p.employeeId === params.employeeId || p.workspaceId === params.workspaceId; }).catch(() => false);
  if (isLemeri) knowledge.unshift({ id: "lemeri-facts", sourceLabel: locale === "en" ? "Lemeri AI — contacts and offers" : "Lemeri AI — контакты и предложения", content: (await import("@/lib/platform/contacts")).lemeriLiveFacts(locale === "en" ? "en" : "ru"), score: 1 });
  const context = [businessContext(settings?.timezone ?? "Europe/Moscow", settings?.workingHours, conversation), site.context, site.origin ? `Company website: ${site.origin}. Knowledge marked as website pages and the website overview comes from this site and counts as verified.` : ""].filter(Boolean).join(" ");
  let result: Awaited<ReturnType<AIProvider["generateResponse"]>>;
  try {
    // Deferred modules (docs/FUTURE_FEATURES.md) never reach the model as actions.
    const allowedActionKeys = employee.permissions.map(permission=>permission.actionKey).filter(key=>key!=="createAppointment"||featureEnabled("appointments"));
    provider ??= configuredAIProvider();
    result = await provider.generateResponse(withSalesPrompt({ companyName: workspace?.name, profile: profileFromRules(employee.settings.handoffRules), context, employeeName: employee.name, role: employeeRoleLabel(employee.role,locale), goal: employee.settings.goal, tone: employeeToneLabel(employee.settings.tone,locale), instructions:employee.settings.instructions??undefined,defaultLanguage:locale==="en"?"en":"ru",handoffRules:employee.settings.handoffRules as Record<string,unknown>,messages: history.reverse().map(item => ({ role: item.direction === "INBOUND" ? "user" as const : "assistant" as const, content: item.content })), knowledge, allowedActionKeys }));
  } catch (error) {
    // A provider outage must not leave the customer without an answer: the inbound
    // message is already stored, so channel retries would be dropped as duplicates.
    console.error("AI provider failed", error instanceof Error ? error.message : error);
    result = { text: locale === "en" ? "Sorry, I can't answer right now. I've passed your message to a manager, who will reply shortly." : "Извините, сейчас не получается ответить. Я передал ваше сообщение менеджеру — он скоро ответит.", confidence: 0, usedSourceIds: [], handoffReason: `AI provider error: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}` };
  }
  let responseText=result.text;let actionStatus:string|undefined;
  if(result.actionRequest){const russian=/[А-Яа-яЁё]/.test(result.text);try{await executeAllowedAction({workspaceId:params.workspaceId,employeeId:params.employeeId,conversationId:params.conversationId},result.actionRequest.key,result.actionRequest.input);const actionName=["createLead","createAppointment","notifyManager","handoffToHuman"].includes(result.actionRequest.key)?createTranslator(russian?"ru":"en")(`action.${result.actionRequest.key}.name` as MessageKey):result.actionRequest.key;void actionName;actionStatus="SUCCEEDED"}catch(error){const code=error instanceof Error?error.message:"";if(code==="SLOT_TAKEN"||code==="OUTSIDE_WORKING_HOURS"){responseText+=russian?(code==="SLOT_TAKEN"?"\n\nК сожалению, это время уже занято. Подскажите, пожалуйста, другое удобное время.":"\n\nЭто время вне наших рабочих часов. Подскажите, пожалуйста, другое удобное время."):(code==="SLOT_TAKEN"?"\n\nSorry, that time is already booked. Please suggest another time.":"\n\nThat time is outside our working hours. Please suggest another time.");actionStatus="REJECTED"}else{responseText+=russian?"\n\nНе удалось выполнить действие автоматически. Я передам запрос менеджеру.":"\n\nThe action could not be completed automatically. I will hand this request to a manager.";actionStatus="FAILED"}}}
  const effectiveHandoffReason=result.handoffReason??(actionStatus==="FAILED"?`Action ${result.actionRequest?.key} failed`:undefined);
  const saved=await db.$transaction(async tx => {
    const message = await tx.message.create({ data: { conversationId: params.conversationId, direction: "OUTBOUND", content: responseText, sources: result.usedSourceIds.filter(id => id !== "lemeri-facts") } });
    if (effectiveHandoffReason) {
      await tx.humanHandoff.create({ data: { conversationId: params.conversationId, reason: effectiveHandoffReason, summary: t("server.handoffSummary",{question:params.content.slice(0,300)}), status: "OPEN" } });
      await tx.conversation.update({ where: { id: params.conversationId }, data: { status: "NEEDS_ATTENTION" } });
      await tx.notification.create({data:{workspaceId:params.workspaceId,type:"HANDOFF",title:t("server.handoffTitle"),body:`${employee.name}: ${effectiveHandoffReason}`.slice(0,1000)}});
      const question=params.content.trim().replace(/\s+/g," ").slice(0,500);
      await tx.knowledgeGap.upsert({where:{workspaceId_question:{workspaceId:params.workspaceId,question}},create:{workspaceId:params.workspaceId,question},update:{occurrences:{increment:1},lastSeenAt:new Date(),status:"OPEN"}});
      await tx.analyticsEvent.create({ data: { workspaceId: params.workspaceId, type: "HANDOFF_CREATED", payload: { conversationId: params.conversationId, reason: effectiveHandoffReason } } });
    }
    await tx.analyticsEvent.create({ data: { workspaceId: params.workspaceId, type: "AI_RESPONSE", payload: { provider: provider?.name ?? "unconfigured", confidence: result.confidence, citedChunks: result.usedSourceIds.length, handoff: Boolean(effectiveHandoffReason), actionKey:result.actionRequest?.key,actionStatus } } });
    return { message, confidence: result.confidence, handoff: Boolean(effectiveHandoffReason), siteWork: site.needsOverview || site.studyQueued };
  });
  await triggerAutomations(effectiveHandoffReason?"HANDOFF_CREATED":"AI_RESPONSE",{workspaceId:params.workspaceId,employeeId:params.employeeId,conversationId:params.conversationId,data:{handoff:Boolean(effectiveHandoffReason),confidence:result.confidence}});
  return saved;
}

/** Reply when the plan does not allow AI answers: no model call, the visitor is asked for a contact and the owner is told once a day. */
async function limitedReply(params:{workspaceId:string;employeeId:string;conversationId:string;content:string;locale:string;employeeName:string;reason:"PLAN_INACTIVE"|"PLAN_MESSAGE_LIMIT_REACHED"}){
  const ru=params.locale!=="en";
  const text=ru?"Спасибо за сообщение! Сейчас я не могу ответить автоматически. Оставьте, пожалуйста, имя и телефон (кнопка «Оставить заявку» ниже) — менеджер свяжется с вами.":"Thanks for your message! I can't answer automatically right now. Please leave your name and phone (the “Leave a request” button below) and a manager will contact you.";
  const ownerTitle=params.reason==="PLAN_INACTIVE"?(ru?"ИИ-продавец остановлен: нет активного тарифа":"AI assistant paused: no active plan"):(ru?"ИИ-продавец остановлен: лимит сообщений исчерпан":"AI assistant paused: message limit reached");
  return db.$transaction(async tx=>{
    const message=await tx.message.create({data:{conversationId:params.conversationId,direction:"OUTBOUND",content:text,sources:[]}});
    await tx.conversation.update({where:{id:params.conversationId},data:{status:"NEEDS_ATTENTION"}});
    const recent=await tx.notification.findFirst({where:{workspaceId:params.workspaceId,type:"BILLING",createdAt:{gte:new Date(Date.now()-86400_000)}},select:{id:true}});
    if(!recent)await tx.notification.create({data:{workspaceId:params.workspaceId,type:"BILLING",title:ownerTitle,body:ru?"Посетители сайта получают просьбу оставить контакты вместо ответа ИИ. Продлите или смените тариф в разделе «Настройки и подписка».":"Visitors are asked to leave contacts instead of getting AI answers. Renew or change the plan in Settings & plan."}});
    await tx.analyticsEvent.create({data:{workspaceId:params.workspaceId,type:"AI_LIMITED",payload:{conversationId:params.conversationId,reason:params.reason}}});
    return{message,confidence:0,handoff:true};
  });
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
    customer ? `Known customer data (CRM): name=${customer.name.slice(0, 80)}; phone=${customer.phone?.slice(0, 40) ?? "unknown"}; email=${customer.email?.slice(0, 120) ?? "unknown"}. Before creating a lead or appointment you need the customer name and at least one contact (phone OR email); do not insist on email when a phone number is given.` : "",
  ].filter(Boolean).join(" ");
}
