import Link from "next/link";
import { redirect } from "next/navigation";
import { register } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { getSessionUser } from "@/lib/auth/session";
import { createTranslator } from "@/lib/i18n";
import { localeHref } from "@/lib/locale-utils";
import { getPublicLocale } from "@/lib/public-locale";

export default async function RegisterPage({searchParams}:{searchParams:Promise<{lang?:string}>}) {
  if (await getSessionUser()) redirect("/app");
  const locale=await getPublicLocale((await searchParams).lang);const t=createTranslator(locale);
  return <AuthShell compact locale={locale} path="/register" title={t("auth.registerTitle")} copy={t("auth.registerCopy")} footer={<>{t("auth.haveAccount")} <Link href={localeHref("/login",locale)}>{t("auth.login")}</Link></>}><AuthForm locale={locale} action={register} mode="register"/></AuthShell>;
}
