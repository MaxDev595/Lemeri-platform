import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
export async function GET(){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});return NextResponse.json(await db.conversation.findMany({where:{workspaceId:auth.workspaceId},include:{customer:true,employee:true,messages:{orderBy:{createdAt:"desc"},take:1},handoffs:{where:{status:"OPEN"}}},orderBy:{updatedAt:"desc"},take:100}))}
