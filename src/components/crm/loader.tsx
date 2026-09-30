"use client";

// Loading skeletons and the error card with a retry button for the CRM.
// Kept dependency-free so the cabinet can show it while the CRM chunk downloads.

import { useState } from "react";
import { RotateCw, WifiOff } from "lucide-react";

type Variant = "board" | "table" | "list" | "report";
const isEn = (locale?: string) => locale === "en";

export function CrmSkeleton({ variant = "board", locale, label, tabs = false }: { variant?: Variant; locale?: string; label?: string; tabs?: boolean }) {
  const text = label ?? (isEn(locale) ? "Loading CRM…" : "Загружаем CRM…");
  return <div className="crmLoad" role="status" aria-live="polite" aria-busy="true">
    {tabs && <div className="crmLoadTabs">{[64, 76, 72, 58, 110, 60, 78].map((w, i) => <i key={i} style={{ width: w }}/>)}</div>}
    <div className="crmLoadHead">
      <span className="crmLoadOrb" aria-hidden="true"><i/><i/><i/></span>
      <b>{text}</b>
      <span className="crmLoadBar" aria-hidden="true"><i/></span>
    </div>
    {variant === "board" && <div className="crmLoadBoard" aria-hidden="true">{[3, 2, 4, 1].map((cards, col) => <div key={col} className="crmLoadCol" style={{ ["--d" as string]: `${col * 90}ms` }}>
      <i className="crmSk h"/><i className="crmSk s"/>{Array.from({ length: cards }, (_, n) => <div key={n} className="crmLoadCard"><i className="crmSk"/><i className="crmSk s"/><i className="crmSk xs"/></div>)}
    </div>)}</div>}
    {(variant === "table" || variant === "list") && <div className="crmLoadTable" aria-hidden="true">{Array.from({ length: variant === "table" ? 7 : 5 }, (_, r) => <div key={r} className="crmLoadRow" style={{ ["--d" as string]: `${r * 60}ms` }}>
      <i className="crmSk dot"/><i className="crmSk w40"/><i className="crmSk w20"/>{variant === "table" && <i className="crmSk w15"/>}
    </div>)}</div>}
    {variant === "report" && <div className="crmLoadReport" aria-hidden="true">
      <div className="crmLoadKpis">{[0, 1, 2, 3].map(k => <div key={k} className="crmLoadCard"><i className="crmSk s"/><i className="crmSk h"/></div>)}</div>
      <div className="crmLoadChart">{[40, 65, 50, 80, 58, 90, 72].map((h, k) => <i key={k} className="crmSk" style={{ height: `${h}%`, ["--d" as string]: `${k * 70}ms` }}/>)}</div>
    </div>}
  </div>;
}

type Failure = { status?: number; code?: string; message?: string; detail?: string };
function describe(error: unknown, en: boolean) {
  const e = (error ?? {}) as Failure;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) return { title: en ? "No internet connection" : "Нет подключения к интернету", copy: en ? "Check the connection and try again." : "Проверьте соединение и попробуйте снова." };
  if (e.status === 401) return { title: en ? "Session expired" : "Сессия истекла", copy: en ? "Sign in again to open the CRM." : "Войдите снова, чтобы открыть CRM." };
  if (e.status === 403) return { title: en ? "No access to the CRM" : "Нет доступа к CRM", copy: en ? "Ask the workspace owner for access." : "Попросите владельца компании выдать доступ." };
  return { title: en ? "Couldn't load the CRM" : "Не удалось загрузить CRM", copy: en ? "The server didn't respond in time. It usually helps to try again." : "Сервер не ответил вовремя. Обычно помогает повторить попытку." };
}

export function CrmFailure({ error, onRetry, locale, compact = false }: { error: unknown; onRetry: () => Promise<unknown> | void; locale?: string; compact?: boolean }) {
  const en = isEn(locale);
  const [busy, setBusy] = useState(false);
  const { title, copy } = describe(error, en);
  const e = (error ?? {}) as Failure;
  const code = [e.code && e.code !== String(e.status) ? e.code : "", e.status ? `HTTP ${e.status}` : ""].filter(Boolean).join(" · ");
  const retry = async () => { if (busy) return; setBusy(true); try { await onRetry(); } finally { setBusy(false); } };
  if (e.status === 401 && typeof window !== "undefined") return <div className={`crmFail${compact ? " compact" : ""}`} role="alert">
    <span className="crmFailIcon"><WifiOff size={22}/></span><h3>{title}</h3><p>{copy}</p>
    <a className="crmRetry" href={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}>{en ? "Sign in" : "Войти"}</a>
  </div>;
  return <div className={`crmFail${compact ? " compact" : ""}`} role="alert">
    <span className="crmFailIcon"><WifiOff size={22}/></span>
    <h3>{title}</h3>
    <p>{copy}</p>
    {code && <code>{code}</code>}
    {e.detail && <details className="crmFailMore"><summary>{en ? "Details" : "Подробнее"}</summary><p>{e.detail}</p><a href="/api/crm/health" target="_blank" rel="noreferrer">{en ? "Open diagnostics" : "Открыть диагностику"}</a></details>}
    <button type="button" className="crmRetry" onClick={retry} disabled={busy} aria-busy={busy}>
      <RotateCw size={16} className={busy ? "spin" : ""}/>{busy ? (en ? "Retrying…" : "Пробуем снова…") : (en ? "Try again" : "Повторить")}
    </button>
  </div>;
}
