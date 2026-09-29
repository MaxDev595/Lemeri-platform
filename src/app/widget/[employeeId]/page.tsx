import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WebsiteWidget } from "@/components/website-widget";
import { loadWebsiteWidget } from "@/lib/widget/channel";

export async function generateMetadata({params}:{params:Promise<{employeeId:string}>}):Promise<Metadata>{const {employeeId}=await params;const widget=await loadWebsiteWidget(employeeId);const look=widget?.config.widget;return{title:look?.title||widget?.employee.name||"Lemiri AI",robots:{index:false}}}

// Embedded in a customer's site (?embedded=1) or opened directly as a hosted chat link.
export default async function WidgetPage({params,searchParams}:{params:Promise<{employeeId:string}>;searchParams:Promise<{embedded?:string;theme?:string}>}){
  const {employeeId}=await params;const query=await searchParams;
  const widget=await loadWebsiteWidget(employeeId);if(!widget)notFound();
  const look=widget.config.widget??{};const embedded=query.embedded==="1";
  if(!embedded&&look.hostedLink===false)notFound();
  const theme=query.theme==="dark"||query.theme==="light"||query.theme==="auto"?query.theme:look.theme??"auto";
  return <WebsiteWidget locale={widget.locale} employeeId={widget.employee.id} employeeName={widget.employee.name} embedded={embedded} theme={theme} look={{title:look.title,status:look.status,greeting:look.greeting,help:look.help,suggestions:look.suggestions,accent:look.accent}}/>;
}
