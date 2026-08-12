import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function aggregateUsage(workspaceId:string,date=new Date()){
  const periodStart=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1));const periodEnd=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));
  const [messages,dialogs,actions,aiUsage,documents,activeEmployees]=await Promise.all([
    db.message.count({where:{conversation:{workspaceId},createdAt:{gte:periodStart,lt:periodEnd}}}),db.conversation.count({where:{workspaceId,createdAt:{gte:periodStart,lt:periodEnd}}}),db.actionExecution.count({where:{employee:{workspaceId},createdAt:{gte:periodStart,lt:periodEnd}}}),db.analyticsEvent.count({where:{workspaceId,type:"AI_RESPONSE",createdAt:{gte:periodStart,lt:periodEnd}}}),db.$queryRaw<Array<{bytes:bigint}>>(Prisma.sql`SELECT COALESCE(SUM(octet_length(d."content")), 0)::bigint AS bytes FROM "KnowledgeDocument" d INNER JOIN "KnowledgeSource" s ON s."id" = d."sourceId" WHERE s."workspaceId" = ${workspaceId}`),db.aIEmployee.count({where:{workspaceId,status:"ACTIVE"}}),
  ]);
  const knowledgeBytes=Number(documents[0]?.bytes??0n);const values={MESSAGES:messages,CONVERSATIONS:dialogs,ACTIONS:actions,AI_USAGE:aiUsage,KNOWLEDGE_BYTES:knowledgeBytes,ACTIVE_EMPLOYEES:activeEmployees};
  for(const [metric,quantity] of Object.entries(values))await db.usageRecord.upsert({where:{workspaceId_metric_periodStart:{workspaceId,metric,periodStart}},create:{workspaceId,metric,quantity,periodStart,periodEnd},update:{quantity,periodEnd}});
  return{periodStart,periodEnd,...values};
}
