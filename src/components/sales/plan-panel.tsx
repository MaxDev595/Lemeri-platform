"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, CreditCard, ExternalLink, Sparkles } from "lucide-react";
import type { Access } from "@/lib/billing/plans";
import { COMING_SOON, PLAN_OFFER } from "@/lib/billing/offer";

// Subscription: current plan and trial, AI reply allowance, Trial / Starter / Custom.
// Plan changes go through Stripe (checkout for a new subscription, in-place switch
// with proration for an existing one, customer portal for cards and cancellation).

type Billing = { access: Access; used: number; subscription: { plan: string; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; portal: boolean } | null; configured: { stripe: boolean; starter: boolean; custom: boolean } };

export function PlanPanel({ locale, notify, isOwner }: { locale: string; notify: (text: string) => void; isOwner: boolean }) {
  const ru = locale !== "en";
  const offer = PLAN_OFFER[ru ? "ru" : "en"];
  const [data, setData] = useState<Billing | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setFailed(false);
    try { const response = await fetch("/api/billing", { cache: "no-store" }); if (!response.ok) throw new Error(); setData(await response.json()); } catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const query = new URLSearchParams(window.location.search).get("billing"); if (query === "success") notify(ru ? "Оплата прошла — тариф обновится через минуту" : "Payment complete — the plan updates within a minute"); else if (query === "cancelled") notify(ru ? "Оплата отменена" : "Payment cancelled"); }, [notify, ru]);
  if (failed) return <div className="sxState"><p>{ru ? "Не удалось загрузить подписку" : "Couldn't load the subscription"}</p><button className="btn" onClick={() => void load()}>{ru ? "Повторить" : "Retry"}</button></div>;
  if (!data) return <div className="sxState"><span className="sxSpinner"/>{ru ? "Загружаем подписку…" : "Loading subscription…"}</div>;

  const { access } = data;
  const date = (iso: string) => new Date(iso).toLocaleDateString(ru ? "ru-RU" : "en-GB", { day: "numeric", month: "long" });
  const daysLeft = Math.max(0, Math.ceil((new Date(access.trialEndsAt).getTime() - Date.now()) / 86400_000));
  const share = Math.min(100, Math.round((data.used / Math.max(1, access.messageLimit)) * 100));
  const stateText = access.openAccess ? (ru ? "Идёт тестирование: все тарифы и функции открыты бесплатно. Об окончании предупредим заранее." : "Testing period: every plan and feature is free. We'll tell you before it ends.")
    : access.state === "trial" ? (ru ? `Пробный период: осталось ${daysLeft} дн. (до ${date(access.trialEndsAt)})` : `Trial: ${daysLeft} days left (until ${date(access.trialEndsAt)})`)
    : access.state === "active" ? (data.subscription?.cancelAtPeriodEnd ? (ru ? `Активна до ${date(data.subscription.currentPeriodEnd)}, затем отменится` : `Active until ${date(data.subscription.currentPeriodEnd)}, then cancels`) : (ru ? `Подписка активна${data.subscription ? ` · продление ${date(data.subscription.currentPeriodEnd)}` : ""}` : `Subscription active${data.subscription ? ` · renews ${date(data.subscription.currentPeriodEnd)}` : ""}`))
    : access.state === "past_due" ? (ru ? "Не удалось списать оплату — обновите карту, иначе ИИ остановится" : "Payment failed — update your card or the AI will stop")
    : (ru ? "Нет активного тарифа: ИИ не отвечает посетителям, они могут оставить заявку" : "No active plan: the AI is paused, visitors can still leave requests");
  const choose = async (plan: "STARTER" | "CUSTOM") => {
    setBusy(plan);
    try {
      const response = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "checkout", plan }) });
      const body = await response.json().catch(() => ({})) as { url?: string; changed?: boolean; error?: string };
      if (body.url) { window.location.assign(body.url); return; }
      if (body.changed) { notify(ru ? "Тариф изменён — разница пересчитается в следующем счёте" : "Plan changed — the difference is prorated"); await load(); return; }
      notify(body.error === "BILLING_PROVIDER_NOT_CONFIGURED" ? (ru ? "Оплата ещё не подключена" : "Payments are not set up yet") : (ru ? "Не удалось открыть оплату" : "Couldn't open checkout"));
    } finally { setBusy(""); }
  };
  const portal = async () => {
    setBusy("portal");
    try { const response = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "portal" }) }); const body = await response.json().catch(() => ({})) as { url?: string }; if (body.url) window.location.assign(body.url); else notify(ru ? "Не удалось открыть управление оплатой" : "Couldn't open billing portal"); }
    finally { setBusy(""); }
  };
  const paidActive = (access.state === "active" || access.state === "past_due") && access.plan !== "TRIAL";

  return <div className="sxPlans">
    <section className={`sxPlanNow ${access.state}`}>
      <div><span className="pageKicker"><CreditCard size={13}/>{ru ? "Текущий тариф" : "Current plan"}</span><h2>{access.openAccess ? (ru ? "Всё открыто" : "Everything unlocked") : offer[access.plan].name}</h2><p>{stateText}</p></div>
      <div className="sxUsage"><span>{ru ? "Ответы ИИ в этом периоде" : "AI replies this period"}</span><strong>{data.used.toLocaleString(ru ? "ru-RU" : "en-US")} <small>/ {access.messageLimit.toLocaleString(ru ? "ru-RU" : "en-US")}</small></strong><i><b style={{ width: `${share}%` }} className={share >= 90 ? "warn" : ""}/></i><small>{ru ? `Период: ${date(access.periodStart)} — ${date(access.periodEnd)}` : `Period: ${date(access.periodStart)} — ${date(access.periodEnd)}`}</small></div>
      {data.subscription?.portal && isOwner && <button className="btn" disabled={busy === "portal"} onClick={portal}><ExternalLink size={14}/>{ru ? "Оплата и счета" : "Billing & invoices"}</button>}
    </section>
    {access.openAccess && <p className="sxNote sxOpen"><Sparkles size={14}/>{ru ? "На время тестов вам доступно всё из Custom: полный редактор карточки, ИИ-подбор дизайна под сайт и повышенный лимит ответов. Оплата отключена." : "During testing you get everything in Custom: the full card editor, AI design matching and the higher reply limit. Payments are off."}</p>}
    {!access.openAccess && !data.configured.stripe && <p className="sxNote">{ru ? "Онлайн-оплата пока не подключена: выбрать платный тариф можно будет после настройки Stripe." : "Online payments aren't set up yet."}</p>}
    <div className="sxPlanGrid">
      {(["TRIAL", "STARTER", "CUSTOM"] as const).map(key => {
        const plan = offer[key]; const current = !access.openAccess && access.plan === key && (key === "TRIAL" ? access.state === "trial" : paidActive);
        const configured = key === "STARTER" ? data.configured.starter : key === "CUSTOM" ? data.configured.custom : false;
        return <article key={key} className={`sxPlan${key === "CUSTOM" ? " featured" : ""}${current ? " current" : ""}`}>
          {key === "CUSTOM" && <span className="sxBadge"><Sparkles size={12}/>{ru ? "Свой дизайн" : "Own design"}</span>}
          <h3>{plan.name}</h3>
          <div className="sxPrice"><strong>{plan.price}</strong><small>{plan.period}</small></div>
          <p>{plan.copy}</p>
          <ul>{plan.features.map(feature => <li key={feature}><Check size={14}/>{feature}</li>)}</ul>
          {access.openAccess ? <button className="btn" disabled><Check size={14}/>{ru ? "Открыто на время тестов" : "Unlocked for testing"}</button>
            : key === "TRIAL" ? <button className="btn" disabled>{access.state === "trial" ? (ru ? "Сейчас активен" : "Active now") : (ru ? "Один раз на аккаунт" : "Once per account")}</button>
            : current ? <button className="btn" disabled><Check size={14}/>{ru ? "Ваш тариф" : "Your plan"}</button>
            : <button className={key === "CUSTOM" ? "primary" : "btn"} disabled={!isOwner || !configured || Boolean(busy)} onClick={() => void choose(key)}>{busy === key ? "…" : !configured ? (ru ? "Оплата скоро" : "Coming soon") : paidActive ? (ru ? `Перейти на ${plan.name}` : `Switch to ${plan.name}`) : (ru ? `Выбрать ${plan.name}` : `Choose ${plan.name}`)}</button>}
        </article>;
      })}
    </div>
    {!isOwner && <p className="sxMuted">{ru ? "Менять тариф может только владелец." : "Only the owner can change the plan."}</p>}
    <section className="sxSoon"><h3><Clock3 size={15}/>{ru ? "Скоро появится" : "Coming soon"}</h3><p>{ru ? "Не входит в тарифы сейчас — расскажем, когда будет готово." : "Not part of any plan yet."}</p><ul>{COMING_SOON[ru ? "ru" : "en"].map(item => <li key={item}>{item}</li>)}</ul></section>
  </div>;
}

/** Dashboard notice about the trial, an ended plan or a nearly used allowance. Silent when all is fine. */
export function PlanBanner({ locale, onOpen }: { locale: string; onOpen: () => void }) {
  const ru = locale !== "en";
  const [data, setData] = useState<Billing | null>(null);
  useEffect(() => { fetch("/api/billing", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(setData).catch(() => undefined); }, []);
  if (!data) return null;
  const { access } = data;
  const share = data.used / Math.max(1, access.messageLimit);
  const days = Math.max(0, Math.ceil((new Date(access.trialEndsAt).getTime() - Date.now()) / 86400_000));
  const text = access.openAccess ? (share >= 0.8 ? (ru ? `Использовано ${Math.round(Math.min(1, share) * 100)}% ответов ИИ в этом периоде.` : `${Math.round(Math.min(1, share) * 100)}% of AI replies used.`) : (ru ? "Тестовый период: все тарифы и функции открыты бесплатно." : "Testing period: every plan and feature is free."))
    : access.state === "expired" ? (ru ? "Пробный период закончился — ИИ не отвечает посетителям. Выберите тариф, чтобы продолжить." : "Your trial ended — the AI is paused. Choose a plan to continue.")
    : access.state === "past_due" ? (ru ? "Не удалось списать оплату. Обновите карту, чтобы ИИ не остановился." : "Payment failed. Update your card to keep the AI running.")
    : share >= 1 ? (ru ? "Лимит ответов ИИ в этом периоде исчерпан — посетители видят просьбу оставить контакты." : "AI reply limit reached — visitors are asked to leave contacts.")
    : share >= 0.8 ? (ru ? `Использовано ${Math.round(share * 100)}% ответов ИИ в этом периоде.` : `${Math.round(share * 100)}% of AI replies used this period.`)
    : access.state === "trial" ? (ru ? `Пробный период: осталось ${days} дн.` : `Trial: ${days} days left.`) : "";
  if (!text) return null;
  const tone = access.openAccess ? (share >= 1 ? "bad" : "info") : access.state === "expired" || access.state === "past_due" || share >= 1 ? "bad" : "info";
  return <div className={`sxBanner ${tone}`} role="status"><span>{text}</span><button className={tone === "bad" ? "primary" : "btn"} onClick={onOpen}>{ru ? "Тарифы" : "Plans"}</button></div>;
}
