import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiWorkspace } from "@/lib/auth/api";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
const schema=z.object({workspaceName:z.string(),password:z.string()});
export async function POST(request:Request){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});if(auth.membership.role!=="OWNER")return NextResponse.json({error:"FORBIDDEN"},{status:403});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success||parsed.data.workspaceName!==auth.membership.workspace.name)return NextResponse.json({error:"CONFIRMATION_MISMATCH"},{status:400});if(!await verifyPassword(parsed.data.password,auth.user.passwordHash))return NextResponse.json({error:"INVALID_PASSWORD"},{status:403});await db.workspace.delete({where:{id:auth.workspaceId}});return new NextResponse(null,{status:204})}
