import Link from "next/link";
import { Logo } from "./logo";
import { createTranslator, type Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/locale-utils";

export function AuthShell({ locale, path, title, copy, footer, children, compact=false }: {locale:Locale;path:string;title:string;copy:string;footer:React.ReactNode;children:React.ReactNode;compact?:boolean}) {
  const t=createTranslator(locale);const hero=t("auth.hero").split("\n");const nextLocale=locale==="en"?"ru":"en";
  return <main className={compact?"authPage authCompact":"authPage"}><section className="authBrand"><Logo/><div><span className="authPill">{t("auth.pill")}</span><h1>{hero[0]}<br/>{hero[1]}</h1><p>{t("auth.heroCopy")}</p></div><small>© 2026 Lemiri AI</small></section><section className="authPanel"><div className="authBox"><Link className="authLanguage" href={localeHref(path,nextLocale)} hrefLang={nextLocale}>{t("auth.language")}</Link><h2>{title}</h2><p>{copy}</p>{children}<div className="authFooter">{footer}</div></div></section></main>;
}
