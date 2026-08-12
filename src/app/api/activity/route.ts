import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
export async function GET(){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});return NextResponse.json(await db.auditLog.findMany({where:{workspaceId:auth.workspaceId},include:{user:{select:{name:true,email:true}}},orderBy:{createdAt:"desc"},take:200}))}
