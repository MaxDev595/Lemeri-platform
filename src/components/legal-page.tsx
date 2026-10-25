import { Logo } from "./logo";
import type { LegalCompany } from "@/lib/legal/company";

// Shared layout of /terms, /privacy and /refund.
export type LegalSection = { title: string; body: Array<string | string[]> };

export function LegalPage({ locale, title, intro, sections, company }: { locale: "ru" | "en"; title: string; intro: string; sections: LegalSection[]; company: LegalCompany }) {
  const ru = locale === "ru";
  const contact = company.email ? <a href={`mailto:${company.email}`}>{company.email}</a> : <span>{ru ? "через раздел «Настройки» в кабинете" : "via Settings in the cabinet"}</span>;
  return <main className="lgPage">
    <header className="lgTop"><a href="/"><Logo/></a><nav><a href={`/legal/terms${ru ? "" : "?lang=en"}`}>{ru ? "Условия" : "Terms"}</a><a href={`/legal/privacy${ru ? "" : "?lang=en"}`}>{ru ? "Конфиденциальность" : "Privacy"}</a><a href={`/legal/refund${ru ? "" : "?lang=en"}`}>{ru ? "Возвраты" : "Refunds"}</a><a href={ru ? "?lang=en" : "?lang=ru"}>{ru ? "EN" : "RU"}</a></nav></header>
    <article className="lgBody">
      <h1>{title}</h1>
      <p className="lgMeta">{ru ? "Редакция от" : "Last updated"} {company.updated}</p>
      <p>{intro}</p>
      {sections.map((section, index) => <section key={section.title}><h2>{index + 1}. {section.title}</h2>{section.body.map((item, i) => Array.isArray(item) ? <ul key={i}>{item.map(line => <li key={line}>{line}</li>)}</ul> : <p key={i}>{item}</p>)}</section>)}
      <section className="lgContacts"><h2>{ru ? "Контакты" : "Contacts"}</h2>
        <p>{company.entity}{company.id ? `, ${company.id}` : ""}{company.address ? `, ${company.address}` : ""}{company.country ? `, ${company.country}` : ""}</p>
        <p>{ru ? "Поддержка" : "Support"}: {contact}</p>
        <p>{ru ? "Сотрудничество" : "Partnerships"}: <a href={`mailto:${company.workEmail}`}>{company.workEmail}</a></p>
        <p>{ru ? "Сайт" : "Website"}: {company.site}</p>
      </section>
    </article>
  </main>;
}
