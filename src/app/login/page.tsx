import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { getSessionUser } from "@/lib/auth/session";
import { createTranslator } from "@/lib/i18n";
import { localeHref, safeReturnTo } from "@/lib/locale-utils";
import { getPublicLocale } from "@/lib/public-locale";

export default async function LoginPage({searchParams}:{searchParams:Promise<{lang?:string;returnTo?:string}>}) {
  if (await getSessionUser()) redirect("/app");
  const query=await searchParams;const locale=await getPublicLocale(query.lang);const t=createTranslator(locale);const returnTo=safeReturnTo(query.returnTo);const languagePath=returnTo?`/login?returnTo=${encodeURIComponent(returnTo)}`:"/login";
  return <AuthShell locale={locale} path={languagePath} title={t("auth.loginTitle")} copy={t("auth.loginCopy")} footer={<>{t("auth.noAccount")} <Link href={localeHref("/register",locale)}>{t("auth.startFree")}</Link></>}><AuthForm locale={locale} action={login} mode="login" returnTo={returnTo}/></AuthShell>;
}
