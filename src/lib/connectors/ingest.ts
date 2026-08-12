import { db } from "@/lib/db";
import { isUniqueConstraintError } from "@/lib/db-errors";
import { assertConversationCreationAllowed, BillingLimitError, lockConversationCreation } from "@/lib/billing/limits";
import { handleIncomingMessage } from "@/lib/ai/orchestrator";
import type { ConnectorMessage } from "./types";
import { enqueueJob } from "@/lib/jobs/queue";
import { triggerAutomations } from "@/lib/automations/engine";
import { getWorkspaceTranslator } from "@/lib/workspace-locale";

export async function ingestConnectorMessage(channel:{id:string;workspaceId:string;employeeId:string|null;type:string},incoming:ConnectorMessage){
  if(!channel.employeeId)throw new Error("Channel has no assigned employee");
  const {t}=await getWorkspaceTranslator(channel.workspaceId);
  let conversation=await db.conversation.findFirst({where:{workspaceId:channel.workspaceId,channelType:channel.type,externalId:incoming.externalConversationId}});
  if(!conversation){
    try{
      conversation=await db.$transaction(async tx=>{
        await lockConversationCreation(tx,channel.workspaceId);
        const raced=await tx.conversation.findUnique({where:{workspaceId_channelType_externalId:{workspaceId:channel.workspaceId,channelType:channel.type,externalId:incoming.externalConversationId}}});
        if(raced)return raced;
        await assertConversationCreationAllowed(tx,channel.workspaceId);
        const customer=await tx.customer.upsert({where:{workspaceId_externalId:{workspaceId:channel.workspaceId,externalId:incoming.senderId}},create:{workspaceId:channel.workspaceId,externalId:incoming.senderId,name:incoming.senderName??t("server.customer",{suffix:incoming.senderId.slice(-4)})},update:incoming.senderName?{name:incoming.senderName}:{}});
        const created=await tx.conversation.create({data:{workspaceId:channel.workspaceId,employeeId:channel.employeeId,customerId:customer.id,status:"AI_ACTIVE",channelType:channel.type,externalId:incoming.externalConversationId}});
        await tx.analyticsEvent.create({data:{workspaceId:channel.workspaceId,type:"CONVERSATION_STARTED",payload:{conversationId:created.id,channelType:channel.type}}});
        return created;
      });
    }catch(error){if(error instanceof BillingLimitError)return{duplicate:false,rejected:true,error:error.code};throw error}
  }
  try{await db.message.create({data:{conversationId:conversation.id,direction:"INBOUND",content:incoming.text,externalId:`${channel.type}:${incoming.externalMessageId}`,createdAt:incoming.receivedAt}})}catch(error){if(isUniqueConstraintError(error))return{duplicate:true,conversationId:conversation.id};throw error}
  await triggerAutomations("MESSAGE_RECEIVED",{workspaceId:channel.workspaceId,employeeId:channel.employeeId,conversationId:conversation.id,data:{channelType:channel.type,text:incoming.text,senderId:incoming.senderId}});
  const state=await db.conversation.findUnique({where:{id:conversation.id},select:{status:true}});if(state?.status!=="AI_ACTIVE"){await db.notification.create({data:{workspaceId:channel.workspaceId,type:"MESSAGE",title:t("server.managerMessageTitle"),body:incoming.text.slice(0,1000)}});return{duplicate:false,conversationId:conversation.id,humanActive:true}}
  const result=await handleIncomingMessage({workspaceId:channel.workspaceId,employeeId:channel.employeeId,conversationId:conversation.id,content:incoming.text});
  if(channel.type!=="WEBSITE")await enqueueJob(channel.workspaceId,"OUTBOUND_CHANNEL_MESSAGE",{channelId:channel.id,recipientId:incoming.senderId,text:result.message.content,messageId:result.message.id});
  return{duplicate:false,conversationId:conversation.id,response:result.message.content,handoff:result.handoff};
}
