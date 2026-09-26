import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { OnboardingForm } from "@/components/onboarding-form";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { getDirectOnboardingState } from "@/lib/neon-direct";
export default async function OnboardingPage(){const {workspace,user}=await requireWorkspace();const state=process.env.NODE_ENV==="production"?await getDirectOnboardingState(workspace.id):null;const [count,settings]=state?[state.employeeCount,{locale:state.locale}]:await Promise.all([db.aIEmployee.count({where:{workspaceId:workspace.id}}),db.workspaceSettings.findUnique({where:{workspaceId:workspace.id},select:{locale:true}})]);if(count)redirect("/app");const locale=settings?.locale==="en"?"en":"ru";// Members of several workspaces (e.g. after accepting an invitation) can leave
  // an unfinished workspace instead of being forced through its onboarding.
  const others=user.memberships.filter(item=>item.workspaceId!==workspace.id);
  return <main className="onboardingPage"><header><Logo/><div className="onboardingWorkspaces">{others.map(item=><a key={item.workspaceId} href={`/api/workspaces/switch?workspaceId=${encodeURIComponent(item.workspaceId)}`}>{locale==="en"?"Open":"Открыть"} {item.workspace.name}</a>)}<span>{workspace.name}</span></div></header><OnboardingForm locale={locale}/></main>}
