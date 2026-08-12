import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { OnboardingForm } from "@/components/onboarding-form";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
export default async function OnboardingPage(){const {workspace}=await requireWorkspace();const [count,settings]=await Promise.all([db.aIEmployee.count({where:{workspaceId:workspace.id}}),db.workspaceSettings.findUnique({where:{workspaceId:workspace.id},select:{locale:true}})]);if(count)redirect("/app");const locale=settings?.locale==="en"?"en":"ru";return <main className="onboardingPage"><header><Logo/><span>{workspace.name}</span></header><OnboardingForm locale={locale}/></main>}
