import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});if(!canWorkspace(auth.membership.role,"TAKE_OVER_CONVERSATION"))return NextResponse.json({error:"FORBIDDEN"},{status:403});const {id}=await params;const conversation=await db.conversation.findFirst({where:{id,workspaceId:auth.workspaceId}});if(!conversation)return NextResponse.json({error:"NOT_FOUND"},{status:404});const updated=await db.conversation.update({where:{id},data:{status:"HUMAN_ACTIVE",assignedMemberId:auth.membership.id}});await db.analyticsEvent.create({data:{workspaceId:auth.workspaceId,type:"HUMAN_TAKEOVER",payload:{conversationId:id,userId:auth.user.id,memberId:auth.membership.id}}});return NextResponse.json(updated)}

// Hands a conversation back to the AI employee: it answers new customer messages
// again and any open handoff is resolved.
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(!canWorkspace(auth.membership.role,"TAKE_OVER_CONVERSATION"))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const {id}=await params;const conversation=await db.conversation.findFirst({where:{id,workspaceId:auth.workspaceId},select:{id:true,employeeId:true}});
  if(!conversation)return NextResponse.json({error:"NOT_FOUND"},{status:404});
  if(!conversation.employeeId)return NextResponse.json({error:"EMPLOYEE_UNAVAILABLE"},{status:409});
  const updated=await db.conversation.update({where:{id},data:{status:"AI_ACTIVE"}});
  await db.humanHandoff.updateMany({where:{conversationId:id,status:"OPEN"},data:{status:"RESOLVED"}});
  await db.analyticsEvent.create({data:{workspaceId:auth.workspaceId,type:"HUMAN_RELEASE",payload:{conversationId:id,userId:auth.user.id,memberId:auth.membership.id}}});
  return NextResponse.json(updated);
}
