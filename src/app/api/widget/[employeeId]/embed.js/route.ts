import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptCredentials } from "@/lib/security/encryption";
import { createWidgetToken } from "@/lib/security/widget-token";

export async function GET(request:Request,{params}:{params:Promise<{employeeId:string}>}){
  const {employeeId}=await params;
  const employee=await db.aIEmployee.findFirst({where:{id:employeeId,status:"ACTIVE"},select:{id:true,channels:{where:{type:"WEBSITE",status:"CONNECTED"},select:{configEncrypted:true},take:1}}});
  const channel=employee?.channels[0];
  if(!employee||!channel)return new NextResponse("/* Lemiri widget is unavailable */",{status:404,headers:{"content-type":"application/javascript; charset=utf-8"}});
  const allowedOrigins=channel.configEncrypted?decryptCredentials<{allowedOrigins:string[]}>(channel.configEncrypted).allowedOrigins:[];
  let parentOrigin:string|undefined;try{const referer=request.headers.get("referer");parentOrigin=referer?new URL(referer).origin:undefined}catch{}
  if(allowedOrigins.length&&(!parentOrigin||!allowedOrigins.includes(parentOrigin)))return new NextResponse("/* Lemiri widget is not allowed on this origin */",{status:403,headers:{"content-type":"application/javascript; charset=utf-8"}});
  const token=createWidgetToken({employeeId,origin:parentOrigin??"*",expiresAt:Date.now()+10*60_000});
  const base=new URL(request.url).origin;const frameUrl=`${base}/widget/${employeeId}`;
  const script=`(()=>{if(document.getElementById('lemiri-widget-frame'))return;const f=document.createElement('iframe');f.id='lemiri-widget-frame';f.title='Lemiri AI chat';f.src=${JSON.stringify(frameUrl)};Object.assign(f.style,{position:'fixed',right:'20px',bottom:'20px',width:'min(390px,calc(100vw - 24px))',height:'min(620px,calc(100vh - 24px))',border:'0',borderRadius:'18px',boxShadow:'0 18px 60px rgba(30,22,15,.2)',zIndex:'2147483647'});f.allow='clipboard-write';addEventListener('message',e=>{if(e.origin!==${JSON.stringify(base)}||e.source!==f.contentWindow||e.data?.type!=='lemiri:ready')return;f.contentWindow.postMessage({type:'lemiri:configure',token:${JSON.stringify(token)}},${JSON.stringify(base)})});document.body.appendChild(f)})();`;
  return new NextResponse(script,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"private, no-store","access-control-allow-origin":"*","vary":"referer"}});
}
