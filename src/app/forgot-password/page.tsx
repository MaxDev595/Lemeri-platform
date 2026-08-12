import Link from "next/link";
import { redirect } from "next/navigation";
import { requestPasswordReset } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { getSessionUser } from "@/lib/auth/session";
import { createTranslator } from "@/lib/i18n";
import { localeHref } from "@/lib/locale-utils";
import { getPublicLocale } from "@/lib/public-locale";

export default async function ForgotPasswordPage({searchParams}:{searchParams:Promise<{lang?:string}>}){if(await getSessionUser())redirect("/app");const locale=await getPublicLocale((await searchParams).lang);const t=createTranslator(locale);return <AuthShell locale={locale} path="/forgot-password" title={t("auth.recoveryTitle")} copy={t("auth.recoveryCopy")} footer={<Link href={localeHref("/login",locale)}>{t("auth.backToLogin")}</Link>}><PasswordRecoveryForm locale={locale} action={requestPasswordReset}/></AuthShell>}
