import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
export async function GET(){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});return NextResponse.json(await db.notification.findMany({where:{workspaceId:auth.workspaceId},orderBy:{createdAt:"desc"},take:100}))}
export async function PATCH(){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});const result=await db.notification.updateMany({where:{workspaceId:auth.workspaceId,readAt:null},data:{readAt:new Date()}});return NextResponse.json({updated:result.count})}
