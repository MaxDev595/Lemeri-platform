import { NextResponse } from "next/server";
import { z } from "zod";
import { configuredAIProvider } from "@/lib/ai/provider";
import { getApiWorkspace } from "@/lib/auth/api";
import { chunkText } from "@/lib/knowledge/chunk";
import { onboardingConfigurationDigest, onboardingSchema } from "@/lib/onboarding/schema";
import { createOnboardingTestToken } from "@/lib/onboarding/test-attestation";
import { captureOperationalError } from "@/lib/observability/logger";
import { checkRateLimit, requestIp } from "@/lib/security/request";
import { employeeRoleLabel, employeeToneLabel } from "@/lib/employee-domain";

const requestSchema=z.object({configuration:z.record(z.unknown()),question:z.string().trim().min(2).max(1000)});
export async function POST(request:Request){
  const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const body=requestSchema.safeParse(await request.json().catch(()=>null));if(!body.success)return NextResponse.json({error:"INVALID_REQUEST"},{status:400});
  const configuration=onboardingSchema.safeParse(body.data.configuration);if(!configuration.success)return NextResponse.json({error:"INVALID_CONFIGURATION",issues:configuration.error.flatten()},{status:400});
  const limited=await checkRateLimit("onboarding:preview",`${requestIp(request.headers)}:${auth.user.id}`,10,60);if(!limited.allowed)return NextResponse.json({error:"RATE_LIMITED"},{status:429,headers:{"retry-after":String(limited.retryAfter)}});
  const knowledge=chunkText(configuration.data.knowledgeContent??"").slice(0,20).map((content,index)=>({id:`preview-${index}`,content,sourceLabel:configuration.data.knowledgeTitle||"Материал onboarding",score:1}));
  try{
    const provider=configuredAIProvider();const result=await provider.generateResponse({employeeName:configuration.data.name,role:employeeRoleLabel(configuration.data.role,auth.locale),goal:configuration.data.goal,tone:employeeToneLabel(configuration.data.tone,auth.locale),instructions:configuration.data.instructions,handoffRules:{uncertainty:configuration.data.handoffUncertainty==="on",complaint:configuration.data.handoffComplaint==="on",humanRequested:configuration.data.handoffHumanRequested==="on"},messages:[{role:"user",content:body.data.question}],knowledge,allowedActionKeys:[]});
    const token=createOnboardingTestToken(onboardingConfigurationDigest(configuration.data));
    return NextResponse.json({message:result.text,confidence:result.confidence,handoff:Boolean(result.handoffReason),handoffReason:result.handoffReason??null,testToken:token,provider:provider.name});
  }catch(error){await captureOperationalError({workspaceId:auth.workspaceId,requestId:request.headers.get("x-request-id")??undefined,category:"AI",code:"ONBOARDING_PREVIEW_FAILED",message:error instanceof Error?error.message:"AI provider unavailable"});return NextResponse.json({error:"AI_PREVIEW_FAILED"},{status:503})}
}
