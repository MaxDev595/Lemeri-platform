import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptCredentials } from "@/lib/security/encryption";
import { createWidgetToken, WIDGET_TOKEN_TTL_MS } from "@/lib/security/widget-token";

// Widget tokens are short-lived. The embed script calls this endpoint from the
// customer's page (a CORS request carrying its Origin) to renew the token, so a
// visitor who keeps the page open longer than the TTL can still send messages.
export async function GET(request:Request,{params}:{params:Promise<{employeeId:string}>}){
  const {employeeId}=await params;
  let origin="";try{origin=new URL(request.headers.get("origin")??"").origin}catch{}
  const cors:Record<string,string>=origin?{"access-control-allow-origin":origin,"vary":"origin"}:{};
  const headers={...cors,"cache-control":"private, no-store"};
  if(!origin)return NextResponse.json({error:"ORIGIN_REQUIRED"},{status:400,headers});
  const employee=await db.aIEmployee.findFirst({where:{id:employeeId,status:"ACTIVE"},select:{id:true,channels:{where:{type:"WEBSITE",status:"CONNECTED"},select:{configEncrypted:true},take:1}}});
  const channel=employee?.channels[0];
  if(!employee||!channel)return NextResponse.json({error:"WIDGET_UNAVAILABLE"},{status:404,headers});
  const allowedOrigins=channel.configEncrypted?decryptCredentials<{allowedOrigins:string[]}>(channel.configEncrypted).allowedOrigins:[];
  if(allowedOrigins.length&&!allowedOrigins.includes(origin))return NextResponse.json({error:"ORIGIN_NOT_ALLOWED"},{status:403,headers});
  return NextResponse.json({token:createWidgetToken({employeeId,origin:allowedOrigins.length?origin:"*",expiresAt:Date.now()+WIDGET_TOKEN_TTL_MS})},{headers});
}
