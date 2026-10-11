"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, Check, CreditCard, Lock, ShieldCheck, User } from "lucide-react";
import { PLAN_OFFER, planPriceText, YEARLY_SAVE_PERCENT } from "@/lib/billing/offer";
import { LemiriGlyph } from "../logo";

// Checkout: step 1 — payer details (full name, email, country, address, company and
// tax id) saved to Paddle and to the billing profile; step 2 — the card is entered in
// Paddle's secure inline frame. Card data never reaches Lemiri's servers.

type Plan = "STARTER" | "CUSTOM";
type Interval = "month" | "year";
type Details = { fullName: string; email: string; country: string; region: string; city: string; postalCode: string; address: string; address2: string; company: string; taxId: string };
type PaddleSdk = { Environment: { set(env: "sandbox"): void }; Initialize(options: { token: string; eventCallback?: (event: { name?: string }) => void }): void; Checkout: { open(options: Record<string, unknown>): void } };
declare global { interface Window { Paddle?: PaddleSdk; __lemiriPaddleToken?: string } }

// Paddle does not sell to these countries (sanctions); they are not offered.
const BLOCKED = new Set(["RU", "BY", "IR", "KP", "CU", "SY"]);
const CODES = "AD AE AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BZ CA CD CF CG CH CI CL CM CN CO CR CV CY CZ DE DJ DK DM DO DZ EC EE EG ES ET FI FJ FM FO FR GA GB GD GE GH GI GL GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IS IT JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV MA MC MD ME MG MH MK ML MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PT PW PY QA RO RS RW SA SB SC SE SG SI SK SL SM SN SR ST SV SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VC VN VU WS ZA ZM ZW".split(" ").filter(code => !BLOCKED.has(code));

const T = {
  ru: {
    back: "К тарифам", title: "Оформление подписки", step1: "Данные плательщика", step2: "Оплата картой",
    person: "Плательщик", fullName: "ФИО", fullNameHint: "Как на карте или в документах компании", email: "Email для счетов",
    address: "Адрес", country: "Страна", region: "Область / регион", city: "Город", postalCode: "Почтовый индекс", line1: "Улица, дом, квартира / офис", line2: "Доп. строка адреса",
    company: "Компания (если платите от юрлица)", companyName: "Название компании", taxId: "ИНН / БИН / VAT", optional: "необязательно",
    next: "Перейти к оплате картой", saving: "Сохраняем…", edit: "Изменить данные",
    cardCopy: "Номер карты, срок и CVC вводятся в защищённой форме Paddle — Lemiri их не видит и не хранит.",
    loadingCard: "Загружаем защищённую форму оплаты…", cardFailed: "Не удалось загрузить форму оплаты. Проверьте блокировщик рекламы и попробуйте ещё раз.",
    summary: "Ваш заказ", perMonth: "в месяц", total: "Итого сегодня", taxes: "Налоги рассчитает Paddle по вашей стране", cancel: "Отменить можно в любой момент в «Оплата и счета».",
    billing: "Период оплаты", monthly: "Помесячно", yearly: "За год", yearlyRenews: "Продлевается раз в год. ИИ получает месячный лимит ответов каждый месяц.",
    mor: "Платежи принимает Paddle.com — официальный продавец (Merchant of Record). В выписке будет PADDLE.NET* LEMIRI.",
    secure: "Защищённая оплата", accept: "Оплачивая, вы принимаете", terms: "условия использования", refund: "правила возврата", and: "и", privacy: "политику конфиденциальности",
    errors: { DETAILS_REQUIRED: "Заполните данные плательщика", BILLING_PROVIDER_NOT_CONFIGURED: "Оплата ещё не подключена — напишите нам", OPEN_ACCESS: "Сейчас идёт тестовый период — оплата не нужна", CARD_DATA_NOT_ACCEPTED: "Не вводите номер карты в эти поля — он вводится на следующем шаге", FORBIDDEN: "Оплачивать может только владелец", INVALID_REQUEST: "Проверьте поля формы", default: "Не удалось начать оплату. Попробуйте ещё раз." } as Record<string, string>,
    success: "Оплата прошла! Переходим в кабинет…", changed: "Тариф изменён",
  },
  en: {
    back: "Back to plans", title: "Checkout", step1: "Billing details", step2: "Card payment",
    person: "Payer", fullName: "Full name", fullNameHint: "As on the card or company documents", email: "Email for invoices",
    address: "Address", country: "Country", region: "State / region", city: "City", postalCode: "Postal code", line1: "Street, building, apartment / office", line2: "Address line 2",
    company: "Company (if paying as a business)", companyName: "Company name", taxId: "Tax ID / VAT", optional: "optional",
    next: "Continue to card payment", saving: "Saving…", edit: "Edit details",
    cardCopy: "Card number, expiry and CVC are entered in Paddle's secure form — Lemiri never sees or stores them.",
    loadingCard: "Loading the secure payment form…", cardFailed: "Couldn't load the payment form. Check your ad blocker and try again.",
    summary: "Your order", perMonth: "per month", total: "Due today", taxes: "Paddle adds taxes for your country", cancel: "Cancel any time in “Billing & invoices”.",
    billing: "Billing period", monthly: "Monthly", yearly: "Yearly", yearlyRenews: "Renews once a year. The AI reply allowance resets every month.",
    mor: "Payments are processed by Paddle.com, the Merchant of Record. Your statement will show PADDLE.NET* LEMIRI.",
    secure: "Secure payment", accept: "By paying you accept the", terms: "terms of service", refund: "refund policy", and: "and the", privacy: "privacy policy",
    errors: { DETAILS_REQUIRED: "Fill in the billing details", BILLING_PROVIDER_NOT_CONFIGURED: "Payments aren't set up yet — contact us", OPEN_ACCESS: "Testing period — no payment needed", CARD_DATA_NOT_ACCEPTED: "Don't type the card number here — it goes in the next step", FORBIDDEN: "Only the owner can pay", INVALID_REQUEST: "Check the form fields", default: "Couldn't start the payment. Please try again." } as Record<string, string>,
    success: "Payment complete! Opening your cabinet…", changed: "Plan changed",
  },
};

let sdk: Promise<PaddleSdk> | null = null;
function loadPaddle() {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  sdk ??= new Promise<PaddleSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js"; script.async = true;
    script.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error("PADDLE_JS")));
    script.onerror = () => { sdk = null; reject(new Error("PADDLE_JS")); };
    document.head.appendChild(script);
  });
  return sdk;
}

export function CheckoutPage({ locale, plan, interval: initialInterval = "month", initial }: { locale: "ru" | "en"; plan: Plan; interval?: Interval; initial: Partial<Details> }) {
  const c = T[locale];
  const offer = PLAN_OFFER[locale][plan];
  const [interval, setBillingInterval] = useState<Interval>(initialInterval);
  const price = planPriceText(plan, interval, locale);
  const [details, setDetails] = useState<Details>({ fullName: "", email: "", country: "KZ", region: "", city: "", postalCode: "", address: "", address2: "", company: "", taxId: "", ...Object.fromEntries(Object.entries(initial).filter(([, value]) => typeof value === "string" && value)) } as Details);
  const [asCompany, setAsCompany] = useState(Boolean(initial.company));
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cardState, setCardState] = useState<"idle" | "loading" | "ready" | "failed" | "done">("idle");
  const frameRef = useRef<HTMLDivElement>(null);
  // Country names come from the browser's Intl data, so the list is built after mount
  // (server and browser ICU data differ and would break hydration).
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>(() => [{ code: details.country, name: details.country }]);
  useEffect(() => {
    let names: Intl.DisplayNames | null = null; try { names = new Intl.DisplayNames([locale], { type: "region" }); } catch { /* old browser: codes */ }
    setCountries(CODES.map(code => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, locale)));
  }, [locale]);
  const set = (key: keyof Details) => (event: { target: { value: string } }) => setDetails(value => ({ ...value, [key]: event.target.value }));

  useEffect(() => { if (step === 2) frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [step]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const payload = { ...details, company: asCompany ? details.company : "", taxId: asCompany ? details.taxId : "" };
      const response = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "checkout", plan, interval, details: payload }) });
      const body = await response.json().catch(() => ({})) as { error?: string; changed?: boolean; paddle?: { transactionId: string; clientToken: string; environment: "sandbox" | "production"; successUrl: string } };
      if (body.changed) { window.location.assign("/app?section=billing&billing=changed"); return; }
      if (!response.ok || !body.paddle) { setError(c.errors[body.error ?? ""] ?? c.errors.default); return; }
      setStep(2); setCardState("loading");
      const paddle = await loadPaddle();
      if (window.__lemiriPaddleToken !== body.paddle.clientToken) {
        if (body.paddle.environment === "sandbox") paddle.Environment.set("sandbox");
        const successUrl = body.paddle.successUrl;
        paddle.Initialize({ token: body.paddle.clientToken, eventCallback: event => {
          if (event.name === "checkout.loaded") setCardState("ready");
          if (event.name === "checkout.completed") { setCardState("done"); window.setTimeout(() => window.location.assign(successUrl), 1200); }
        } });
        window.__lemiriPaddleToken = body.paddle.clientToken;
      }
      paddle.Checkout.open({
        transactionId: body.paddle.transactionId,
        settings: { displayMode: "inline", frameTarget: "lemiri-paddle-frame", frameInitialHeight: 450, frameStyle: "width:100%;min-width:286px;background-color:transparent;border:none;", locale, showAddDiscounts: false, allowLogout: false, successUrl: body.paddle.successUrl },
      });
      window.setTimeout(() => setCardState(state => (state === "loading" ? "ready" : state)), 4000);
    } catch { setCardState("failed"); }
    finally { setBusy(false); }
  }

  return <main className="ckPage">
    <header className="ckTop"><a href="/app?section=billing" className="ckBack"><ArrowLeft size={16}/>{c.back}</a><span className="ckBrand"><LemiriGlyph size={22}/>Lemiri AI</span><span className="ckSecure"><Lock size={13}/>{c.secure}</span></header>
    <div className="ckGrid">
      <section className="ckMain">
        <h1>{c.title}</h1>
        <ol className="ckSteps"><li className={step === 1 ? "on" : "done"}><span>{step === 1 ? 1 : <Check size={12}/>}</span>{c.step1}</li><li className={step === 2 ? "on" : ""}><span>2</span>{c.step2}</li></ol>
        <form className={`ckForm${step === 2 ? " locked" : ""}`} onSubmit={submit} autoComplete="on">
          <fieldset disabled={step === 2 || busy}>
            <legend><User size={15}/>{c.person}</legend>
            <label className="wide">{c.fullName}<input name="name" autoComplete="name" required minLength={3} maxLength={120} value={details.fullName} onChange={set("fullName")}/><small>{c.fullNameHint}</small></label>
            <label className="wide">{c.email}<input name="email" type="email" autoComplete="email" required value={details.email} onChange={set("email")}/></label>
          </fieldset>
          <fieldset disabled={step === 2 || busy}>
            <legend><CreditCard size={15}/>{c.address}</legend>
            <label>{c.country}<select name="country" autoComplete="country" required value={details.country} onChange={set("country")}>{countries.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
            <label><span>{c.region} <em>{c.optional}</em></span><input name="region" autoComplete="address-level1" maxLength={80} value={details.region} onChange={set("region")}/></label>
            <label>{c.city}<input name="city" autoComplete="address-level2" required maxLength={80} value={details.city} onChange={set("city")}/></label>
            <label>{c.postalCode}<input name="postal" autoComplete="postal-code" required maxLength={20} value={details.postalCode} onChange={set("postalCode")}/></label>
            <label className="wide">{c.line1}<input name="address" autoComplete="address-line1" required minLength={3} maxLength={200} value={details.address} onChange={set("address")}/></label>
            <label className="wide"><span>{c.line2} <em>{c.optional}</em></span><input name="address2" autoComplete="address-line2" maxLength={200} value={details.address2} onChange={set("address2")}/></label>
          </fieldset>
          <fieldset disabled={step === 2 || busy}>
            <label className="ckCheck wide"><input type="checkbox" checked={asCompany} onChange={event => setAsCompany(event.target.checked)}/><Building2 size={15}/>{c.company}</label>
            {asCompany && <><label>{c.companyName}<input name="organization" autoComplete="organization" required maxLength={160} value={details.company} onChange={set("company")}/></label><label><span>{c.taxId} <em>{c.optional}</em></span><input name="taxId" maxLength={40} value={details.taxId} onChange={set("taxId")}/></label></>}
          </fieldset>
          {error && <p className="ckError" role="alert">{error}</p>}
          {step === 1 ? <button className="primary ckSubmit" disabled={busy}>{busy ? c.saving : c.next}</button>
            : <button type="button" className="linkButton" onClick={() => { setStep(1); setCardState("idle"); }}>{c.edit}</button>}
        </form>
        <section className={`ckCard${step === 2 ? " on" : ""}`} aria-hidden={step !== 2}>
          <h2><CreditCard size={17}/>{c.step2}</h2>
          <p className="ckNote"><ShieldCheck size={15}/>{c.cardCopy}</p>
          {cardState === "loading" && <p className="sxMuted"><span className="sxSpinner"/> {c.loadingCard}</p>}
          {cardState === "failed" && <p className="ckError">{c.cardFailed}</p>}
          {cardState === "done" && <p className="ckDone"><Check size={16}/>{c.success}</p>}
          <div ref={frameRef} className="lemiri-paddle-frame ckFrame"/>
        </section>
      </section>
      <aside className="ckSummary">
        <h2>{c.summary}</h2>
        <div className="ckInterval" role="group" aria-label={c.billing}>
          <div className="sxSegmented">
            <button type="button" className={interval === "month" ? "on" : ""} aria-pressed={interval === "month"} disabled={step === 2} onClick={() => setBillingInterval("month")}>{c.monthly}</button>
            <button type="button" className={interval === "year" ? "on" : ""} aria-pressed={interval === "year"} disabled={step === 2} onClick={() => setBillingInterval("year")}>{c.yearly} <span className="ckSave">−{YEARLY_SAVE_PERCENT}%</span></button>
          </div>
        </div>
        <div className="ckPlan"><span className="ckPlanIcon"><LemiriGlyph size={20}/></span><div><b>Lemiri AI · {offer.name}</b><small>{offer.copy}</small></div><strong>{price.total}<small> / {price.per}</small></strong></div>
        {interval === "year" && <small className="ckYearNote">{price.price} {price.period} · {price.note}</small>}
        <ul>{offer.features.slice(0, 6).map(feature => <li key={feature}><Check size={13}/>{feature}</li>)}</ul>
        <div className="ckTotal"><span>{c.total}</span><strong>{price.total}</strong></div>
        <small>{c.taxes}</small>
        {interval === "year" && <small>{c.yearlyRenews}</small>}
        <small>{c.cancel}</small>
        <p className="ckMor">{c.mor}</p>
        <p className="ckLegal">{c.accept} <a href="/legal/terms" target="_blank">{c.terms}</a>, <a href="/legal/refund" target="_blank">{c.refund}</a> {c.and} <a href="/legal/privacy" target="_blank">{c.privacy}</a>.</p>
      </aside>
    </div>
  </main>;
}
