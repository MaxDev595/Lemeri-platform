"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Search } from "lucide-react";
import { POSITION_GROUPS, positionLabel } from "@/lib/team/catalog";

type State = { accountType: string; position: string | null; member: boolean; requests: Array<{ id: string; status: string; workspace: string; position: string | null; createdAt: string }> };

export function JoinCompany({ locale, name, hasCompany }: { locale: string; name: string; hasCompany: boolean }) {
  const ru = locale !== "en";
  const [state, setState] = useState<State | null>(null);
  const [position, setPosition] = useState<string>("");
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"position" | "code">("position");

  const load = async () => { const r = await fetch("/api/crm/team/employee/join", { cache: "no-store" }); if (r.ok) { const s = await r.json() as State; setState(s); if (s.position) setPosition(p => p || s.position!); } };
  useEffect(() => { void load(); }, []);
  // While a request waits for approval, check every few seconds and open the workspace once approved.
  const pending = state?.requests.find(r => r.status === "PENDING");
  useEffect(() => {
    if (!pending && !state?.member) return;
    if (state?.member) { window.location.assign("/app"); return; }
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [pending, state?.member]);

  const groups = useMemo(() => {
    const qq = query.trim().toLowerCase();
    return POSITION_GROUPS.map(g => ({ ...g, items: g.items.filter(i => !qq || i.ru.toLowerCase().includes(qq) || i.en.toLowerCase().includes(qq)) })).filter(g => g.items.length);
  }, [query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/crm/team/employee/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ position, code }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) setError(body.error === "CODE_NOT_FOUND" ? (ru ? "Код не найден. Проверьте его у руководителя." : "Code not found. Check it with your manager.") : body.error === "RATE_LIMITED" ? (ru ? "Слишком много попыток. Попробуйте через 15 минут." : "Too many attempts. Try again in 15 minutes.") : (ru ? "Не получилось отправить запрос." : "Couldn't send the request."));
      else setState(body as State);
    } finally { setBusy(false); }
  };

  if (!state) return <p className="joinMuted">{ru ? "Загрузка…" : "Loading…"}</p>;
  if (pending) return <div className="joinWait">
    <span className="joinWaitIcon"><Clock3 size={24}/></span>
    <h3>{ru ? "Запрос отправлен" : "Request sent"}</h3>
    <p>{ru ? <>Компания <b>{pending.workspace}</b> получила ваш запрос. Как только руководитель подтвердит его, кабинет откроется сам.</> : <><b>{pending.workspace}</b> received your request. The workspace opens as soon as your manager approves it.</>}</p>
    <small>{positionLabel(pending.position, locale)}</small>
    <button type="button" className="joinLink" onClick={() => setState({ ...state, requests: state.requests.filter(r => r.id !== pending.id) })}>{ru ? "Ввести другой код" : "Use another code"}</button>
  </div>;

  return <form className="joinForm" onSubmit={submit}>
    <div className="joinSteps"><span className={step === "position" ? "on" : "done"}>{step === "code" ? <Check size={12}/> : 1}</span><i/><span className={step === "code" ? "on" : ""}>2</span></div>
    {step === "position" ? <>
      <p className="joinHello">{ru ? `${name.split(" ")[0]}, кем вы работаете?` : `${name.split(" ")[0]}, what's your role?`}</p>
      <label className="joinSearch"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={ru ? "Найти должность…" : "Find a position…"} aria-label={ru ? "Поиск должности" : "Search position"}/></label>
      <div className="joinPositions">{groups.map(g => <fieldset key={g.key}><legend>{ru ? g.ru : g.en}</legend><div>{g.items.map(i => <button type="button" key={i.key} className={position === i.key ? "on" : ""} aria-pressed={position === i.key} onClick={() => setPosition(i.key)}>{ru ? i.ru : i.en}</button>)}</div></fieldset>)}</div>
      <button type="button" className="primary authSubmit" disabled={!position} onClick={() => setStep("code")}>{ru ? "Дальше" : "Next"}</button>
    </> : <>
      <p className="joinHello">{ru ? "Код компании" : "Company code"} <small>· {positionLabel(position, locale)} <button type="button" className="joinLink" onClick={() => setStep("position")}>{ru ? "изменить" : "change"}</button></small></p>
      <input className="joinCode" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} placeholder="AB12CD34" autoFocus aria-label={ru ? "Код компании" : "Company code"} autoComplete="off"/>
      <p className="joinMuted">{ru ? "Код есть у руководителя в разделе «Команда». Если вам прислали ссылку-приглашение — просто откройте её." : "Your manager finds it in the Team tab. If you got an invite link, just open it."}</p>
      {error && <p className="formError">{error}</p>}
      <button className="primary authSubmit" disabled={busy || code.length < 6}>{busy ? (ru ? "Отправляем…" : "Sending…") : (ru ? "Отправить запрос" : "Send request")}</button>
    </>}
    {hasCompany && <a className="joinLink" href="/app">{ru ? "У меня уже есть компания — открыть кабинет" : "I already have a company — open workspace"}</a>}
  </form>;
}
