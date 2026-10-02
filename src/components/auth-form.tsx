"use client";
import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import type { AuthState } from "@/app/actions/auth";
import { createTranslator, type Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/locale-utils";

export function AuthForm({ locale, action, mode, returnTo }: {locale:Locale; action: (state: AuthState, data: FormData) => Promise<AuthState>; mode: "login" | "register";returnTo?:string }) {
  const t=createTranslator(locale);
  const [state, formAction, pending] = useActionState(action, {});
  const [reveal,setReveal]=useState(false);
  const [account,setAccount]=useState<"OWNER"|"EMPLOYEE">("OWNER");
  const ru=locale!=="en";
  return <form action={formAction} className="authForm">
    <input type="hidden" name="locale" value={locale}/>
    {returnTo&&<input type="hidden" name="returnTo" value={returnTo}/>} 
    {mode === "register" && <>
      <input type="hidden" name="accountType" value={account}/>
      <div className="accountChoice" role="radiogroup" aria-label={ru?"Кто вы":"Who are you"}>
        <button type="button" role="radio" aria-checked={account==="OWNER"} className={account==="OWNER"?"on":""} onClick={()=>setAccount("OWNER")}><b>{ru?"Владелец":"Owner"}</b><small>{ru?"Создаю компанию и подключаю ИИ":"I set up my company and AI"}</small></button>
        <button type="button" role="radio" aria-checked={account==="EMPLOYEE"} className={account==="EMPLOYEE"?"on":""} onClick={()=>setAccount("EMPLOYEE")}><b>{ru?"Сотрудник":"Employee"}</b><small>{ru?"Присоединяюсь к своей компании":"I'm joining my company"}</small></button>
      </div>
      <label>{t("auth.name")}<input name="name" autoComplete="name" required placeholder={t("auth.namePlaceholder")}/></label>
      {account==="EMPLOYEE"&&<p className="accountNote">{ru?"После регистрации выберете должность и присоединитесь к компании по коду от руководителя.":"After signing up you'll pick your position and join your company with a code from your manager."}</p>}
      {account==="OWNER"&&<label>{t("auth.company")}<input name="company" autoComplete="organization" required placeholder="Nova Clinic"/></label>}
    </>}
    <label>{t("auth.email")}<input name="email" type="email" autoComplete="email" required placeholder="maxim@company.com"/></label>
    <label>{t("auth.password")}<span className="passwordField"><input name="password" type={reveal?"text":"password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} required placeholder={t("auth.passwordPlaceholder")}/><button type="button" className="passwordToggle" onClick={()=>setReveal(value=>!value)} aria-label={reveal?(locale==="ru"?"Скрыть пароль":"Hide password"):(locale==="ru"?"Показать пароль":"Show password")} aria-pressed={reveal}>{reveal?<EyeOff size={16}/>:<Eye size={16}/>}</button></span></label>
    {mode === "login" && <a className="forgotLink" href={localeHref("/forgot-password",locale)}>{t("auth.forgot")}</a>}
    {state.error && <p className="formError" role="alert">{state.error}</p>}
    <button className="primary authSubmit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={17}/> : <>{mode === "login" ? t("auth.login") : account==="EMPLOYEE" ? (ru?"Создать аккаунт сотрудника":"Create employee account") : t("auth.createCompany")}<ArrowRight className="submitArrow" size={16}/></>}</button>
  </form>;
}
