import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, WORKSPACE_COOKIE } from "@/lib/auth/session";

const schema=z.object({workspaceId:z.string().cuid()});

export async function POST(request:Request){
  const user=await getSessionUser();
  if(!user)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"INVALID_REQUEST"},{status:400});
  if(!user.memberships.some(item=>item.workspaceId===parsed.data.workspaceId))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  (await cookies()).set(WORKSPACE_COOKIE,parsed.data.workspaceId,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:365*86400});
  return NextResponse.json({workspaceId:parsed.data.workspaceId});
}
