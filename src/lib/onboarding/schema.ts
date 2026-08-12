import { createHash } from "node:crypto";
import { z } from "zod";
import { employeeSchema } from "@/lib/validation/employee";

const base=employeeSchema.extend({businessTemplate:z.enum(["clinic","services","retail","education","custom"]),instructions:z.string().trim().max(4000).optional(),handoffUncertainty:z.string().optional(),handoffComplaint:z.string().optional(),handoffHumanRequested:z.string().optional(),knowledgeTitle:z.string().trim().max(120).optional(),knowledgeContent:z.string().trim().max(50_000).optional(),websiteOrigin:z.union([z.string().trim().url(),z.literal("")]).optional(),crmWebhook:z.union([z.string().trim().url(),z.literal("")]).optional(),publish:z.string().optional(),testToken:z.string().max(1000).optional()});
export const onboardingSchema=base.refine(value=>!value.knowledgeContent||Boolean(value.knowledgeTitle),{path:["knowledgeTitle"],message:"Укажите название материала"});
export type OnboardingInput=z.infer<typeof onboardingSchema>;

export function onboardingConfigurationDigest(value:OnboardingInput){
  const stable={name:value.name,role:value.role,goal:value.goal,tone:value.tone,businessTemplate:value.businessTemplate,instructions:value.instructions??"",handoffUncertainty:value.handoffUncertainty==="on",handoffComplaint:value.handoffComplaint==="on",handoffHumanRequested:value.handoffHumanRequested==="on",knowledgeTitle:value.knowledgeTitle??"",knowledgeContent:value.knowledgeContent??"",websiteOrigin:value.websiteOrigin??"",crmWebhook:value.crmWebhook??""};
  return createHash("sha256").update(JSON.stringify(stable)).digest("base64url");
}
