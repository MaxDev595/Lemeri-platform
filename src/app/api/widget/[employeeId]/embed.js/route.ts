import { NextResponse, after } from "next/server";
import { createWidgetToken, WIDGET_TOKEN_TTL_MS } from "@/lib/security/widget-token";
import { floatingCardRuntime } from "@/lib/floating-card/runtime";
import { lemiriWidgetBootstrap, type WidgetBootConfig } from "@/lib/floating-card/embed-client";
import { loadWebsiteWidget, recordWidgetSeen } from "@/lib/widget/channel";
import { originAllowed } from "@/lib/widget/settings";
import { shellConfig } from "@/lib/widget/design";

const labels={
  ru:{status:"ИИ-консультант · обычно отвечает сразу",open:"Открыть чат",collapse:"Свернуть",pin:"Закрепить положение",unpin:"Открепить",maximize:"Развернуть",restore:"Вернуть размер"},
  en:{status:"AI consultant · usually replies instantly",open:"Open chat",collapse:"Collapse",pin:"Lock position",unpin:"Unlock",maximize:"Maximize",restore:"Restore size"},
} as const;

export async function GET(request:Request,{params}:{params:Promise<{employeeId:string}>}){
  let {employeeId}=await params;
  const js={"content-type":"application/javascript; charset=utf-8"};
  // Lemeri's own assistant on lemeriai.com and in the cabinet (Админка): resolved by
  // place; switched off → an empty script, so the page never shows an error.
  if(employeeId==="platform"){
    const place=new URL(request.url).searchParams.get("place")==="landing"?"landing":"app";
    const {platformAssistantFor}=await import("@/lib/platform/settings");
    const resolved=await platformAssistantFor(place);
    if(!resolved)return new NextResponse("/* Lemeri assistant is off */",{headers:{...js,"cache-control":"private, no-store"}});
    employeeId=resolved;
  }
  const widget=await loadWebsiteWidget(employeeId);
  if(!widget)return new NextResponse("/* Lemeri widget is unavailable */",{status:404,headers:js});
  const base=new URL(request.url).origin;
  let parentOrigin:string|undefined;try{const referer=request.headers.get("referer");parentOrigin=referer?new URL(referer).origin:undefined}catch{}
  // Lemeri's own pages (preview, hosted chat) may always load the widget.
  const own=parentOrigin===base;
  if(!own&&!originAllowed(widget.config.allowedOrigins,parentOrigin))return new NextResponse("/* Lemeri widget is not allowed on this origin */",{status:403,headers:js});
  if(parentOrigin&&!own&&/^https?:/.test(parentOrigin)){const channelId=widget.channelId,config=widget.config,origin=parentOrigin;after(()=>recordWidgetSeen(channelId,config,origin).catch(()=>undefined))}
  const token=createWidgetToken({employeeId,origin:parentOrigin??"*",expiresAt:Date.now()+WIDGET_TOKEN_TTL_MS});
  const frameUrl=`${base}/widget/${employeeId}`;
  // What the current plan allows (stored Custom settings stay in the config after a downgrade).
  const look=widget.look;
  const {status,...buttonLabels}=labels[widget.locale];
  const config:WidgetBootConfig={base,employeeId,frameUrl,tokenUrl:`${base}/api/widget/${employeeId}/token`,token,name:look.title||widget.employee.name,status:look.status||status,locale:widget.locale,labels:buttonLabels,theme:look.theme,position:look.position,autoOpenSeconds:look.autoOpenSeconds,shell:shellConfig(look.design),avatar:look.avatarUrl||undefined,...(look.proactive.enabled?{proactive:{messages:look.proactive.messages,delay:look.proactive.delay}}:{})};
  // Same floating-card engine as the in-app assistant, shipped as plain source.
  // The Worker bundler (esbuild keepNames) may wrap functions in __name(); give
  // the shipped source a local no-op so it runs on any customer page.
  const script=`(()=>{const __name=(fn)=>fn;(${lemiriWidgetBootstrap.toString()})(${floatingCardRuntime.toString()},${JSON.stringify(config).replace(/</g,"\\u003c")});})();`;
  return new NextResponse(script,{headers:{...js,"cache-control":"private, no-store","access-control-allow-origin":"*","vary":"referer"}});
}
