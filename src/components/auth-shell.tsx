import Link from "next/link";
import { Logo } from "./logo";
import { AuthDemo } from "./auth-demo";
import { createTranslator, type Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/locale-utils";

export function AuthShell({ locale, path, title, copy, footer, children, compact=false }: {locale:Locale;path:string;title:string;copy:string;footer:React.ReactNode;children:React.ReactNode;compact?:boolean}) {
  const t=createTranslator(locale);const hero=t("auth.hero").split("\n");const nextLocale=locale==="en"?"ru":"en";
  return <main lang={locale} className={compact?"authPage authCompact":"authPage"}>
    <section className="authBrand">
      <div className="authBrandGlow" aria-hidden="true"/>
      <Logo/>
      <div className="authHero"><span className="authPill"><i/>{t("auth.pill")}</span><h1>{hero[0]}<br/><span>{hero[1]}</span></h1><p>{t("auth.heroCopy")}</p></div>
      <AuthDemo locale={locale}/>
      <small>© 2026 Lemiri AI · r0817</small>
    </section>
    <section className="authPanel"><Link className="authLanguage" href={localeHref(path,nextLocale)} hrefLang={nextLocale}><span className={locale==="ru"?"on":""}>RU</span><span className={locale==="en"?"on":""}>EN</span></Link><div className="authBox"><div className="authMobileLogo"><Logo/></div><h2>{title}</h2><p>{copy}</p>{children}<div className="authFooter">{footer}</div></div></section>
  </main>;
}
