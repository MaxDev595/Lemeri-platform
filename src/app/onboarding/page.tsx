import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { OnboardingForm } from "@/components/onboarding-form";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { getDirectOnboardingState } from "@/lib/neon-direct";
export default async function OnboardingPage(){const {workspace}=await requireWorkspace();const state=process.env.NODE_ENV==="production"?await getDirectOnboardingState(workspace.id):null;const [count,settings]=state?[state.employeeCount,{locale:state.locale}]:await Promise.all([db.aIEmployee.count({where:{workspaceId:workspace.id}}),db.workspaceSettings.findUnique({where:{workspaceId:workspace.id},select:{locale:true}})]);if(count)redirect("/app");const locale=settings?.locale==="en"?"en":"ru";return <main className="onboardingPage"><header><Logo/><span>{workspace.name}</span></header><OnboardingForm locale={locale}/></main>}
