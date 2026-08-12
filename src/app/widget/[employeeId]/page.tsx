import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { WebsiteWidget } from "@/components/website-widget";
export default async function WidgetPage({params}:{params:Promise<{employeeId:string}>}){const {employeeId}=await params;const employee=await db.aIEmployee.findFirst({where:{id:employeeId,status:"ACTIVE",channels:{some:{type:"WEBSITE",status:"CONNECTED"}}},select:{id:true,name:true,workspace:{select:{settings:{select:{locale:true}}}}}});if(!employee)notFound();const locale=employee.workspace.settings?.locale==="en"?"en":"ru";return <WebsiteWidget locale={locale} employeeId={employee.id} employeeName={employee.name}/>}
