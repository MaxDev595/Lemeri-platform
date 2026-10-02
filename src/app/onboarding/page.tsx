import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { OnboardingForm } from "@/components/onboarding-form";
import { db } from "@/lib/db";
import { getSessionUser, requireWorkspace } from "@/lib/auth/session";
import { JoinCompanyLoader } from "@/components/team/join-loader";
import { getPublicLocale } from "@/lib/public-locale";
import { getDirectOnboardingState } from "@/lib/neon-direct";
// Employee accounts without a company pick a position and join one by code.
async function employeeOnboarding(){const user=await getSessionUser();if(!user||user.memberships.length)return null;const account=await db.$queryRawUnsafe<Array<{accountType:string}>>(`SELECT "accountType" FROM "User" WHERE "id" = $1`,user.id).catch(()=>[]);if(account[0]?.accountType!=="EMPLOYEE")return null;const locale=await getPublicLocale(undefined);const ru=locale!=="en";return <main className="onboardingPage"><header><Logo/><div className="onboardingWorkspaces"><a href="/login">{ru?"Другой аккаунт":"Another account"}</a></div></header><section className="joinShell"><h1>{ru?"Добро пожаловать в команду":"Welcome to the team"}</h1><p>{ru?"Выберите свою должность и введите код компании — его даст руководитель.":"Choose your position and enter your company code — your manager has it."}</p><JoinCompanyLoader locale={locale} name={user.name??user.email} hasCompany={false}/></section></main>}
export default async function OnboardingPage(){const join=await employeeOnboarding();if(join)return join;const {workspace,user}=await requireWorkspace();const state=process.env.NODE_ENV==="production"?await getDirectOnboardingState(workspace.id):null;const [count,settings]=state?[state.employeeCount,{locale:state.locale}]:await Promise.all([db.aIEmployee.count({where:{workspaceId:workspace.id}}),db.workspaceSettings.findUnique({where:{workspaceId:workspace.id},select:{locale:true}})]);if(count)redirect("/app");const locale=settings?.locale==="en"?"en":"ru";// Members of several workspaces (e.g. after accepting an invitation) can leave
  // an unfinished workspace instead of being forced through its onboarding.
  const others=user.memberships.filter(item=>item.workspaceId!==workspace.id);
  return <main className="onboardingPage"><header><Logo/><div className="onboardingWorkspaces">{others.map(item=><a key={item.workspaceId} href={`/api/workspaces/switch?workspaceId=${encodeURIComponent(item.workspaceId)}`}>{locale==="en"?"Open":"Открыть"} {item.workspace.name}</a>)}<span>{workspace.name}</span></div></header><OnboardingForm locale={locale}/></main>}
