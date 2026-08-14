"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionCatalog, ensureActionDefinitions } from "@/lib/actions/registry";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";
import { chunkText } from "@/lib/knowledge/chunk";
import { onboardingConfigurationDigest, onboardingSchema } from "@/lib/onboarding/schema";
import { verifyOnboardingTestToken } from "@/lib/onboarding/test-attestation";
import { encryptCredentials } from "@/lib/security/encryption";
import { employeeSchema } from "@/lib/validation/employee";
import { createTranslator } from "@/lib/i18n";
import { assertEmployeeActivationAllowed, BillingLimitError } from "@/lib/billing/limits";

export type EmployeeState = { error?: string };
export async function createEmployee(_: EmployeeState, formData: FormData): Promise<EmployeeState> {
  const raw=Object.fromEntries(formData);const t=createTranslator(raw.locale==="en"?"en":"ru");const extended=raw.businessTemplate!==undefined;
  const parsed=(extended?onboardingSchema:employeeSchema).safeParse(raw);
  if(!parsed.success)return{error:t(extended?"auth.checkData":"employees.invalid")};
  const {workspace,user}=await requireWorkspace();
  if(process.env.NODE_ENV!=="production")await ensureActionDefinitions();
  const definitions=await db.actionDefinition.findMany({where:{key:{in:actionCatalog.map(item=>item.key)}}});
  const details=extended?onboardingSchema.parse(raw):null;
  if(details?.publish==="on"&&!verifyOnboardingTestToken(details.testToken,onboardingConfigurationDigest(details)))return{error:t("onboarding.testRequired")};
  let result:{sourceId?:string};
  const persistEmployee=async(tx:Parameters<Parameters<typeof db.$transaction>[0]>[0])=>{
    if(details?.publish==="on"&&process.env.NODE_ENV!=="production")await assertEmployeeActivationAllowed(tx,workspace.id);
    const employee=await tx.aIEmployee.create({data:{workspaceId:workspace.id,name:parsed.data.name,role:parsed.data.role,status:details?.publish==="on"?"ACTIVE":"DRAFT",settings:{create:{goal:parsed.data.goal,tone:parsed.data.tone,instructions:details?.instructions||null,handoffRules:{uncertainty:details?details.handoffUncertainty==="on":true,complaint:details?details.handoffComplaint==="on":true,humanRequested:details?details.handoffHumanRequested==="on":true,businessTemplate:details?.businessTemplate??"custom"}}}}});
    const enabled=parsed.data.role==="SUPPORT"?["notifyManager","handoffToHuman"]:["createLead","createAppointment","notifyManager","handoffToHuman"];
    if(definitions.length)await tx.actionPermission.createMany({data:definitions.map(definition=>({employeeId:employee.id,actionId:definition.id,actionKey:definition.key,enabled:enabled.includes(definition.key)}))});
    let sourceId:string|undefined;
    if(details?.knowledgeContent){const source=await tx.knowledgeSource.create({data:{workspaceId:workspace.id,type:"TEXT",title:details.knowledgeTitle!,status:"PROCESSING",documents:{create:{title:details.knowledgeTitle!,content:details.knowledgeContent,chunks:{create:chunkText(details.knowledgeContent).map((content,index)=>({content,sourceLabel:`${details.knowledgeTitle} · ${t("knowledge.fragment",{index:index+1})}`}))}}}}});sourceId=source.id}
    if(details?.websiteOrigin){const origin=new URL(details.websiteOrigin).origin;await tx.channel.create({data:{workspaceId:workspace.id,employeeId:employee.id,type:"WEBSITE",status:"CONNECTED",externalId:"embedded-widget",configEncrypted:encryptCredentials({allowedOrigins:[origin]})}})}
    if(details?.crmWebhook)await tx.integration.create({data:{workspaceId:workspace.id,provider:"CRM_WEBHOOK",status:"CONNECTED",credentialsEncrypted:encryptCredentials({webhookUrl:details.crmWebhook})}});
    await tx.auditLog.create({data:{workspaceId:workspace.id,userId:user.id,actorType:"USER",action:details?.publish==="on"?"AI_EMPLOYEE_PUBLISHED":"AI_EMPLOYEE_CREATED",entityType:"AIEmployee",entityId:employee.id,metadata:{role:parsed.data.role,businessTemplate:details?.businessTemplate??"custom",websiteConnected:Boolean(details?.websiteOrigin),crmConnected:Boolean(details?.crmWebhook),knowledgeAdded:Boolean(sourceId)}}});return{employee,sourceId};
  };
  try {
    // PrismaNeonHTTP is the supported stateless transport inside Workers. An
    // interactive Prisma transaction requires a stateful connection and fails
    // in the deployed Worker, so production persists through the HTTP client.
    result=process.env.NODE_ENV==="production"?await persistEmployee(db):await db.$transaction(persistEmployee);
  } catch(error) { if(error instanceof BillingLimitError)return{error:t("billing.employeeLimitReached")};throw error }
  if(result.sourceId)await enqueueJob(workspace.id,"KNOWLEDGE_INDEX",{sourceId:result.sourceId});
  revalidatePath("/app");redirect("/app");
}
