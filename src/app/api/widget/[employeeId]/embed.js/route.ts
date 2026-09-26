import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptCredentials } from "@/lib/security/encryption";
import { createWidgetToken, WIDGET_TOKEN_TTL_MS } from "@/lib/security/widget-token";
import { floatingCardRuntime } from "@/lib/floating-card/runtime";
import { lemiriWidgetBootstrap, type WidgetBootConfig } from "@/lib/floating-card/embed-client";

const labels={
  ru:{status:"AI-сотрудник · обычно отвечает сразу",open:"Открыть чат",collapse:"Свернуть",pin:"Закрепить положение",unpin:"Открепить",maximize:"Развернуть",restore:"Вернуть размер"},
  en:{status:"AI employee · usually replies instantly",open:"Open chat",collapse:"Collapse",pin:"Lock position",unpin:"Unlock",maximize:"Maximize",restore:"Restore size"},
} as const;

export async function GET(request:Request,{params}:{params:Promise<{employeeId:string}>}){
  const {employeeId}=await params;
  const employee=await db.aIEmployee.findFirst({where:{id:employeeId,status:"ACTIVE"},select:{id:true,name:true,workspace:{select:{settings:{select:{locale:true}}}},channels:{where:{type:"WEBSITE",status:"CONNECTED"},select:{configEncrypted:true},take:1}}});
  const channel=employee?.channels[0];
  if(!employee||!channel)return new NextResponse("/* Lemiri widget is unavailable */",{status:404,headers:{"content-type":"application/javascript; charset=utf-8"}});
  const allowedOrigins=channel.configEncrypted?decryptCredentials<{allowedOrigins:string[]}>(channel.configEncrypted).allowedOrigins:[];
  let parentOrigin:string|undefined;try{const referer=request.headers.get("referer");parentOrigin=referer?new URL(referer).origin:undefined}catch{}
  if(allowedOrigins.length&&(!parentOrigin||!allowedOrigins.includes(parentOrigin)))return new NextResponse("/* Lemiri widget is not allowed on this origin */",{status:403,headers:{"content-type":"application/javascript; charset=utf-8"}});
  const token=createWidgetToken({employeeId,origin:parentOrigin??"*",expiresAt:Date.now()+WIDGET_TOKEN_TTL_MS});
  const base=new URL(request.url).origin;const frameUrl=`${base}/widget/${employeeId}`;
  const locale=employee.workspace.settings?.locale==="en"?"en":"ru";const {status,...buttonLabels}=labels[locale];
  const config:WidgetBootConfig={base,employeeId,frameUrl,tokenUrl:`${base}/api/widget/${employeeId}/token`,token,name:employee.name,status,locale,labels:buttonLabels};
  // Same floating-card engine as the in-app assistant, shipped as plain source.
  // The Worker bundler (esbuild keepNames) may wrap functions in __name(); give
  // the shipped source a local no-op so it runs on any customer page.
  const script=`(()=>{const __name=(fn)=>fn;(${lemiriWidgetBootstrap.toString()})(${floatingCardRuntime.toString()},${JSON.stringify(config).replace(/</g,"\\u003c")});})();`;
  return new NextResponse(script,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"private, no-store","access-control-allow-origin":"*","vary":"referer"}});
}
