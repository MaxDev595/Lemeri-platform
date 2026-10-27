import { PlatformClient as Platform } from "@/components/platform-client";
import type { Platform as PlatformType } from "@/components/platform";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { actionCatalog, ensureActionDefinitions } from "@/lib/actions/registry";
import { aggregateUsage } from "@/lib/billing/usage";
import { billingPlans } from "@/lib/billing/plans";
import { redirect } from "next/navigation";
import { createTranslator } from "@/lib/i18n";
import { getDirectAppSnapshot } from "@/lib/neon-direct";
import { drainJobsAfterResponse } from "@/lib/jobs/kick";
import { features } from "@/lib/features";
import { isPlatformAdmin, readPlatformAssistant } from "@/lib/platform/settings";

// Right after sign-up the platform's main page is the setup: launch steps on top and
// the onboarding form below (same view as /onboarding). Afterwards the dashboard keeps
// the steps until the card loads on the customer's site.
async function SetupHome(){const {default:OnboardingPage}=await import("../onboarding/page");return <OnboardingPage/>}
async function cardLive(workspaceId:string){
  try{
    const channels=await db.channel.findMany({where:{workspaceId,type:"WEBSITE"},select:{configEncrypted:true}});
    const {decryptCredentials}=await import("@/lib/security/encryption");
    return channels.some(channel=>{if(!channel.configEncrypted)return false;try{return Object.keys(decryptCredentials<{seen?:Record<string,number>}>(channel.configEncrypted).seen??{}).length>0}catch{return false}});
  }catch{return false}
}

export default async function AppPage() {
  const context=await requireWorkspace();const workspaceId=context.workspace.id;
  // Platform admin: their workspace is «Lemeri AI», set up once without onboarding (lib/platform/admin.ts).
  const isAdmin=isPlatformAdmin(context.user.email);
  if(isAdmin&&!(await readPlatformAssistant().catch(()=>null))?.employeeId){const {provisionAdminWorkspace}=await import("@/lib/platform/admin");await provisionAdminWorkspace({userId:context.user.id,workspaceId,locale:context.workspace.settings?.locale==="en"?"en":"ru"});redirect("/app")}
  // Keep queued work (knowledge indexing, CRM delivery) moving even without an external scheduler.
  drainJobsAfterResponse();
  if(process.env.NODE_ENV==="production"){
    type DirectEmployee={id:string;name:string;role:string;status:string};
    type DirectSnapshot={employees:DirectEmployee[];settings:{locale:string};subscription:{plan:string;status:string;currentPeriodEnd:string}|null;usage:Record<string,number>;stats:{dialogs:number;leads:number;appointments:number;handoffs:number};[key:string]:unknown};
    const snapshot=await getDirectAppSnapshot(workspaceId) as DirectSnapshot;
    const employee=snapshot.employees[0];if(!employee)return <SetupHome/>;
    const t=createTranslator(snapshot.settings.locale);
    const data={...snapshot,actions:actionCatalog.map(a=>({key:a.key,name:a.key==="createLead"?t("action.createLead.name"):a.key==="createAppointment"?t("action.createAppointment.name"):a.key==="notifyManager"?t("action.notifyManager.name"):a.key==="handoffToHuman"?t("action.handoffToHuman.name"):a.name,description:a.key==="createLead"?t("action.createLead.copy"):a.key==="createAppointment"?t("action.createAppointment.copy"):a.key==="notifyManager"?t("action.notifyManager.copy"):a.key==="handoffToHuman"?t("action.handoffToHuman.copy"):a.description})),billing:{subscription:snapshot.subscription??{plan:"TRIAL",status:"TRIALING",currentPeriodEnd:""},usage:snapshot.usage,plans:billingPlans}};
    return <Platform workspaceId={workspaceId} workspaces={context.user.memberships.map(item=>({id:item.workspaceId,name:item.workspace.name,role:item.role}))} workspaceName={context.workspace.name} userName={context.user.name??t("role.owner")} employee={{id:employee.id,name:employee.name,role:employee.role,status:employee.status}} stats={snapshot.stats} data={data as unknown as Parameters<typeof PlatformType>[0]["data"]} features={features()} isAdmin={isAdmin} setup={{cardLive:await cardLive(workspaceId)}}/>;
  }
  await Promise.all([ensureActionDefinitions(),db.workspaceSettings.upsert({where:{workspaceId},create:{workspaceId},update:{}})]);const usage=await aggregateUsage(workspaceId);
  const [employees,dialogs,leads,appointments,handoffs,sources,conversations,leadRows,appointmentRows,customers,channels,members,invitations,workspaceSettings,subscription,auditLogs,analyticsEvents,notifications,automations]=await Promise.all([
    db.aIEmployee.findMany({where:{workspaceId},include:{settings:true,permissions:true,assignee:{include:{user:{select:{name:true,email:true}}}}},orderBy:{createdAt:"asc"}}),
    db.conversation.count({where:{workspaceId}}),db.lead.count({where:{workspaceId}}),db.appointment.count({where:{workspaceId}}),db.humanHandoff.count({where:{conversation:{workspaceId},status:"OPEN"}}),
    db.knowledgeSource.findMany({where:{workspaceId},include:{_count:{select:{documents:true}}},orderBy:{createdAt:"desc"}}),
    db.conversation.findMany({where:{workspaceId},include:{customer:true,employee:true,assignee:{include:{user:{select:{name:true,email:true}}}},messages:{orderBy:{createdAt:"asc"}},handoffs:{where:{status:"OPEN"}}},orderBy:{updatedAt:"desc"},take:100}),
    db.lead.findMany({where:{workspaceId},include:{customer:true,assignee:{include:{user:{select:{name:true,email:true}}}}},orderBy:{createdAt:"desc"}}),db.appointment.findMany({where:{workspaceId},include:{customer:true},orderBy:{startsAt:"asc"}}),db.customer.findMany({where:{workspaceId},orderBy:{name:"asc"}}),
    db.channel.findMany({where:{workspaceId},include:{employee:{select:{name:true}}},orderBy:{createdAt:"asc"}}),db.workspaceMember.findMany({where:{workspaceId},include:{user:{select:{id:true,name:true,email:true}}}}),db.workspaceInvitation.findMany({where:{workspaceId,acceptedAt:null,expiresAt:{gt:new Date()}},select:{id:true,email:true,role:true,expiresAt:true}}),
    db.workspaceSettings.findUniqueOrThrow({where:{workspaceId}}),db.subscription.findUnique({where:{workspaceId}}),db.auditLog.findMany({where:{workspaceId},include:{user:{select:{name:true,email:true}}},orderBy:{createdAt:"desc"},take:50}),db.analyticsEvent.findMany({where:{workspaceId,createdAt:{gte:new Date(Date.now()-365*86400_000)}},orderBy:{createdAt:"asc"}}),db.notification.findMany({where:{workspaceId},orderBy:{createdAt:"desc"},take:50}),db.automation.findMany({where:{workspaceId},orderBy:{createdAt:"desc"}}),
  ]);
  const employee=employees[0];if(!employee)return <SetupHome/>;const t=createTranslator(workspaceSettings.locale);
  const data={
    workspaces:context.user.memberships.map(item=>({id:item.workspaceId,name:item.workspace.name,role:item.role})),
    employees:employees.map(e=>({id:e.id,name:e.name,role:e.role,status:e.status,goal:e.settings?.goal??"",tone:e.settings?.tone??"",assignee:e.assignee?{id:e.assignee.id,name:e.assignee.user.name??e.assignee.user.email}:null,permissions:e.permissions.map(p=>({key:p.actionKey,enabled:p.enabled}))})),
    sources:sources.map(s=>({id:s.id,title:s.title,type:s.type,status:s.status,documents:s._count.documents,createdAt:s.createdAt.toISOString()})),
    conversations:conversations.map(c=>({id:c.id,status:c.status,channel:c.channelType,customer:c.customer.name,employee:c.employee?.name??"—",createdAt:c.createdAt.toISOString(),assignee:c.assignee?{id:c.assignee.id,name:c.assignee.user.name??c.assignee.user.email}:null,messages:c.messages.map(m=>({id:m.id,direction:m.direction,content:m.content,author:m.sources&&typeof m.sources==="object"&&!Array.isArray(m.sources)?String((m.sources as Record<string,unknown>).authorType??"")||null:null,createdAt:m.createdAt.toISOString()})),handoff:c.handoffs[0]?{reason:c.handoffs[0].reason,summary:c.handoffs[0].summary}:null})),
    leads:leadRows.map(l=>{const lead=(l.customer.customFields as {leads?:Record<string,{details?:string;source?:string;consentAt?:string}>}|null)?.leads?.[l.id];return{id:l.id,stage:l.stage,interest:l.interest??"",customer:l.customer.name,phone:l.customer.phone??"",email:l.customer.email??"",details:lead?.details??"",source:lead?.source??"",consentAt:lead?.consentAt??null,createdAt:l.createdAt.toISOString(),assignee:l.assignee?{id:l.assignee.id,name:l.assignee.user.name??l.assignee.user.email}:null}}),appointments:appointmentRows.map(a=>({id:a.id,service:a.service,status:a.status,startsAt:a.startsAt.toISOString(),customer:a.customer.name,phone:a.customer.phone??""})),customers:customers.map(c=>({id:c.id,name:c.name})),channels:channels.map(c=>({id:c.id,type:c.type,status:c.status,employeeId:c.employeeId,employee:c.employee?.name??"—",lastError:c.lastError??""})),actions:actionCatalog.map(a=>({key:a.key,name:a.key==="createLead"?t("action.createLead.name"):a.key==="createAppointment"?t("action.createAppointment.name"):a.key==="notifyManager"?t("action.notifyManager.name"):a.key==="handoffToHuman"?t("action.handoffToHuman.name"):a.name,description:a.key==="createLead"?t("action.createLead.copy"):a.key==="createAppointment"?t("action.createAppointment.copy"):a.key==="notifyManager"?t("action.notifyManager.copy"):a.key==="handoffToHuman"?t("action.handoffToHuman.copy"):a.description})),
    members:members.map(m=>({id:m.id,role:m.role,user:m.user})),invitations:invitations.map(i=>({...i,expiresAt:i.expiresAt.toISOString()})),settings:{locale:workspaceSettings.locale,timezone:workspaceSettings.timezone,dataRetentionDays:workspaceSettings.dataRetentionDays,analyticsEnabled:workspaceSettings.analyticsEnabled,aiTrainingOptIn:workspaceSettings.aiTrainingOptIn,logoUrl:workspaceSettings.logoUrl??"",workingHours:(workspaceSettings.workingHours as {days:number[];start:string;end:string}|null)??{days:[1,2,3,4,5],start:"09:00",end:"18:00"}},billing:{subscription:subscription?{plan:subscription.plan,status:subscription.status,currentPeriodEnd:subscription.currentPeriodEnd.toISOString()}:{plan:"TRIAL",status:"TRIALING",currentPeriodEnd:""},usage:{messages:usage.MESSAGES,conversations:usage.CONVERSATIONS,actions:usage.ACTIONS,aiUsage:usage.AI_USAGE,knowledgeBytes:usage.KNOWLEDGE_BYTES,activeEmployees:usage.ACTIVE_EMPLOYEES},plans:billingPlans},activity:auditLogs.map(a=>({id:a.id,action:a.action,entityType:a.entityType,actor:a.user?.name??a.user?.email??a.actorType,createdAt:a.createdAt.toISOString()})),analyticsEvents:analyticsEvents.map(e=>({type:e.type,payload:e.payload as Record<string,unknown>,createdAt:e.createdAt.toISOString()})),notifications:notifications.map(n=>({id:n.id,type:n.type,title:n.title,body:n.body,readAt:n.readAt?.toISOString()??null,createdAt:n.createdAt.toISOString()})),automations:automations.map(a=>({id:a.id,name:a.name,trigger:a.trigger,enabled:a.enabled,steps:a.steps as unknown as Array<{actionKey:string;input:Record<string,unknown>}>})),
  };
  return <Platform workspaceId={context.workspace.id} workspaces={context.user.memberships.map(item=>({id:item.workspaceId,name:item.workspace.name,role:item.role}))} workspaceName={context.workspace.name} userName={context.user.name??t("role.owner")} employee={{id:employee.id,name:employee.name,role:employee.role,status:employee.status}} stats={{dialogs,leads,appointments,handoffs}} data={data} features={features()} isAdmin={isAdmin} setup={{cardLive:await cardLive(workspaceId)}}/>;
}
