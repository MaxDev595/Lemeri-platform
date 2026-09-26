import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { entityId } from "@/lib/validation/id";
import { getSessionUser, WORKSPACE_COOKIE } from "@/lib/auth/session";

const schema=z.object({workspaceId:entityId});

export async function POST(request:Request){
  const user=await getSessionUser();
  if(!user)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"INVALID_REQUEST"},{status:400});
  if(!user.memberships.some(item=>item.workspaceId===parsed.data.workspaceId))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  (await cookies()).set(WORKSPACE_COOKIE,parsed.data.workspaceId,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:365*86400});
  return NextResponse.json({workspaceId:parsed.data.workspaceId});
}

// Navigation variant used after accepting an invitation: activates the workspace
// and opens the platform. Server Components cannot set cookies themselves.
export async function GET(request:Request){
  const url=new URL(request.url);const target=new URL("/app",url.origin);
  const user=await getSessionUser();
  if(!user)return NextResponse.redirect(new URL("/login",url.origin));
  const parsed=schema.safeParse({workspaceId:url.searchParams.get("workspaceId")});
  if(parsed.success&&user.memberships.some(item=>item.workspaceId===parsed.data.workspaceId))(await cookies()).set(WORKSPACE_COOKIE,parsed.data.workspaceId,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:365*86400});
  return NextResponse.redirect(target);
}
