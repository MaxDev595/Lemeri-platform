import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

try {
  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: `smoke-${suffix}@lemiri.local`, name: "Runtime Smoke", passwordHash: "smoke-only" } });
    const workspace = await tx.workspace.create({ data: { name: "Runtime Smoke", slug: `runtime-smoke-${suffix}` } });
    const member = await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
    await tx.workspaceSettings.create({ data: { workspaceId: workspace.id, locale: "ru", timezone: "Asia/Qyzylorda" } });
    const employee = await tx.aIEmployee.create({ data: { workspaceId: workspace.id, assignedMemberId: member.id, name: "Анна", role: "SALES", status: "ACTIVE" } });
    await tx.aIEmployeeSettings.create({ data: { employeeId: employee.id, goal: "Квалифицировать лиды и записывать клиентов", tone: "WARM_PROFESSIONAL", handoffRules: { lowConfidence: true } } });
    const source = await tx.knowledgeSource.create({ data: { workspaceId: workspace.id, type: "TEXT", title: "Smoke knowledge", status: "READY" } });
    const document = await tx.knowledgeDocument.create({ data: { sourceId: source.id, title: "Services", content: "Консультация длится 60 минут." } });
    const chunk = await tx.knowledgeChunk.create({ data: { documentId: document.id, content: "Консультация длится 60 минут.", sourceLabel: "Services" } });
    await tx.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = '[1,0,0]'::vector WHERE id = $1`, chunk.id);
    const customer = await tx.customer.create({ data: { workspaceId: workspace.id, name: "Smoke Customer", externalId: `visitor-${suffix}` } });
    const conversation = await tx.conversation.create({ data: { workspaceId: workspace.id, assignedMemberId: member.id, employeeId: employee.id, customerId: customer.id, status: "HUMAN_ACTIVE", channelType: "WEBSITE", externalId: `conversation-${suffix}` } });
    await tx.message.createMany({ data: [
      { conversationId: conversation.id, direction: "INBOUND", content: "Хочу записаться", externalId: `in-${suffix}` },
      { conversationId: conversation.id, direction: "OUTBOUND", content: "Передаю менеджеру", externalId: `out-${suffix}` },
    ] });
    await tx.humanHandoff.create({ data: { conversationId: conversation.id, reason: "SMOKE", summary: "Нужен менеджер", status: "OPEN" } });
    await tx.lead.create({ data: { workspaceId: workspace.id, assignedMemberId: member.id, customerId: customer.id, stage: "QUALIFIED", interest: "Консультация" } });
    await tx.appointment.create({ data: { workspaceId: workspace.id, customerId: customer.id, service: "Консультация", startsAt: new Date(Date.now() + 86400000), status: "CONFIRMED" } });
    await tx.channel.create({ data: { workspaceId: workspace.id, employeeId: employee.id, type: "WEBSITE", status: "CONNECTED" } });
    await tx.analyticsEvent.create({ data: { workspaceId: workspace.id, type: "SMOKE_COMPLETED", payload: { conversationId: conversation.id } } });

    const vectorRows = await tx.$queryRawUnsafe(`SELECT id FROM "KnowledgeChunk" WHERE embedding IS NOT NULL ORDER BY embedding <=> '[1,0,0]'::vector LIMIT 1`);
    const loaded = await tx.workspace.findUnique({ where: { id: workspace.id }, include: { members: true, employees: { include: { settings: true } }, sources: { include: { documents: { include: { chunks: true } } } }, conversations: { include: { messages: true, handoffs: true } }, leads: true, appointments: true, channels: true, events: true } });
    return { userId: user.id, workspaceId: workspace.id, loaded, vectorRows };
  });

  if (!result.loaded || result.loaded.members.length !== 1 || result.loaded.employees.length !== 1 || result.loaded.conversations[0]?.messages.length !== 2 || result.loaded.leads.length !== 1 || result.loaded.appointments.length !== 1 || result.vectorRows.length !== 1) {
    throw new Error("Runtime relation assertions failed");
  }
  console.log(JSON.stringify({ ok: true, workspaceId: result.workspaceId, members: result.loaded.members.length, employees: result.loaded.employees.length, knowledgeChunks: result.loaded.sources[0].documents[0].chunks.length, messages: result.loaded.conversations[0].messages.length, handoffs: result.loaded.conversations[0].handoffs.length, leads: result.loaded.leads.length, appointments: result.loaded.appointments.length, channels: result.loaded.channels.length, analyticsEvents: result.loaded.events.length, vectorMatches: result.vectorRows.length }));
  await db.user.delete({ where: { id: result.userId } });
  await db.workspace.delete({ where: { id: result.workspaceId } });
  const residual = await db.workspace.count({ where: { id: result.workspaceId } });
  if (residual !== 0) throw new Error("Cascade cleanup failed");
  console.log(JSON.stringify({ cleanup: true }));
} finally {
  await db.$disconnect();
}
