"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw, Sparkles, UserPlus, X } from "lucide-react";
import { Drawer } from "../crm/core";
import { POSITION_GROUPS, positionLabel } from "@/lib/team/catalog";
import { hub, TeamAvatar, when, type Member } from "./parts";

type JoinState = { code: string; requests: Array<{ id: string; name: string; email: string; position: string | null; createdAt: string }> };

export function ManageTeam({ members, me, locale, notify, onClose, onChanged, children }: { members: Member[]; me: string; locale: string; notify: (text: string) => void; onClose: () => void; onChanged: () => void; children: ReactNode }) {
  const ru = locale !== "en";
  const [join, setJoin] = useState<JoinState | null>(null);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const load = useCallback(() => hub<JoinState>("join").then(setJoin).catch(() => notify(ru ? "Не удалось загрузить заявки" : "Couldn't load requests")), [notify, ru]);
  useEffect(() => { void load(); }, [load]);
  const link = typeof window !== "undefined" ? `${window.location.origin}/register` : "";
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); notify(ru ? "Скопировано" : "Copied"); } catch { notify(value); } };
  const decide = async (id: string, decision: "approve" | "reject") => { try { setJoin(await hub<JoinState>(`join/${id}`, { method: "POST", body: { decision, role: roles[id] } })); notify(decision === "approve" ? (ru ? "Сотрудник добавлен в команду" : "Teammate added") : (ru ? "Заявка отклонена" : "Request declined")); onChanged(); } catch { notify(ru ? "Не удалось обработать заявку" : "Couldn't process the request"); } };
  const patch = async (memberId: string, body: Record<string, unknown>) => { try { await hub(`members/${memberId}`, { method: "PATCH", body }); onChanged(); notify(ru ? "Сохранено" : "Saved"); } catch { notify(ru ? "Не удалось сохранить" : "Couldn't save"); } };
  const seats = members.filter(m => m.aiSeat && !["OWNER", "ADMIN"].includes(m.role)).length;

  return <Drawer wide title={ru ? "Управление командой" : "Manage team"} subtitle={ru ? "Приглашения, должности и ИИ для сотрудников" : "Invitations, positions and AI for teammates"} onClose={onClose}>
    <div className="thManage">
      <section className="thManageCard">
        <h4><UserPlus size={16}/>{ru ? "Код компании для сотрудников" : "Company code for employees"}</h4>
        <p className="thMuted">{ru ? "Сотрудник регистрируется как «Сотрудник», выбирает должность и вводит этот код. Вы подтверждаете заявку здесь." : "An employee signs up as “Employee”, picks a position and enters this code. You approve the request here."}</p>
        <div className="thCodeRow"><code className="thCode">{join?.code ?? "········"}</code><button type="button" className="thBtn" onClick={() => join && copy(join.code)}><Copy size={14}/>{ru ? "Код" : "Code"}</button><button type="button" className="thBtn" onClick={() => copy(`${ru ? "Регистрация" : "Sign up"}: ${link}\n${ru ? "Код компании" : "Company code"}: ${join?.code ?? ""}`)}><Copy size={14}/>{ru ? "Приглашение" : "Invite text"}</button><button type="button" className="thIcon" title={ru ? "Сменить код" : "New code"} onClick={() => hub<JoinState>("join/rotate", { method: "POST" }).then(setJoin).then(() => notify(ru ? "Код обновлён — старый больше не работает" : "Code changed — the old one no longer works"))}><RefreshCw size={15}/></button></div>
        {join && join.requests.length > 0 && <div className="thRequests"><h5>{ru ? "Ждут подтверждения" : "Waiting for approval"}</h5>{join.requests.map(r => <div key={r.id} className="thRequest"><TeamAvatar name={r.name} size={32}/><div><b>{r.name}</b><small>{positionLabel(r.position, locale) || (ru ? "Должность не указана" : "No position")} · {r.email} · {when(r.createdAt, locale)}</small></div>
          <select value={roles[r.id] ?? ""} onChange={e => setRoles(v => ({ ...v, [r.id]: e.target.value }))} aria-label={ru ? "Роль" : "Role"}><option value="">{ru ? "Роль по должности" : "Role by position"}</option><option value="ADMIN">{ru ? "Администратор" : "Admin"}</option><option value="MANAGER">{ru ? "Менеджер" : "Manager"}</option><option value="VIEWER">{ru ? "Наблюдатель" : "Viewer"}</option></select>
          <button type="button" className="thBtn primary" onClick={() => decide(r.id, "approve")}><Check size={14}/>{ru ? "Принять" : "Approve"}</button><button type="button" className="thIcon" title={ru ? "Отклонить" : "Decline"} onClick={() => decide(r.id, "reject")}><X size={15}/></button></div>)}</div>}
      </section>

      <section className="thManageCard">
        <h4><Sparkles size={16}/>{ru ? "Должности и ИИ для сотрудников" : "Positions and AI for teammates"}</h4>
        <p className="thMuted">{ru ? <>Базовый доступ сотрудника бесплатный: мессенджер, задания и отчёты. «Сотрудник+ ИИ» добавляет помощника, который пишет и проверяет отчёты. Владелец и администраторы пользуются ИИ всегда. Сейчас включено мест: <b>{seats}</b>.</> : <>Basic employee access is free: messenger, tasks and reports. Employee+ AI adds an assistant that writes and checks reports. Owners and admins always have AI. Seats enabled: <b>{seats}</b>.</>}</p>
        <div className="thSeats">{members.map(m => { const admin = ["OWNER", "ADMIN"].includes(m.role); return <div key={m.id} className="thSeat"><TeamAvatar name={m.name} size={32}/><div><b>{m.name}{m.id === me && <small> · {ru ? "вы" : "you"}</small>}</b><small>{m.email}</small></div>
          <select value={m.position ?? ""} onChange={e => patch(m.id, { position: e.target.value })} aria-label={ru ? "Должность" : "Position"}><option value="">{ru ? "Должность…" : "Position…"}</option>{POSITION_GROUPS.map(g => <optgroup key={g.key} label={ru ? g.ru : g.en}>{g.items.map(i => <option key={i.key} value={i.key}>{ru ? i.ru : i.en}</option>)}</optgroup>)}</select>
          {admin ? <span className="thPill ok"><Sparkles size={11}/>{ru ? "ИИ включён" : "AI on"}</span> : <button type="button" role="switch" aria-checked={m.aiSeat} className={m.aiSeat ? "switch on" : "switch"} onClick={() => patch(m.id, { aiSeat: !m.aiSeat })} aria-label={ru ? "ИИ для сотрудника" : "AI for teammate"}><i/></button>}
        </div>; })}</div>
        <p className="thDisclaimer">{ru ? "Оплата мест «Сотрудник+ ИИ» подключится вместе с платёжной системой; сейчас места включаются бесплатно." : "Billing for Employee+ AI seats will start once payments are connected; seats are free for now."}</p>
      </section>

      <section className="thManageCard legacy"><h4>{ru ? "Участники и приглашения по email" : "Members and email invitations"}</h4>{children}</section>
    </div>
  </Drawer>;
}
