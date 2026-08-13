import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isSameOrigin } from "./origin";
import { directRateLimit } from "@/lib/neon-direct";

export function requestIp(source: Headers) { return (source.get("x-forwarded-for")?.split(",")[0]??source.get("x-real-ip")??"unknown").trim(); }
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
type MemoryBucket={windowStart:number;count:number};
const rateLimitMemory=(globalThis as typeof globalThis&{__lemiriRateLimits?:Map<string,MemoryBucket>}).__lemiriRateLimits??=new Map<string,MemoryBucket>();

function checkMemoryRateLimit(scope:string,identifier:string,limit:number,windowSeconds:number){
  const now=Date.now();const windowMs=windowSeconds*1000;const windowStart=Math.floor(now/windowMs)*windowMs;const key=digest(`${scope}:${identifier}`);const existing=rateLimitMemory.get(key);const count=existing?.windowStart===windowStart?existing.count+1:1;rateLimitMemory.set(key,{windowStart,count});
  if(rateLimitMemory.size>5_000)for(const [bucketKey,bucket] of rateLimitMemory)if(bucket.windowStart+windowMs*2<now)rateLimitMemory.delete(bucketKey);
  return{allowed:count<=limit,remaining:Math.max(0,limit-count),retryAfter:Math.ceil((windowStart+windowMs-now)/1000)};
}

export function validateRequestOrigin(request: Request) {
  return isSameOrigin(request.headers.get("origin"),process.env.PUBLIC_APP_URL??request.url,process.env.NODE_ENV!=="production");
}

export async function checkRateLimit(scope:string,identifier:string,limit:number,windowSeconds:number){
  const now=Date.now();const windowMs=windowSeconds*1000;const windowStart=new Date(Math.floor(now/windowMs)*windowMs);const key=digest(`${scope}:${identifier}`);const expiresAt=new Date(windowStart.getTime()+windowMs*2);
  if(process.env.NODE_ENV==="production"){
    const count=await directRateLimit({key,windowStart,expiresAt});
    return{allowed:count<=limit,remaining:Math.max(0,limit-count),retryAfter:Math.ceil((windowStart.getTime()+windowMs-now)/1000)};
  }
  const bucket=await db.rateLimitBucket.upsert({where:{key_windowStart:{key,windowStart}},create:{key,windowStart,count:1,expiresAt},update:{count:{increment:1},expiresAt}});
  return{allowed:bucket.count<=limit,remaining:Math.max(0,limit-bucket.count),retryAfter:Math.ceil((windowStart.getTime()+windowMs-now)/1000)};
}

export async function guardMutation(request:Request,scope:string,limit=120,windowSeconds=60){
  if(!validateRequestOrigin(request))return{ok:false as const,status:403,error:"INVALID_ORIGIN",retryAfter:0};
  const result=await checkRateLimit(scope,requestIp(request.headers),limit,windowSeconds);
  return result.allowed?{ok:true as const}:{ok:false as const,status:429,error:"RATE_LIMITED",retryAfter:result.retryAfter};
}

export async function guardServerAction(scope:string,limit:number,windowSeconds:number){
  const source=await headers();const identifier=requestIp(source);
  try{return await checkRateLimit(scope,identifier,limit,windowSeconds)}catch(error){
    // A Worker isolate can still protect the auth endpoint when its persistent
    // database limiter is temporarily unreachable. Registration itself keeps
    // its separate database error boundary and never silently falls back.
    if(error instanceof Error&&"code" in error&&error.code==="ENOENT")return checkMemoryRateLimit(scope,identifier,limit,windowSeconds);
    throw error;
  }
}
