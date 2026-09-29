import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { decryptCredentials, encryptCredentials } from "@/lib/security/encryption";
import { parseConnectTarget, type WebsiteChannelConfig } from "@/lib/widget/settings";

// One-click install from a site builder plugin (WordPress today): the plugin
// sends the owner here, the owner picks an AI employee, and we hand the plugin
// back the embed script URL. The site is added to the allowed origins.
export async function POST(request:Request){
  const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(!["OWNER","ADMIN"].includes(auth.membership.role))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const body=await request.json().catch(()=>null) as {employeeId?:string;site?:string;returnUrl?:string;state?:string}|null;
  const target=parseConnectTarget(body?.site,body?.returnUrl);const state=String(body?.state??"").slice(0,128);
  if(!body?.employeeId||!target||!/^[A-Za-z0-9_-]{8,128}$/.test(state))return NextResponse.json({error:"INVALID_REQUEST"},{status:400});
  const employee=await db.aIEmployee.findFirst({where:{id:body.employeeId,workspaceId:auth.workspaceId},select:{id:true}});
  if(!employee)return NextResponse.json({error:"EMPLOYEE_NOT_FOUND"},{status:404});
  const existing=await db.channel.findUnique({where:{workspaceId_type:{workspaceId:auth.workspaceId,type:"WEBSITE"}},select:{configEncrypted:true}});
  let config:WebsiteChannelConfig={allowedOrigins:[]};
  if(existing?.configEncrypted){try{const value=decryptCredentials<WebsiteChannelConfig>(existing.configEncrypted);config={...value,allowedOrigins:value.allowedOrigins??[]}}catch{}}
  // An empty list means "any site"; only extend lists the owner restricted on purpose.
  if(config.allowedOrigins.length&&!config.allowedOrigins.includes(target.origin))config.allowedOrigins=[...config.allowedOrigins,target.origin].slice(0,20);
  const channel=await db.channel.upsert({where:{workspaceId_type:{workspaceId:auth.workspaceId,type:"WEBSITE"}},create:{workspaceId:auth.workspaceId,employeeId:employee.id,type:"WEBSITE",status:"CONNECTED",configEncrypted:encryptCredentials(config)},update:{employeeId:employee.id,status:"CONNECTED",lastError:null,configEncrypted:encryptCredentials(config)}});
  await db.auditLog.create({data:{workspaceId:auth.workspaceId,userId:auth.user.id,actorType:"USER",action:"CHANNEL_CONFIGURED",entityType:"Channel",entityId:channel.id,metadata:{type:"WEBSITE",via:"wordpress",site:target.origin}}});
  const base=(process.env.PUBLIC_APP_URL??new URL(request.url).origin).replace(/\/$/,"");
  target.back.searchParams.set("lemiri_embed",`${base}/api/widget/${employee.id}/embed.js`);
  target.back.searchParams.set("lemiri_state",state);
  return NextResponse.json({redirect:target.back.toString()});
}
