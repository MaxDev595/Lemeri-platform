import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, Clock3, ClipboardList, Headset, MessagesSquare, MoonStar, Plus, Settings2, ShoppingBag, Sparkles, UserRoundCheck, Wrench, X } from "lucide-react";
import { Logo, LemiriGlyph } from "./logo";
import { LandingNav, SmoothScroll, StepsRail } from "./landing-client";
import { landingCopy } from "./landing-copy";
import { COMING_SOON, PLAN_OFFER } from "@/lib/billing/offer";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/locale-utils";

// Landing for the single product: an AI seller (consultant) for websites.
const featureIcons = [MessagesSquare, ShoppingBag, ClipboardList, Headset];
const problemIcons = [MoonStar, Sparkles, X];
const benefitIcons = [Clock3, Wrench, Settings2, BadgeCheck];

export function Landing({ locale, signedIn = false, openAccess = false }: { locale: Locale; signedIn?: boolean; openAccess?: boolean }) {
  const c = landingCopy[locale];
  const plans = PLAN_OFFER[locale];
  const other = locale === "ru" ? "en" : "ru";
  const register = signedIn ? "/app" : localeHref("/register", locale);
  const login = localeHref("/login", locale);
  const links = <>
    <a href="#features">{c.nav.features}</a>
    <a href="#how">{c.nav.how}</a>
    <a href="#cases">{c.nav.cases}</a>
    <a href="#pricing">{c.nav.pricing}</a>
    <a href="#faq">{c.nav.faq}</a>
  </>;
  return (
    <div className="landing" lang={locale}>
      <SmoothScroll />
      <LandingNav menu={<nav className="lnSheetLinks">{links}{!signedIn && <Link href={login}>{c.nav.login}</Link>}<Link className="primary" href={register}>{signedIn ? c.nav.cabinet : c.nav.start}</Link></nav>}>
        <Link href={localeHref("/", locale)} className="lnBrand" aria-label="Lemiri AI"><Logo /></Link>
        <nav className="lnLinks">{links}</nav>
        <div className="lnNavActions">
          <Link className="lnLang" href={localeHref("/", other)} hrefLang={other}><span className={locale === "ru" ? "on" : ""}>RU</span><span className={locale === "en" ? "on" : ""}>EN</span></Link>
          {!signedIn && <Link className="lnLogin" href={login}>{c.nav.login}</Link>}
          <Link className="primary lnStart" href={register}>{signedIn ? c.nav.cabinet : c.nav.start}</Link>
        </div>
      </LandingNav>

      <main>
        {/* Hero: the offer and the card itself */}
        <section className="lnHero">
          <div className="lnHeroBg" aria-hidden="true"><span className="lnOrb one" /><span className="lnOrb two" /><span className="lnGrid" /></div>
          <div className="lnHeroCopy">
            <span className="lnPill"><i />{c.hero.pill}</span>
            <h1>{c.hero.title}</h1>
            <p>{c.hero.copy}</p>
            <div className="lnHeroCta">
              <Link className="primary lnBig" href={register}>{c.hero.primary}<ArrowRight className="submitArrow" size={17} /></Link>
              <a className="btn lnBig" href="#how">{c.hero.secondary}</a>
            </div>
            <small className="lnNote"><Check size={14} />{c.hero.note}</small>
          </div>
          <CardDemo locale={locale} />
        </section>

        {/* Problem */}
        <section className="lnSection" id="problem">
          <header className="lnHead lnHeadCenter reveal"><span className="lnKicker">{c.problem.kicker}</span><h2>{c.problem.title}</h2><p>{c.problem.copy}</p></header>
          <div className="lnProblems" data-stagger>
            {c.problem.items.map((item, index) => { const Icon = problemIcons[index]!; return <article key={item.title} className="lnProblem"><span className="lnIcon"><Icon size={18} /></span><h3>{item.title}</h3><p>{item.copy}</p></article>; })}
          </div>
        </section>

        {/* What the AI seller does */}
        <section className="lnSection" id="features">
          <header className="lnHead reveal"><span className="lnKicker">{c.features.kicker}</span><h2>{c.features.title}</h2><p>{c.features.copy}</p></header>
          <div className="lnFeatures" data-stagger>
            {c.features.items.map((item, index) => { const Icon = featureIcons[index]!; return <article key={item.title} className="lnCard"><span className="lnIcon"><Icon size={20} /></span><h3>{item.title}</h3><p>{item.copy}</p></article>; })}
          </div>
          <p className="lnTruth reveal"><BadgeCheck size={18} />{c.features.truth}</p>
        </section>

        {/* Benefits for the owner */}
        <section className="lnSection" id="benefits">
          <header className="lnHead lnHeadCenter reveal"><span className="lnKicker">{c.benefits.kicker}</span><h2>{c.benefits.title}</h2></header>
          <div className="lnBenefits" data-stagger>
            {c.benefits.items.map((item, index) => { const Icon = benefitIcons[index]!; return <div key={item.title} className="lnBenefit"><Icon size={20} /><div><b>{item.title}</b><p>{item.copy}</p></div></div>; })}
          </div>
        </section>

        {/* Connection steps */}
        <section className="lnSection lnHow" id="how">
          <header className="lnHead lnHeadSticky reveal">
            <span className="lnKicker">{c.how.kicker}</span><h2>{c.how.title}</h2><p>{c.how.copy}</p>
            <Link className="primary lnBig" href={register}>{c.hero.primary}<ArrowRight className="submitArrow" size={17} /></Link>
          </header>
          <StepsRail>
            {c.how.steps.map((step, index) => <li key={step.title} className="reveal"><span className="lnStepNum">{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div></li>)}
          </StepsRail>
        </section>

        {/* Use cases */}
        <section className="lnSection" id="cases">
          <header className="lnHead lnHeadCenter reveal"><span className="lnKicker">{c.cases.kicker}</span><h2>{c.cases.title}</h2></header>
          <div className="lnRoles lnCases" data-stagger>
            {c.cases.items.map(item => <article key={item.title} className="lnRole"><span className="lnIcon"><UserRoundCheck size={20} /></span><h3>{item.title}</h3><p>{item.copy}</p><ul>{item.tags.map(tag => <li key={tag}>{tag}</li>)}</ul></article>)}
          </div>
        </section>

        {/* Pricing */}
        <section className="lnSection" id="pricing">
          <header className="lnHead lnHeadCenter reveal"><span className="lnKicker">{c.pricing.kicker}</span><h2>{c.pricing.title}</h2><p>{c.pricing.copy}</p>{openAccess && <span className="lnOpen"><Sparkles size={14} />{locale === "ru" ? "Сейчас идёт тестирование — все тарифы открыты бесплатно" : "We're testing — every plan is free right now"}</span>}</header>
          <div className="lnPlans lnPlans3" data-stagger>
            {(["TRIAL", "STARTER", "CUSTOM"] as const).map(key => {
              const plan = plans[key]; const featured = key === "CUSTOM";
              return <article key={key} className={featured ? "lnPlan featured" : "lnPlan"}>
                {featured && <span className="lnBadge">{c.pricing.recommended}</span>}
                <h3>{plan.name}</h3>
                <div className="lnPrice"><strong>{plan.price}</strong><small>{plan.period}</small></div>
                <p>{plan.copy}</p>
                <ul className="lnPlanList">{plan.features.map(feature => <li key={feature}><Check size={14} />{feature}</li>)}</ul>
                <Link className={featured || key === "TRIAL" ? "primary" : "btn"} href={register}>{key === "TRIAL" ? c.pricing.trial : c.pricing.choose}</Link>
              </article>;
            })}
          </div>
          <div className="lnSoon reveal">
            <div><span className="lnKicker">{c.soon.kicker}</span><h3>{c.soon.title}</h3><p>{c.soon.copy}</p></div>
            <ul>{COMING_SOON[locale].map(item => <li key={item}><Clock3 size={13} />{item}</li>)}</ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="lnSection lnFaqWrap" id="faq">
          <header className="lnHead reveal"><span className="lnKicker">{c.faq.kicker}</span><h2>{c.faq.title}</h2></header>
          <div className="lnFaq" data-stagger>
            {c.faq.items.map((item, index) => <details key={item.q} name="faq" open={index === 0}><summary>{item.q}<Plus size={18} /></summary><div><p>{item.a}</p></div></details>)}
          </div>
        </section>

        {/* CTA */}
        <section className="lnCta reveal">
          <span className="lnCtaGlow" aria-hidden="true" />
          <LemiriGlyph size={44} className="lnCtaGlyph" />
          <h2>{c.cta.title}</h2>
          <p>{c.cta.copy}</p>
          <div className="lnHeroCta">
            <Link className="primary lnBig" href={register}>{c.cta.primary}<ArrowRight className="submitArrow" size={17} /></Link>
            <a className="lnGhost lnBig" href="mailto:sales@lemiri.ai">{c.cta.secondary}</a>
          </div>
        </section>
      </main>

      <footer className="lnFooter">
        <div><Logo /><small>{c.footer.made}</small></div>
        <nav>{links}</nav>
        <small>{c.footer.rights} · {c.footer.ai}</small>
        <nav className="lnLegal"><a href={`/legal/terms${locale === "en" ? "?lang=en" : ""}`}>{locale === "ru" ? "Условия" : "Terms"}</a><a href={`/legal/privacy${locale === "en" ? "?lang=en" : ""}`}>{locale === "ru" ? "Конфиденциальность" : "Privacy"}</a><a href={`/legal/refund${locale === "en" ? "?lang=en" : ""}`}>{locale === "ru" ? "Возвраты" : "Refunds"}</a></nav>
      </footer>
    </div>
  );
}

/** Static picture of the product: a website with the AI seller card open. */
function CardDemo({ locale }: { locale: Locale }) {
  const d = landingCopy[locale].demo;
  return <div className="lnDemo" aria-label={d.site} role="img">
    <div className="lnDemoBrowser">
      <div className="lnDemoBar"><i /><i /><i /><span>{d.site}</span></div>
      <div className="lnDemoPage" aria-hidden="true"><b /><b /><span /><span /><span /></div>
      <div className="lnDemoCard" aria-hidden="true">
        <header><span><LemiriGlyph size={18} /></span><div><b>Lemiri</b><small>{d.status}</small></div></header>
        <div className="lnDemoChat">
          <p className="me">{d.q1}</p>
          <div className="ai"><p>{d.a1}</p><ul>{d.items.map(item => <li key={item}>{item}</li>)}</ul><p>{d.a1b}</p></div>
          <p className="me">{d.q2}</p>
          <p className="ai">{d.a2}</p>
        </div>
        <footer><span>{locale === "ru" ? "Напишите сообщение…" : "Type a message…"}</span><i><ArrowRight size={14} /></i></footer>
      </div>
      <span className="lnDemoLauncher" aria-hidden="true"><LemiriGlyph size={22} /></span>
    </div>
    <div className="lnFloat lnFloatLead" aria-hidden="true"><span><ClipboardList size={16} /></span><b>{d.lead}</b><small>{d.leadMeta}</small></div>
  </div>;
}
