import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck2,
  Check,
  Headphones,
  MessagesSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Workflow,
  Zap,
} from "lucide-react";
import { Logo, LemiriGlyph } from "./logo";
import { AuthDemo } from "./auth-demo";
import { CountUp } from "./motion";
import { ChannelGlyph } from "./illustrations";
import { LandingNav, SmoothScroll, StepsRail, TiltStage, TypeCycle } from "./landing-client";
import { landingCopy } from "./landing-copy";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/locale-utils";

const channelIcons = [ChannelGlyph.WEBSITE, ChannelGlyph.WHATSAPP, ChannelGlyph.TELEGRAM, CalendarGlyph, ChannelGlyph.WEBHOOK, ChannelGlyph.EMAIL];
function CalendarGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4M8 14h2M14 14h2M8 17.5h2" />
    </svg>
  );
}
const featureIcons = [MessagesSquare, BookOpenCheck, ShieldCheck, Zap];
const roleIcons = [CalendarCheck2, UserRoundCheck, Headphones];
const weekBars = [42, 58, 51, 74, 88, 63, 47];

export function Landing({ locale, signedIn = false }: { locale: Locale; signedIn?: boolean }) {
  const c = landingCopy[locale];
  const other = locale === "ru" ? "en" : "ru";
  const register = signedIn ? "/app" : localeHref("/register", locale);
  const login = localeHref("/login", locale);
  const links = (
    <>
      <a href="#features">{c.nav.features}</a>
      <a href="#how">{c.nav.how}</a>
      <a href="#roles">{c.nav.roles}</a>
      <a href="#pricing">{c.nav.pricing}</a>
      <a href="#faq">{c.nav.faq}</a>
    </>
  );
  return (
    <div className="landing" lang={locale}>
      <SmoothScroll />
      <LandingNav
        menu={
          <nav className="lnSheetLinks">
            {links}
            {!signedIn && <Link href={login}>{c.nav.login}</Link>}
            <Link className="primary" href={register}>
              {signedIn ? c.nav.cabinet : c.nav.start}
            </Link>
          </nav>
        }
      >
        <Link href={localeHref("/", locale)} className="lnBrand" aria-label="Lemiri AI">
          <Logo />
        </Link>
        <nav className="lnLinks">{links}</nav>
        <div className="lnNavActions">
          <Link className="lnLang" href={localeHref("/", other)} hrefLang={other}>
            <span className={locale === "ru" ? "on" : ""}>RU</span>
            <span className={locale === "en" ? "on" : ""}>EN</span>
          </Link>
          {!signedIn && (
            <Link className="lnLogin" href={login}>
              {c.nav.login}
            </Link>
          )}
          <Link className="primary lnStart" href={register}>
            {signedIn ? c.nav.cabinet : c.nav.start}
          </Link>
        </div>
      </LandingNav>

      <main>
        {/* ---------------- Hero ---------------- */}
        <section className="lnHero">
          <div className="lnHeroBg" aria-hidden="true">
            <span className="lnOrb one" />
            <span className="lnOrb two" />
            <span className="lnGrid" />
          </div>
          <div className="lnHeroCopy">
            <span className="lnPill">
              <i />
              {c.hero.pill}
            </span>
            <h1>
              {c.hero.titleA} <TypeCycle words={c.hero.titleWords} /> {c.hero.titleB}
            </h1>
            <p>{c.hero.copy}</p>
            <div className="lnHeroCta">
              <Link className="primary lnBig" href={register}>
                {c.hero.primary}
                <ArrowRight className="submitArrow" size={17} />
              </Link>
              <a className="btn lnBig" href="#how">
                {c.hero.secondary}
              </a>
            </div>
            <small className="lnNote">
              <Check size={14} />
              {c.hero.note}
            </small>
          </div>
          <TiltStage>
            <div className="lnDevice">
              <span className="lnSpot" aria-hidden="true" />
              <AuthDemo locale={locale} />
            </div>
            <div className="lnFloat lnFloatLead" aria-hidden="true">
              <span>
                <UserRoundCheck size={16} />
              </span>
              <b>{c.float.lead}</b>
              <small>{c.float.leadMeta}</small>
            </div>
            <div className="lnFloat lnFloatCrm" aria-hidden="true">
              <span>
                <Workflow size={16} />
              </span>
              <b>{c.float.crm}</b>
              <small>{c.float.crmMeta}</small>
            </div>
            <div className="lnFloat lnFloatSlots" aria-hidden="true">
              <small>
                {c.float.slots} · {c.float.slotsMeta}
              </small>
              <div>
                <i>10:00</i>
                <i className="on">12:30</i>
                <i>16:00</i>
              </div>
            </div>
          </TiltStage>
        </section>

        {/* ---------------- Channels ---------------- */}
        <section className="lnChannels" aria-label={c.channelsTitle}>
          <p className="reveal">{c.channelsTitle}</p>
          <div className="lnMarquee">
            <div className="lnMarqueeTrack">
              {[0, 1].map((copy) => (
                <ul key={copy} aria-hidden={copy === 1}>
                  {c.channels.map((name, index) => {
                    const Icon = channelIcons[index]!;
                    return (
                      <li key={name}>
                        <Icon />
                        {name}
                      </li>
                    );
                  })}
                </ul>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Features ---------------- */}
        <section className="lnSection" id="features">
          <header className="lnHead reveal">
            <span className="lnKicker">{c.features.kicker}</span>
            <h2>{c.features.title}</h2>
            <p>{c.features.copy}</p>
          </header>
          <div className="lnBento" data-stagger>
            {c.features.items.map((item, index) => {
              const Icon = featureIcons[index]!;
              return (
                <article key={item.title} className={`lnCard lnCard${index + 1}`}>
                  <span className="lnIcon">
                    <Icon size={20} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                  <FeatureArt index={index} locale={locale} />
                </article>
              );
            })}
          </div>
        </section>

        {/* ---------------- How it works ---------------- */}
        <section className="lnSection lnHow" id="how">
          <header className="lnHead lnHeadSticky reveal">
            <span className="lnKicker">{c.how.kicker}</span>
            <h2>
              {c.how.titleA} <em>{c.how.titleAccent}</em>
            </h2>
            <p>{c.how.copy}</p>
            <Link className="primary lnBig" href={register}>
              {c.hero.primary}
              <ArrowRight className="submitArrow" size={17} />
            </Link>
          </header>
          <StepsRail>
            {c.how.steps.map((step, index) => (
              <li key={step.title} className="reveal">
                <span className="lnStepNum">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </li>
            ))}
          </StepsRail>
        </section>

        {/* ---------------- Roles ---------------- */}
        <section className="lnSection" id="roles">
          <header className="lnHead lnHeadCenter reveal">
            <span className="lnKicker">{c.roles.kicker}</span>
            <h2>{c.roles.title}</h2>
          </header>
          <div className="lnRoles" data-stagger>
            {c.roles.items.map((role, index) => {
              const Icon = roleIcons[index]!;
              return (
                <article key={role.title} className="lnRole">
                  <span className="lnIcon">
                    <Icon size={20} />
                  </span>
                  <h3>{role.title}</h3>
                  <p>{role.copy}</p>
                  <ul>
                    {role.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                  <Link href={register} className="lnRoleLink">
                    {c.roles.pick}
                    <ArrowRight size={15} />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        {/* ---------------- Analytics ---------------- */}
        <section className="lnSection lnAnalytics">
          <header className="lnHead reveal">
            <span className="lnKicker">{c.analytics.kicker}</span>
            <h2>{c.analytics.title}</h2>
            <p>{c.analytics.copy}</p>
          </header>
          <div className="lnPanel reveal">
            <div className="lnPanelTop">
              <b>{c.analytics.period}</b>
              <span className="status success">Live</span>
            </div>
            <div className="lnMetrics">
              {c.analytics.metrics.map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>
                    <CountUp value={metric.value} duration={1400} />
                  </strong>
                  <em>{metric.delta}</em>
                </div>
              ))}
            </div>
            <div className="lnChart reveal">
              {weekBars.map((value, index) => (
                <div key={index} style={{ ["--h" as string]: `${value}%`, ["--i" as string]: index }}>
                  <span />
                  <small>{c.analytics.days[index]}</small>
                </div>
              ))}
            </div>
            <div className="lnInsight">
              <Sparkles size={16} />
              <span>{c.analytics.insight}</span>
            </div>
          </div>
        </section>

        {/* ---------------- Pricing ---------------- */}
        <section className="lnSection" id="pricing">
          <header className="lnHead lnHeadCenter reveal">
            <span className="lnKicker">{c.pricing.kicker}</span>
            <h2>{c.pricing.title}</h2>
          </header>
          <div className="lnPlans" data-stagger>
            {c.pricing.plans.map((plan) => {
              const featured = plan.name === "Pro";
              const enterprise = plan.name === "Enterprise";
              return (
                <article key={plan.name} className={featured ? "lnPlan featured" : "lnPlan"}>
                  {featured && <span className="lnBadge">{c.pricing.recommended}</span>}
                  <h3>{plan.name}</h3>
                  <div className="lnPrice">
                    <strong className={plan.price.startsWith("$") ? "" : "long"}>{plan.price}</strong>
                    {plan.period && <small>{plan.period}</small>}
                  </div>
                  <p>{plan.copy}</p>
                  {enterprise ? (
                    <a className="btn" href="mailto:sales@lemiri.ai">
                      {c.pricing.contact}
                    </a>
                  ) : (
                    <Link className={featured ? "primary" : "btn"} href={register}>
                      {c.pricing.choose}
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section className="lnSection lnFaqWrap" id="faq">
          <header className="lnHead reveal">
            <span className="lnKicker">{c.faq.kicker}</span>
            <h2>{c.faq.title}</h2>
          </header>
          <div className="lnFaq" data-stagger>
            {c.faq.items.map((item, index) => (
              <details key={item.q} name="faq" open={index === 0}>
                <summary>
                  {item.q}
                  <Plus size={18} />
                </summary>
                <div>
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ---------------- CTA ---------------- */}
        <section className="lnCta reveal">
          <span className="lnCtaGlow" aria-hidden="true" />
          <LemiriGlyph size={44} className="lnCtaGlyph" />
          <h2>{c.cta.title}</h2>
          <p>{c.cta.copy}</p>
          <div className="lnHeroCta">
            <Link className="primary lnBig" href={register}>
              {c.cta.primary}
              <ArrowRight className="submitArrow" size={17} />
            </Link>
            <a className="lnGhost lnBig" href="mailto:sales@lemiri.ai">
              {c.cta.secondary}
            </a>
          </div>
        </section>
      </main>

      <footer className="lnFooter">
        <div>
          <Logo />
          <small>{c.footer.made}</small>
        </div>
        <nav>{links}</nav>
        <small>{c.footer.rights}</small>
      </footer>
    </div>
  );
}

/** Small, purely decorative vignettes that make each feature card specific. */
function FeatureArt({ index, locale }: { index: number; locale: Locale }) {
  const ru = locale === "ru";
  if (index === 0)
    return (
      <div className="lnArt lnArtChat" aria-hidden="true">
        <i className="in">{ru ? "Есть запись на завтра?" : "Any slots tomorrow?"}</i>
        <i className="out">{ru ? "Да, свободно 10:30 и 15:00" : "Yes — 10:30 and 15:00 are open"}</i>
        <i className="typing">
          <b />
          <b />
          <b />
        </i>
      </div>
    );
  if (index === 1)
    return (
      <div className="lnArt lnArtDocs" aria-hidden="true">
        {["price-2026.pdf", "faq.md", "novaclinic.kz"].map((name, i) => (
          <span key={name} style={{ ["--i" as string]: i }}>
            <Check size={12} />
            {name}
          </span>
        ))}
      </div>
    );
  if (index === 2)
    return (
      <div className="lnArt lnArtHandoff" aria-hidden="true">
        <span className="lnMeter">
          <i style={{ width: "34%" }} />
        </span>
        <small>{ru ? "Уверенность 34% → передано менеджеру" : "Confidence 34% → handed to manager"}</small>
      </div>
    );
  return (
    <div className="lnArt lnArtFlow" aria-hidden="true">
      <span>{ru ? "Диалог" : "Chat"}</span>
      <ArrowRight size={13} />
      <span className="on">{ru ? "Лид" : "Lead"}</span>
      <ArrowRight size={13} />
      <span>CRM</span>
    </div>
  );
}
