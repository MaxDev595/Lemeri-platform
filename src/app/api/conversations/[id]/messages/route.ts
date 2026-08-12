import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

const replySchema=z.object({content:z.string().trim().min(1).max(4000)});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(!canWorkspace(auth.membership.role,"TAKE_OVER_CONVERSATION"))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const parsed=replySchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"INVALID_REQUEST"},{status:400});
  const {id}=await params;const conversation=await db.conversation.findFirst({where:{id,workspaceId:auth.workspaceId},include:{customer:true}});
  if(!conversation)return NextResponse.json({error:"NOT_FOUND"},{status:404});
  if(conversation.status!=="HUMAN_ACTIVE")return NextResponse.json({error:"TAKEOVER_REQUIRED"},{status:409});
  const channel=conversation.channelType==="WEBSITE"?null:await db.channel.findFirst({where:{workspaceId:auth.workspaceId,type:conversation.channelType,status:"CONNECTED"}});
  if(conversation.channelType!=="WEBSITE"&&(!channel?.configEncrypted||!conversation.customer.externalId))return NextResponse.json({error:"DELIVERY_CHANNEL_UNAVAILABLE"},{status:409});
  const message=await db.$transaction(async tx=>{
    const saved=await tx.message.create({data:{conversationId:id,direction:"OUTBOUND",content:parsed.data.content}});
    await tx.conversation.update({where:{id},data:{updatedAt:new Date(),assignedMemberId:auth.membership.id}});
    await tx.humanHandoff.updateMany({where:{conversationId:id,status:"OPEN"},data:{status:"RESOLVED"}});
    await tx.analyticsEvent.create({data:{workspaceId:auth.workspaceId,type:"HUMAN_RESPONSE",payload:{conversationId:id,messageId:saved.id,userId:auth.user.id}}});
    if(channel&&conversation.customer.externalId)await tx.backgroundJob.create({data:{workspaceId:auth.workspaceId,type:"OUTBOUND_CHANNEL_MESSAGE",payload:{channelId:channel.id,recipientId:conversation.customer.externalId,text:saved.content,messageId:saved.id}}});
    return saved;
  });
  return NextResponse.json({...message,createdAt:message.createdAt.toISOString()},{status:201});
}
