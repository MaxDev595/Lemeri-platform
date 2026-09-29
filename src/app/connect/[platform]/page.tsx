import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ConnectSite } from "@/components/site-install/connect-site";
import { getSessionUser, WORKSPACE_COOKIE } from "@/lib/auth/session";
import { selectActiveMembership } from "@/lib/auth/workspace";
import { db } from "@/lib/db";
import { parseConnectTarget } from "@/lib/widget/settings";

export const metadata:Metadata={title:"Lemiri AI — подключение сайта",robots:{index:false}};
const platforms={wordpress:"WordPress"} as const;

// Landing point of the "Подключить к Lemiri" button in a site-builder plugin.
export default async function ConnectPage({params,searchParams}:{params:Promise<{platform:string}>;searchParams:Promise<{site?:string;return?:string;state?:string}>}){
  const {platform}=await params;const query=await searchParams;
  const label=platforms[platform as keyof typeof platforms];if(!label)notFound();
  const here=`/connect/${platform}?${new URLSearchParams(Object.entries(query).filter((e):e is [string,string]=>typeof e[1]==="string")).toString()}`;
  const user=await getSessionUser();if(!user)redirect(`/login?returnTo=${encodeURIComponent(here)}`);
  const membership=selectActiveMembership(user.memberships,(await cookies()).get(WORKSPACE_COOKIE)?.value);
  const locale=membership?.workspace.settings?.locale==="en"?"en":"ru";const ru=locale==="ru";
  const target=parseConnectTarget(query.site,query.return);const validState=/^[A-Za-z0-9_-]{8,128}$/.test(query.state??"");
  const employees=membership?await db.aIEmployee.findMany({where:{workspaceId:membership.workspaceId},select:{id:true,name:true,role:true},orderBy:{createdAt:"asc"}}):[];
  const canManage=membership?["OWNER","ADMIN"].includes(membership.role):false;
  const problem=!target||!validState?(ru?"Ссылка подключения повреждена. Нажмите «Подключить к Lemiri» в плагине ещё раз.":"The connect link is broken. Press “Connect to Lemiri” in the plugin again."):!canManage?(ru?"Подключать сайты может владелец или администратор компании.":"Only the workspace owner or an admin can connect sites."):!employees.length?(ru?"Сначала создайте ИИ-сотрудника в кабинете Lemiri.":"Create an AI employee in Lemiri first."):"";
  return <AuthShell compact locale={locale} path={here} title={ru?`Подключение ${label}`:`Connect ${label}`} copy={target?(ru?`Сайт ${target.origin} получит чат с ИИ-сотрудником. Код вставлять не нужно — плагин всё сделает сам.`:`${target.origin} will get the AI employee chat. No code needed — the plugin does it for you.`):""} footer={<a href="/app">{ru?"Открыть кабинет":"Open workspace"}</a>}>
    <ConnectSite locale={locale} employees={employees} problem={problem} site={query.site??""} returnUrl={query.return??""} state={query.state??""} workspace={membership?.workspace.name??""}/>
  </AuthShell>;
}
