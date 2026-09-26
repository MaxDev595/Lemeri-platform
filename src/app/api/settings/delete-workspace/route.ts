import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiWorkspace } from "@/lib/auth/api";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { WORKSPACE_COOKIE } from "@/lib/auth/session";
import { verifyDirectUserPassword } from "@/lib/neon-direct";
const schema=z.object({workspaceName:z.string(),password:z.string()});
export async function POST(request:Request){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});if(auth.membership.role!=="OWNER")return NextResponse.json({error:"FORBIDDEN"},{status:403});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success||parsed.data.workspaceName!==auth.membership.workspace.name)return NextResponse.json({error:"CONFIRMATION_MISMATCH"},{status:400});// Production hashes are bcrypt (pgcrypto) and are verified in SQL; local ones use PBKDF2.
const passwordValid=process.env.NODE_ENV==="production"?Boolean((await verifyDirectUserPassword(auth.user.email,parsed.data.password))?.passwordValid):await verifyPassword(parsed.data.password,auth.user.passwordHash).catch(()=>false);if(!passwordValid)return NextResponse.json({error:"INVALID_PASSWORD"},{status:403});await db.workspace.delete({where:{id:auth.workspaceId}});(await cookies()).delete(WORKSPACE_COOKIE);return new NextResponse(null,{status:204})}
