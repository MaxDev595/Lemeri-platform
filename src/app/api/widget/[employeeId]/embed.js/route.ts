import { NextResponse, after } from "next/server";
import { createWidgetToken, WIDGET_TOKEN_TTL_MS } from "@/lib/security/widget-token";
import { floatingCardRuntime } from "@/lib/floating-card/runtime";
import { lemiriWidgetBootstrap, type WidgetBootConfig } from "@/lib/floating-card/embed-client";
import { loadWebsiteWidget, recordWidgetSeen } from "@/lib/widget/channel";
import { originAllowed } from "@/lib/widget/settings";

const labels={
  ru:{status:"AI-сотрудник · обычно отвечает сразу",open:"Открыть чат",collapse:"Свернуть",pin:"Закрепить положение",unpin:"Открепить",maximize:"Развернуть",restore:"Вернуть размер"},
  en:{status:"AI employee · usually replies instantly",open:"Open chat",collapse:"Collapse",pin:"Lock position",unpin:"Unlock",maximize:"Maximize",restore:"Restore size"},
} as const;

export async function GET(request:Request,{params}:{params:Promise<{employeeId:string}>}){
  const {employeeId}=await params;
  const js={"content-type":"application/javascript; charset=utf-8"};
  const widget=await loadWebsiteWidget(employeeId);
  if(!widget)return new NextResponse("/* Lemiri widget is unavailable */",{status:404,headers:js});
  const base=new URL(request.url).origin;
  let parentOrigin:string|undefined;try{const referer=request.headers.get("referer");parentOrigin=referer?new URL(referer).origin:undefined}catch{}
  // Lemiri's own pages (preview, hosted chat) may always load the widget.
  const own=parentOrigin===base;
  if(!own&&!originAllowed(widget.config.allowedOrigins,parentOrigin))return new NextResponse("/* Lemiri widget is not allowed on this origin */",{status:403,headers:js});
  if(parentOrigin&&!own&&/^https?:/.test(parentOrigin)){const channelId=widget.channelId,config=widget.config,origin=parentOrigin;after(()=>recordWidgetSeen(channelId,config,origin).catch(()=>undefined))}
  const token=createWidgetToken({employeeId,origin:parentOrigin??"*",expiresAt:Date.now()+WIDGET_TOKEN_TTL_MS});
  const frameUrl=`${base}/widget/${employeeId}`;
  const look=widget.config.widget??{};
  const {status,...buttonLabels}=labels[widget.locale];
  const config:WidgetBootConfig={base,employeeId,frameUrl,tokenUrl:`${base}/api/widget/${employeeId}/token`,token,name:look.title||widget.employee.name,status:look.status||status,locale:widget.locale,labels:buttonLabels,accent:look.accent,theme:look.theme,position:look.position,autoOpenSeconds:look.autoOpenSeconds};
  // Same floating-card engine as the in-app assistant, shipped as plain source.
  // The Worker bundler (esbuild keepNames) may wrap functions in __name(); give
  // the shipped source a local no-op so it runs on any customer page.
  const script=`(()=>{const __name=(fn)=>fn;(${lemiriWidgetBootstrap.toString()})(${floatingCardRuntime.toString()},${JSON.stringify(config).replace(/</g,"\\u003c")});})();`;
  return new NextResponse(script,{headers:{...js,"cache-control":"private, no-store","access-control-allow-origin":"*","vary":"referer"}});
}
