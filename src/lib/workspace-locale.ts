import { db } from "@/lib/db";
import { createTranslator, type Locale } from "@/lib/i18n";

export async function getWorkspaceLocale(workspaceId:string):Promise<Locale>{
  const settings=await db.workspaceSettings.findUnique({where:{workspaceId},select:{locale:true}});
  return settings?.locale==="en"?"en":"ru";
}

export async function getWorkspaceTranslator(workspaceId:string){
  const locale=await getWorkspaceLocale(workspaceId);
  return {locale,t:createTranslator(locale)};
}
