import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { actionCatalog, ensureActionDefinitions } from "@/lib/actions/registry";
export async function GET(){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});await ensureActionDefinitions();const employees=await db.aIEmployee.findMany({where:{workspaceId:auth.workspaceId},select:{id:true,name:true,permissions:true}});return NextResponse.json({catalog:actionCatalog.map(a=>({key:a.key,name:a.name,description:a.description})),employees})}
