import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WebsiteWidget } from "@/components/website-widget";
import { loadWebsiteWidget } from "@/lib/widget/channel";

export async function generateMetadata({params}:{params:Promise<{employeeId:string}>}):Promise<Metadata>{const {employeeId}=await params;const widget=await loadWebsiteWidget(employeeId);const look=widget?.look;return{title:look?.title||widget?.employee.name||"Lemeri AI",robots:{index:false}}}

// Embedded in a customer's site (?embedded=1) or opened directly as a hosted chat link.
export default async function WidgetPage({params,searchParams}:{params:Promise<{employeeId:string}>;searchParams:Promise<{embedded?:string;theme?:string}>}){
  const {employeeId}=await params;const query=await searchParams;
  const widget=await loadWebsiteWidget(employeeId);if(!widget)notFound();
  const look=widget.look;const embedded=query.embedded==="1";
  if(!embedded&&!look.hostedLink)notFound();
  const theme=query.theme==="dark"||query.theme==="light"||query.theme==="auto"?query.theme:look.theme;
  return <WebsiteWidget locale={widget.locale} employeeId={widget.employee.id} employeeName={widget.employee.name} company={widget.company} privacyUrl={widget.privacyUrl} embedded={embedded} theme={theme} look={look}/>;
}
