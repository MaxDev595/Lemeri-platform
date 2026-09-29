"use client";

import { useState } from "react";

export function ConnectSite({ locale, employees, problem, site, returnUrl, state, workspace }: { locale: "ru" | "en"; employees: { id: string; name: string; role: string }[]; problem: string; site: string; returnUrl: string; state: string; workspace: string }) {
  const ru = locale === "ru";
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (problem) return <p className="formError">{problem}</p>;
  const connect = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/widget/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeId, site, returnUrl, state }) });
      const body = await response.json().catch(() => ({})) as { redirect?: string };
      if (response.ok && body.redirect) { window.location.assign(body.redirect); return; }
      setError(ru ? "Не удалось подключить сайт. Попробуйте ещё раз." : "Could not connect the site. Please try again.");
    } catch { setError(ru ? "Нет соединения. Попробуйте ещё раз." : "Connection error. Please try again."); }
    setBusy(false);
  };
  return <div className="authForm connectSite">
    {workspace && <p className="connectWorkspace">{ru ? "Компания" : "Workspace"}: <b>{workspace}</b></p>}
    <fieldset className="connectEmployees"><legend>{ru ? "Какой ИИ-сотрудник будет отвечать на сайте?" : "Which AI employee answers on the site?"}</legend>
      {employees.map(employee => <label key={employee.id} className={employee.id === employeeId ? "on" : ""}><input type="radio" name="employee" value={employee.id} checked={employee.id === employeeId} onChange={() => setEmployeeId(employee.id)} /><span><b>{employee.name}</b><small>{employee.role}</small></span></label>)}
    </fieldset>
    {error && <p className="formError">{error}</p>}
    <button type="button" className="primary authSubmit" disabled={busy || !employeeId} onClick={connect}>{busy ? (ru ? "Подключаем…" : "Connecting…") : (ru ? "Подключить и вернуться на сайт" : "Connect and return to the site")}</button>
  </div>;
}
