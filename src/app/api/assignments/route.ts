import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { canReceiveAssignment } from "@/lib/assignments";

const assignmentSchema=z.object({entityType:z.enum(["EMPLOYEE","CONVERSATION","LEAD"]),entityId:z.string().cuid(),memberId:z.string().cuid().nullable()});

export async function PUT(request:Request){
  const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(!canWorkspace(auth.membership.role,"MANAGE_ASSIGNMENTS"))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const parsed=assignmentSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"INVALID_REQUEST"},{status:400});
  const {entityType,entityId,memberId}=parsed.data;
  if(memberId){const member=await db.workspaceMember.findFirst({where:{id:memberId,workspaceId:auth.workspaceId}});if(!member||!canReceiveAssignment(member.role))return NextResponse.json({error:"INVALID_ASSIGNEE"},{status:400})}
  const count=await db.$transaction(async tx=>{
    const result=entityType==="EMPLOYEE"?await tx.aIEmployee.updateMany({where:{id:entityId,workspaceId:auth.workspaceId},data:{assignedMemberId:memberId}}):entityType==="CONVERSATION"?await tx.conversation.updateMany({where:{id:entityId,workspaceId:auth.workspaceId},data:{assignedMemberId:memberId}}):await tx.lead.updateMany({where:{id:entityId,workspaceId:auth.workspaceId},data:{assignedMemberId:memberId}});
    if(result.count)await tx.auditLog.create({data:{workspaceId:auth.workspaceId,userId:auth.user.id,actorType:"USER",action:memberId?"WORK_ASSIGNED":"WORK_UNASSIGNED",entityType,entityId,metadata:{memberId}}});
    return result.count;
  });
  return count?NextResponse.json({ok:true,assignedMemberId:memberId}):NextResponse.json({error:"NOT_FOUND"},{status:404});
}
