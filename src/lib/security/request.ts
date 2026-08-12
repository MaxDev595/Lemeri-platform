import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isSameOrigin } from "./origin";

export function requestIp(source: Headers) { return (source.get("x-forwarded-for")?.split(",")[0]??source.get("x-real-ip")??"unknown").trim(); }
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");

export function validateRequestOrigin(request: Request) {
  return isSameOrigin(request.headers.get("origin"),process.env.PUBLIC_APP_URL??request.url,process.env.NODE_ENV!=="production");
}

export async function checkRateLimit(scope:string,identifier:string,limit:number,windowSeconds:number){
  const now=Date.now();const windowMs=windowSeconds*1000;const windowStart=new Date(Math.floor(now/windowMs)*windowMs);const key=digest(`${scope}:${identifier}`);const expiresAt=new Date(windowStart.getTime()+windowMs*2);
  const bucket=await db.rateLimitBucket.upsert({where:{key_windowStart:{key,windowStart}},create:{key,windowStart,count:1,expiresAt},update:{count:{increment:1},expiresAt}});
  return{allowed:bucket.count<=limit,remaining:Math.max(0,limit-bucket.count),retryAfter:Math.ceil((windowStart.getTime()+windowMs-now)/1000)};
}

export async function guardMutation(request:Request,scope:string,limit=120,windowSeconds=60){
  if(!validateRequestOrigin(request))return{ok:false as const,status:403,error:"INVALID_ORIGIN",retryAfter:0};
  const result=await checkRateLimit(scope,requestIp(request.headers),limit,windowSeconds);
  return result.allowed?{ok:true as const}:{ok:false as const,status:429,error:"RATE_LIMITED",retryAfter:result.retryAfter};
}

export async function guardServerAction(scope:string,limit:number,windowSeconds:number){const source=await headers();return checkRateLimit(scope,requestIp(source),limit,windowSeconds)}
