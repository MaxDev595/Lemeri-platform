import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { createTranslator } from "@/lib/i18n";
import { getPublicLocale } from "@/lib/public-locale";

export default async function AcceptInvite({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{lang?:string}>}){const {token}=await params;const locale=await getPublicLocale((await searchParams).lang);const user=await getSessionUser();if(!user){const returnTo=`/invite/${token}?lang=${locale}`;redirect(`/login?lang=${locale}&returnTo=${encodeURIComponent(returnTo)}`)}const t=createTranslator(locale);const tokenHash=createHash("sha256").update(token).digest("hex");const invitation=await db.workspaceInvitation.findUnique({where:{tokenHash}});if(!invitation||invitation.acceptedAt||invitation.expiresAt<=new Date()||invitation.email!==user.email)return <main className="simpleMessage"><h1>{t("invite.invalidTitle")}</h1><p>{t("invite.invalidCopy")}</p></main>;await db.$transaction([db.workspaceMember.upsert({where:{workspaceId_userId:{workspaceId:invitation.workspaceId,userId:user.id}},create:{workspaceId:invitation.workspaceId,userId:user.id,role:invitation.role},update:{role:invitation.role}}),db.workspaceInvitation.update({where:{id:invitation.id},data:{acceptedAt:new Date()}}),db.auditLog.create({data:{workspaceId:invitation.workspaceId,userId:user.id,actorType:"USER",action:"INVITATION_ACCEPTED",entityType:"WorkspaceInvitation",entityId:invitation.id}})]);redirect("/app")}
