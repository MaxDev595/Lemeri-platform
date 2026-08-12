import Link from "next/link";
import { redirect } from "next/navigation";
import { resetPassword } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { getSessionUser } from "@/lib/auth/session";
import { createTranslator } from "@/lib/i18n";
import { localeHref } from "@/lib/locale-utils";
import { getPublicLocale } from "@/lib/public-locale";

export default async function ResetPasswordPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{lang?:string}>}){if(await getSessionUser())redirect("/app");const {token}=await params;const locale=await getPublicLocale((await searchParams).lang);const t=createTranslator(locale);return <AuthShell locale={locale} path={`/reset-password/${token}`} title={t("auth.newPasswordTitle")} copy={t("auth.newPasswordCopy")} footer={<Link href={localeHref("/login",locale)}>{t("auth.backToLogin")}</Link>}><PasswordRecoveryForm locale={locale} action={resetPassword} token={token}/></AuthShell>}
