"use client";
import { useActionState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { AuthState } from "@/app/actions/auth";
import { createTranslator, type Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/locale-utils";

export function AuthForm({ locale, action, mode, returnTo }: {locale:Locale; action: (state: AuthState, data: FormData) => Promise<AuthState>; mode: "login" | "register";returnTo?:string }) {
  const t=createTranslator(locale);
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="authForm">
    <input type="hidden" name="locale" value={locale}/>
    {returnTo&&<input type="hidden" name="returnTo" value={returnTo}/>} 
    {mode === "register" && <><label>{t("auth.name")}<input name="name" autoComplete="name" required placeholder={t("auth.namePlaceholder")}/></label><label>{t("auth.company")}<input name="company" autoComplete="organization" required placeholder="Nova Clinic"/></label></>}
    <label>{t("auth.email")}<input name="email" type="email" autoComplete="email" required placeholder="maxim@company.com"/></label>
    <label>{t("auth.password")}<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} required placeholder={t("auth.passwordPlaceholder")}/></label>
    {mode === "login" && <a className="forgotLink" href={localeHref("/forgot-password",locale)}>{t("auth.forgot")}</a>}
    {state.error && <p className="formError" role="alert">{state.error}</p>}
    <button className="primary authSubmit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={17}/> : <>{mode === "login" ? t("auth.login") : t("auth.createCompany")}<ArrowRight size={16}/></>}</button>
  </form>;
}
