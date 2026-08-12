"use client";
import { useActionState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { AuthState } from "@/app/actions/auth";
import { createTranslator, type Locale } from "@/lib/i18n";

export function PasswordRecoveryForm({locale,action,token}:{locale:Locale;action:(state:AuthState,data:FormData)=>Promise<AuthState>;token?:string}){
  const t=createTranslator(locale);
  const [state,formAction,pending]=useActionState(action,{});
  return <form action={formAction} className="authForm"><input type="hidden" name="locale" value={locale}/>{token?<><input type="hidden" name="token" value={token}/><label>{t("auth.newPassword")}<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required/></label><label>{t("auth.repeatPassword")}<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required/></label></>:<label>{t("auth.email")}<input name="email" type="email" autoComplete="email" required/></label>}{state.error&&<p className="formError" role="alert">{state.error}</p>}{state.message&&<p className="formSuccess" role="status">{state.message}</p>}<button className="primary authSubmit" disabled={pending}>{pending?<LoaderCircle className="spin" size={17}/>:<>{token?t("auth.savePassword"):t("auth.sendLink")}<ArrowRight size={16}/></>}</button></form>;
}
