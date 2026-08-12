import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/security/origin";
const mutations=new Set(["POST","PUT","PATCH","DELETE"]);const externallyAuthenticated=["/api/webhooks/","/api/internal/jobs/","/api/widget/"];
export function proxy(request:NextRequest){const requestId=request.headers.get("x-request-id")??crypto.randomUUID();if(mutations.has(request.method)&&request.nextUrl.pathname.startsWith("/api/")&&!externallyAuthenticated.some(prefix=>request.nextUrl.pathname.startsWith(prefix))&&process.env.NODE_ENV==="production"&&!isSameOrigin(request.headers.get("origin"),process.env.PUBLIC_APP_URL??request.nextUrl.origin))return NextResponse.json({error:"INVALID_ORIGIN"},{status:403,headers:{"x-request-id":requestId}});const response=NextResponse.next();response.headers.set("x-request-id",requestId);return response}
export const config={matcher:["/api/:path*"]};
