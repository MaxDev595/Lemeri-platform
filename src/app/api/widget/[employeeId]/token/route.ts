import { NextResponse } from "next/server";
import { createWidgetToken, WIDGET_TOKEN_TTL_MS } from "@/lib/security/widget-token";
import { loadWebsiteWidget } from "@/lib/widget/channel";
import { originAllowed } from "@/lib/widget/settings";

// Widget tokens are short-lived. The embed script calls this endpoint from the
// customer's page (a CORS request carrying its Origin) to renew the token, so a
// visitor who keeps the page open longer than the TTL can still send messages.
// The hosted chat page on Lemiri's own domain renews with a same-origin POST.
async function issue(request:Request,{params}:{params:Promise<{employeeId:string}>}){
  const {employeeId}=await params;
  let origin="";try{origin=new URL(request.headers.get("origin")??"").origin}catch{}
  const cors:Record<string,string>=origin?{"access-control-allow-origin":origin,"vary":"origin"}:{};
  const headers={...cors,"cache-control":"private, no-store"};
  if(!origin)return NextResponse.json({error:"ORIGIN_REQUIRED"},{status:400,headers});
  const widget=await loadWebsiteWidget(employeeId);
  if(!widget)return NextResponse.json({error:"WIDGET_UNAVAILABLE"},{status:404,headers});
  const own=origin===new URL(request.url).origin;
  if(own&&widget.config.widget?.hostedLink===false)return NextResponse.json({error:"HOSTED_LINK_DISABLED"},{status:403,headers});
  if(!own&&!originAllowed(widget.config.allowedOrigins,origin))return NextResponse.json({error:"ORIGIN_NOT_ALLOWED"},{status:403,headers});
  return NextResponse.json({token:createWidgetToken({employeeId,origin:widget.config.allowedOrigins.length||own?origin:"*",expiresAt:Date.now()+WIDGET_TOKEN_TTL_MS})},{headers});
}
export const GET=issue;
export const POST=issue;
