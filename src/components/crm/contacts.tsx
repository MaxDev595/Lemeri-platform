"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { Download, Merge, Plus, Trash2, Upload, ExternalLink } from "lucide-react";
import { api, Avatar, CustomFieldsEditor, Drawer, Empty, EntityPicker, fill, MemberSelect, Modal, money, TagEditor, useCrm, when } from "./core";
import { CrmFailure, CrmSkeleton } from "./loader";
import { NoteComposer, TaskComposer, TaskRow, Timeline, type Activity, type Task } from "./panels";
import { DealCreateModal } from "./deals";

const CHANNEL_LABEL: Record<string, string> = { WEBSITE: "Сайт", TELEGRAM: "Telegram", WHATSAPP: "WhatsApp", EMAIL: "Email" };
type ContactRow = { id: string; name: string; phone: string | null; email: string | null; position: string | null; tags: string[]; source: string | null; lastActivityAt: string | null; createdAt: string; company: { id: string; name: string } | null; owner: { id: string; name: string } | null; channels: string[]; deals: number; openTasks: number; dealsAmount: number };

/** Minimal RFC 4180 CSV parser with ; or , delimiter detection. */
export function parseCsv(textRaw: string) {
  const text = textRaw.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; continue; }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}
const HEADER_MAP: Record<string, string> = { name: "name", "имя": "name", "фио": "name", "контакт": "name", phone: "phone", "телефон": "phone", "тел": "phone", email: "email", "почта": "email", "e-mail": "email", company: "company", "компания": "company", "организация": "company", position: "position", "должность": "position", tags: "tags", "теги": "tags", notes: "notes", "заметки": "notes", "комментарий": "notes", source: "source", "источник": "source" };

export function ContactsView() {
  const { c, locale, boot, notify, open, canWrite, isAdmin, refreshKey, bump } = useCrm();
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; rows: ContactRow[] } | null>(null); const [loadError, setLoadError] = useState<unknown>(null);
  const [q, setQ] = useState(""); const [tag, setTag] = useState(""); const [owner, setOwner] = useState(""); const [channel, setChannel] = useState(""); const [hasDeals, setHasDeals] = useState(""); const [sort, setSort] = useState("recent"); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false); const [dupes, setDupes] = useState(false); const [bulkTag, setBulkTag] = useState("");
  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50", sort, ...(q ? { q } : {}), ...(tag ? { tag } : {}), ...(owner ? { owner } : {}), ...(channel ? { channel } : {}), ...(hasDeals ? { hasDeals } : {}) });
    try { setData(await api(`contacts?${params}`)); setLoadError(null); } catch (error) { setLoadError(error); setData(prev => { if (prev) notify(c.failed); return prev; }); }
  }, [page, sort, q, tag, owner, channel, hasDeals, notify, c.failed]);
  useEffect(() => { const t = window.setTimeout(load, q ? 250 : 0); return () => window.clearTimeout(t); }, [load, q, refreshKey]);
  useEffect(() => { setPage(1); }, [q, tag, owner, channel, hasDeals, sort]);

  const bulk = async (action: string, value?: string | null) => {
    if (action === "delete" && !window.confirm(c.confirmDelete)) return;
    try { await api("contacts/bulk", { method: "POST", body: { ids: [...selected], action, value } }); setSelected(new Set()); notify(c.saved); bump(); load(); } catch { notify(c.failed); }
  };
  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    const rows = parseCsv(await file.text()); if (rows.length < 2) { notify(c.failed); return; }
    const header = rows[0].map(h => HEADER_MAP[h.trim().toLowerCase()] ?? "");
    const records = rows.slice(1).map(r => Object.fromEntries(header.map((key, i) => [key, (r[i] ?? "").trim()]).filter(([key, value]) => key && value)));
    try {
      let created = 0, updated = 0, skipped = 0;
      for (let i = 0; i < records.length; i += 500) { const res = await api<{ created: number; updated: number; skipped: number }>("contacts/import", { method: "POST", body: { rows: records.slice(i, i + 500) } }); created += res.created; updated += res.updated; skipped += res.skipped; }
      notify(fill(c.importDone, { created, updated, skipped })); bump(); load();
    } catch { notify(c.failed); }
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const allChecked = !!data?.rows.length && data.rows.every(r => selected.has(r.id));
  return <div className="crmPage">
    <div className="crmToolbar">
      <input className="crmSearch" value={q} onChange={e => setQ(e.target.value)} placeholder={c.search}/>
      {boot.tags.length > 0 && <select value={tag} onChange={e => setTag(e.target.value)}><option value="">{c.tags}: {c.all}</option>{boot.tags.map(t => <option key={t}>{t}</option>)}</select>}
      <select value={owner} onChange={e => setOwner(e.target.value)}><option value="">{c.owner}: {c.all}</option><option value="me">{c.mine}</option><option value="none">{c.none}</option>{boot.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <select value={channel} onChange={e => setChannel(e.target.value)}><option value="">{c.channels}: {c.all}</option>{Object.keys(CHANNEL_LABEL).map(k => <option key={k} value={k}>{CHANNEL_LABEL[k]}</option>)}</select>
      <select value={hasDeals} onChange={e => setHasDeals(e.target.value)}><option value="">{c.hasDeals}: {c.all}</option><option value="open">{c.withOpenDeals}</option><option value="none">{c.withoutDeals}</option></select>
      <select value={sort} onChange={e => setSort(e.target.value)} aria-label={c.sort}><option value="recent">{c.sortRecent}</option><option value="created">{c.sortCreated}</option><option value="name">{c.sortName}</option></select>
      <div className="crmSpacer"/>
      {isAdmin && <button type="button" className="crmBtn" onClick={() => setDupes(true)}><Merge size={15}/>{c.duplicates}</button>}
      <a className="crmBtn" href="/api/crm/contacts/export"><Download size={15}/>{c.exportCsv}</a>
      {canWrite && <label className="crmBtn" title={c.importHint}><Upload size={15}/>{c.importCsv}<input type="file" accept=".csv,text/csv" hidden onChange={importFile}/></label>}
      {canWrite && <button type="button" className="crmBtn primary" onClick={() => setCreating(true)}><Plus size={15}/>{c.newContact}</button>}
    </div>
    {selected.size > 0 && canWrite && <div className="crmBulk">
      <b>{fill(c.selected, { n: selected.size })}</b>
      <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} placeholder={c.tagPlaceholder} list="crm-bulk-tags"/><datalist id="crm-bulk-tags">{boot.tags.map(t => <option key={t} value={t}/>)}</datalist>
      <button type="button" className="crmBtn" disabled={!bulkTag.trim()} onClick={() => bulk("tag", bulkTag)}>{c.addTag}</button>
      <button type="button" className="crmBtn" disabled={!bulkTag.trim()} onClick={() => bulk("untag", bulkTag)}>{c.removeTag}</button>
      <select defaultValue="" onChange={e => { if (e.target.value) void bulk("assign", e.target.value === "none" ? null : e.target.value); e.target.value = ""; }}><option value="">{c.assign}…</option><option value="none">{c.none}</option>{boot.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      {isAdmin && <button type="button" className="crmBtn danger ghost" onClick={() => bulk("delete")}><Trash2 size={14}/>{c.bulkDelete}</button>}
    </div>}
    {!data ? (loadError ? <CrmFailure error={loadError} locale={locale} onRetry={load}/> : <CrmSkeleton locale={locale} variant="table" label={c.loading}/>) : data.rows.length === 0 ? <Empty title={c.noContacts} copy={c.emptyCopy}/> : <>
      <div className="crmTableWrap"><table className="crmTable"><thead><tr>
        {canWrite && <th className="chk"><input type="checkbox" checked={allChecked} onChange={e => setSelected(e.target.checked ? new Set(data.rows.map(r => r.id)) : new Set())} aria-label={c.all}/></th>}
        <th>{c.name}</th><th>{c.phone} / {c.email}</th><th>{c.company}</th><th>{c.channels}</th><th className="num">{c.dealsCol}</th><th>{c.owner}</th><th>{c.lastActivity}</th>
      </tr></thead><tbody>{data.rows.map(r => <tr key={r.id} onClick={() => open({ type: "contact", id: r.id })} className={selected.has(r.id) ? "sel" : ""}>
        {canWrite && <td className="chk" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(r.id)} onChange={e => setSelected(s => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} aria-label={r.name}/></td>}
        <td><div className="crmNameCell"><Avatar name={r.name}/><div><b>{r.name}</b>{r.position && <small>{r.position}</small>}{r.tags.length > 0 && <div className="crmCardTags">{r.tags.slice(0, 4).map(t => <span key={t} className="crmTag">{t}</span>)}</div>}</div></div></td>
        <td><div className="crmStack">{r.phone && <span>{r.phone}</span>}{r.email && <small>{r.email}</small>}</div></td>
        <td>{r.company?.name ?? "—"}</td>
        <td>{r.channels.map(ch => <span key={ch} className="crmChip">{CHANNEL_LABEL[ch] ?? ch}</span>)}{!r.channels.length && (r.source ?? "—")}</td>
        <td className="num">{r.deals ? <>{r.deals}<small className="crmMuted"> · {money(r.dealsAmount, "RUB", locale)}</small></> : "—"}</td>
        <td>{r.owner?.name ?? "—"}</td>
        <td>{when(r.lastActivityAt ?? r.createdAt, locale)}</td>
      </tr>)}</tbody></table></div>
      {pages > 1 && <div className="crmPager"><button type="button" className="crmBtn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button><span>{fill(c.page, { page, pages })}</span><button type="button" className="crmBtn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>→</button></div>}
    </>}
    {creating && <ContactCreateModal onClose={() => setCreating(false)} onCreated={id => { setCreating(false); bump(); load(); open({ type: "contact", id }); }}/>}
    {dupes && <DuplicatesModal onClose={() => { setDupes(false); load(); }}/>}
  </div>;
}

export function ContactCreateModal({ company, onClose, onCreated }: { company?: { id: string; name: string } | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { c, notify, boot } = useCrm();
  const [org, setOrg] = useState(company ?? null); const [tags, setTags] = useState<string[]>([]); const [owner, setOwner] = useState<string | null>(boot.members.find(m => m.me)?.id ?? null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const d = new FormData(e.currentTarget); setBusy(true);
    try { const contact = await api<{ id: string }>("contacts", { method: "POST", body: { name: String(d.get("name")), phone: String(d.get("phone") ?? ""), email: String(d.get("email") ?? ""), position: String(d.get("position") ?? ""), companyId: org?.id ?? null, ownerMemberId: owner, tags } }); onCreated(contact.id); }
    catch { notify(c.failed); setBusy(false); }
  };
  return <Modal title={c.newContact} onClose={onClose}><form className="crmForm" onSubmit={submit}>
    <label>{c.name}<input name="name" required maxLength={120} autoFocus/></label>
    <div className="crmRow2"><label>{c.phone}<input name="phone" type="tel" maxLength={40}/></label><label>{c.email}<input name="email" type="email" maxLength={200}/></label></div>
    <div className="crmRow2"><label>{c.company}<EntityPicker kind="companies" label={c.company} value={org} onChange={setOrg}/></label><label>{c.position}<input name="position" maxLength={120}/></label></div>
    <label>{c.owner}<MemberSelect value={owner} onChange={setOwner}/></label>
    <label>{c.tags}<TagEditor value={tags} onChange={setTags}/></label>
    <footer><button type="button" className="crmBtn" onClick={onClose}>{c.cancel}</button><button className="crmBtn primary" disabled={busy}>{c.create}</button></footer>
  </form></Modal>;
}

function DuplicatesModal({ onClose }: { onClose: () => void }) {
  const { c, locale, notify, bump } = useCrm();
  const [groups, setGroups] = useState<Array<{ key: string; contacts: Array<{ id: string; name: string; phone: string | null; email: string | null; createdAt: string }> }> | null>(null);
  const load = useCallback(() => api<typeof groups>("contacts/duplicates").then(setGroups).catch(() => notify(c.failed)), [notify, c.failed]);
  useEffect(() => { void load(); }, [load]);
  const merge = async (targetId: string, ids: string[]) => { try { await api("contacts/merge", { method: "POST", body: { targetId, sourceIds: ids.filter(i => i !== targetId) } }); notify(c.saved); bump(); load(); } catch { notify(c.failed); } };
  return <Modal title={c.duplicates} onClose={onClose}>
    {!groups ? <p className="crmMuted">{c.loading}</p> : !groups.length ? <p className="crmMuted">{c.noDuplicates}</p> : <ul className="crmDupes">{groups.map(g => <li key={g.key}>
      {g.contacts.map(ct => <div key={ct.id} className="crmDupeRow"><span><b>{ct.name}</b><small>{[ct.phone, ct.email, when(ct.createdAt, locale, false)].filter(Boolean).join(" · ")}</small></span><button type="button" className="crmBtn" onClick={() => merge(ct.id, g.contacts.map(x => x.id))}>{c.mergeInto}</button></div>)}
    </li>)}</ul>}
  </Modal>;
}

type ContactFull = ContactRow & { notes: string | null; customFields: Record<string, unknown> | null; companyId: string | null;
  conversations: Array<{ id: string; channelType: string; status: string; summary: string | null; updatedAt: string; messages: Array<{ direction: string; content: string; createdAt: string }> }>;
  deals: Array<{ id: string; title: string; amount: number; currency: string; status: string; stage: { name: string; color: string; kind: string } }>;
  crmTasks: Task[]; appointments: Array<{ id: string; service: string; startsAt: string; status: string }>; crmActivities: Activity[] };

export function ContactDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { c, locale, notify, open, canWrite, isAdmin, bump, boot, goConversations } = useCrm();
  const [contact, setContact] = useState<ContactFull | null>(null);
  const [tab, setTab] = useState<"timeline" | "deals" | "tasks" | "conversations">("timeline");
  const [newDeal, setNewDeal] = useState(false);
  const load = useCallback(async () => { try { setContact(await api<ContactFull>(`contacts/${id}`)); } catch { notify(c.failed); onClose(); } }, [id, notify, c.failed, onClose]);
  useEffect(() => { void load(); }, [load]);
  const patch = async (body: Record<string, unknown>) => { try { setContact(await api<ContactFull>(`contacts/${id}`, { method: "PATCH", body })); bump(); } catch { notify(c.failed); } };
  if (!contact) return <Drawer title={c.loading} onClose={onClose}><CrmSkeleton variant="list" label={c.loading}/></Drawer>;
  const remove = async () => { if (!window.confirm(c.confirmDelete)) return; try { await api(`contacts/${id}`, { method: "DELETE" }); bump(); onClose(); } catch { notify(c.failed); } };
  const field = (key: "name" | "phone" | "email" | "position", label: string, type = "text") => <label>{label}<input type={type} disabled={!canWrite} defaultValue={contact[key] ?? ""} key={`${key}-${contact[key]}`} onBlur={e => { const v = e.target.value.trim(); if (v !== (contact[key] ?? "") && (key !== "name" || v)) void patch({ [key]: v || null }); }}/></label>;
  const messageExtras = contact.conversations.map(v => ({ id: v.id, at: v.updatedAt, title: `${CHANNEL_LABEL[v.channelType] ?? v.channelType} · ${c.conversations}`, body: v.summary ?? v.messages[0]?.content?.slice(0, 280) ?? null, onClick: goConversations }));
  return <Drawer wide onClose={onClose} title={<span className="crmDrawerName"><Avatar name={contact.name}/>{contact.name}</span>}
    subtitle={[contact.position, contact.company?.name, contact.source].filter(Boolean).join(" · ")}
    actions={<>{canWrite && <button type="button" className="crmBtn" onClick={() => setNewDeal(true)}><Plus size={14}/>{c.newDeal}</button>}{isAdmin && <button type="button" className="crmIcon" onClick={remove} aria-label={c.delete}><Trash2 size={16}/></button>}</>}>
    <div className="crmDrawerGrid">
      <section className="crmPanel">
        <h4>{c.details}</h4>
        <div className="crmForm">
          {field("name", c.name)}
          <div className="crmRow2">{field("phone", c.phone, "tel")}{field("email", c.email, "email")}</div>
          {field("position", c.position)}
          <label>{c.company}<div className="crmPickRow"><EntityPicker kind="companies" label={c.company} disabled={!canWrite} value={contact.company} onChange={v => patch({ companyId: v?.id ?? null })}/>{contact.company && <button type="button" className="crmLink" onClick={() => open({ type: "company", id: contact.company!.id })}>→</button>}</div></label>
          <label>{c.owner}<MemberSelect disabled={!canWrite} value={contact.owner?.id} onChange={v => patch({ ownerMemberId: v })}/></label>
          <label>{c.tags}<TagEditor disabled={!canWrite} value={contact.tags} onChange={tags => patch({ tags })}/></label>
          <label>{c.notes}<textarea rows={3} disabled={!canWrite} defaultValue={contact.notes ?? ""} onBlur={e => { if (e.target.value !== (contact.notes ?? "")) void patch({ notes: e.target.value }); }}/></label>
          {boot.fields.some(f => f.entity === "CUSTOMER") && <><h5>{c.customFields}</h5><CustomFieldsEditor entity="CUSTOMER" disabled={!canWrite} value={contact.customFields} onChange={customFields => patch({ customFields })}/></>}
          <small className="crmMuted">{c.created}: {when(contact.createdAt, locale)}</small>
        </div>
      </section>
      <section className="crmPanel">
        <div className="crmTabs">{(["timeline", "deals", "tasks", "conversations"] as const).map(t => <button type="button" key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{c[t]}{t === "deals" && contact.deals.length ? ` · ${contact.deals.length}` : t === "tasks" && contact.crmTasks.filter(x => !x.completedAt).length ? ` · ${contact.crmTasks.filter(x => !x.completedAt).length}` : t === "conversations" && contact.conversations.length ? ` · ${contact.conversations.length}` : ""}</button>)}</div>
        {tab === "timeline" && <><NoteComposer target={{ customerId: contact.id }} onDone={load}/><Timeline activities={contact.crmActivities} extra={messageExtras} onChanged={load}/></>}
        {tab === "deals" && (contact.deals.length ? <ul className="crmMiniList">{contact.deals.map(d => <li key={d.id}><button type="button" onClick={() => open({ type: "deal", id: d.id })}><span className="crmStageDot" style={{ background: d.stage.color }}/><b>{d.title}</b><span>{d.stage.name}</span><strong>{money(d.amount, d.currency, locale)}</strong></button></li>)}</ul> : <p className="crmMuted">{c.noDeals}</p>)}
        {tab === "tasks" && <><TaskComposer target={{ customerId: contact.id }} onDone={load} compact/><ul className="crmTaskList">{contact.crmTasks.map(t => <TaskRow key={t.id} task={t} onChanged={load}/>)}</ul></>}
        {tab === "conversations" && (contact.conversations.length ? <ul className="crmMiniList">{contact.conversations.map(v => <li key={v.id}><button type="button" onClick={goConversations}><span className="crmChip">{CHANNEL_LABEL[v.channelType] ?? v.channelType}</span><span className="crmClamp">{v.summary ?? v.messages[0]?.content ?? "—"}</span><small>{when(v.updatedAt, locale)}</small><ExternalLink size={13}/></button></li>)}</ul> : <p className="crmMuted">{c.none}</p>)}
        {contact.appointments.length > 0 && tab === "timeline" && <><h5>{c.appointments}</h5><ul className="crmMiniList">{contact.appointments.map(a => <li key={a.id}><span><b>{a.service}</b> · {when(a.startsAt, locale)} · {a.status}</span></li>)}</ul></>}
      </section>
    </div>
    {newDeal && <DealCreateModal customer={{ id: contact.id, name: contact.name }} company={contact.company} onClose={() => setNewDeal(false)} onCreated={dealId => { setNewDeal(false); bump(); open({ type: "deal", id: dealId }); }}/>}
  </Drawer>;
}

// --------------------------------------------------------------- companies
type CompanyRow = { id: string; name: string; phone: string | null; email: string | null; website: string | null; industry: string | null; tags: string[]; owner: { id: string; name: string } | null; contacts: number; deals: number; wonAmount: number };
export function CompaniesView() {
  const { c, locale, notify, open, canWrite, refreshKey, bump } = useCrm();
  const [rows, setRows] = useState<CompanyRow[] | null>(null); const [loadError, setLoadError] = useState<unknown>(null); const [q, setQ] = useState(""); const [creating, setCreating] = useState(false);
  const load = useCallback(async () => { try { setRows(await api<CompanyRow[]>(`companies${q ? `?q=${encodeURIComponent(q)}` : ""}`)); setLoadError(null); } catch (error) { setLoadError(error); setRows(prev => { if (prev) notify(c.failed); return prev; }); } }, [q, notify, c.failed]);
  useEffect(() => { const t = window.setTimeout(load, q ? 250 : 0); return () => window.clearTimeout(t); }, [load, q, refreshKey]);
  const create = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const d = new FormData(e.currentTarget); try { const co = await api<{ id: string }>("companies", { method: "POST", body: { name: String(d.get("name")), phone: String(d.get("phone") ?? ""), email: String(d.get("email") ?? ""), website: String(d.get("website") ?? ""), industry: String(d.get("industry") ?? "") } }); setCreating(false); bump(); load(); open({ type: "company", id: co.id }); } catch { notify(c.failed); } };
  return <div className="crmPage">
    <div className="crmToolbar"><input className="crmSearch" value={q} onChange={e => setQ(e.target.value)} placeholder={c.search}/><div className="crmSpacer"/>{canWrite && <button type="button" className="crmBtn primary" onClick={() => setCreating(true)}><Plus size={15}/>{c.newCompany}</button>}</div>
    {!rows ? (loadError ? <CrmFailure error={loadError} locale={locale} onRetry={load}/> : <CrmSkeleton locale={locale} variant="table" label={c.loading}/>) : !rows.length ? <Empty title={c.noCompanies}/> : <div className="crmTableWrap"><table className="crmTable"><thead><tr><th>{c.company}</th><th>{c.industry}</th><th>{c.phone} / {c.email}</th><th className="num">{c.contacts}</th><th className="num">{c.dealsCol}</th><th className="num">{c.won}</th><th>{c.owner}</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id} onClick={() => open({ type: "company", id: r.id })}><td><div className="crmNameCell"><Avatar name={r.name}/><div><b>{r.name}</b>{r.website && <small>{r.website}</small>}</div></div></td><td>{r.industry ?? "—"}</td><td><div className="crmStack">{r.phone && <span>{r.phone}</span>}{r.email && <small>{r.email}</small>}</div></td><td className="num">{r.contacts}</td><td className="num">{r.deals}</td><td className="num">{r.wonAmount ? money(r.wonAmount, "RUB", locale) : "—"}</td><td>{r.owner?.name ?? "—"}</td></tr>)}
    </tbody></table></div>}
    {creating && <Modal title={c.newCompany} onClose={() => setCreating(false)}><form className="crmForm" onSubmit={create}>
      <label>{c.title}<input name="name" required maxLength={160} autoFocus/></label>
      <div className="crmRow2"><label>{c.phone}<input name="phone" maxLength={40}/></label><label>{c.email}<input name="email" maxLength={200}/></label></div>
      <div className="crmRow2"><label>{c.website}<input name="website" maxLength={300}/></label><label>{c.industry}<input name="industry" maxLength={120}/></label></div>
      <footer><button type="button" className="crmBtn" onClick={() => setCreating(false)}>{c.cancel}</button><button className="crmBtn primary">{c.create}</button></footer>
    </form></Modal>}
  </div>;
}

type CompanyFull = CompanyRow & { address: string | null; taxId: string | null; notes: string | null; customFields: Record<string, unknown> | null; contacts: Array<{ id: string; name: string; phone: string | null; email: string | null; position: string | null }>; deals: ContactFull["deals"]; crmTasks: Task[]; crmActivities: Activity[] } & { contactsCount?: number };
export function CompanyDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { c, locale, notify, open, canWrite, isAdmin, bump, boot } = useCrm();
  const [co, setCo] = useState<CompanyFull | null>(null); const [newContact, setNewContact] = useState(false); const [newDeal, setNewDeal] = useState(false);
  const load = useCallback(async () => { try { setCo(await api<CompanyFull>(`companies/${id}`)); } catch { notify(c.failed); onClose(); } }, [id, notify, c.failed, onClose]);
  useEffect(() => { void load(); }, [load]);
  const patch = async (body: Record<string, unknown>) => { try { setCo(await api<CompanyFull>(`companies/${id}`, { method: "PATCH", body })); bump(); } catch { notify(c.failed); } };
  if (!co) return <Drawer title={c.loading} onClose={onClose}><CrmSkeleton variant="list" label={c.loading}/></Drawer>;
  const remove = async () => { if (!window.confirm(c.confirmDelete)) return; try { await api(`companies/${id}`, { method: "DELETE" }); bump(); onClose(); } catch { notify(c.failed); } };
  const field = (key: "name" | "phone" | "email" | "website" | "address" | "industry" | "taxId", label: string) => <label>{label}<input disabled={!canWrite} defaultValue={co[key] ?? ""} key={`${key}-${co[key]}`} onBlur={e => { const v = e.target.value.trim(); if (v !== (co[key] ?? "") && (key !== "name" || v)) void patch({ [key]: v || null }); }}/></label>;
  return <Drawer wide onClose={onClose} title={<span className="crmDrawerName"><Avatar name={co.name}/>{co.name}</span>} subtitle={co.industry ?? undefined}
    actions={<>{canWrite && <button type="button" className="crmBtn" onClick={() => setNewDeal(true)}><Plus size={14}/>{c.newDeal}</button>}{isAdmin && <button type="button" className="crmIcon" onClick={remove} aria-label={c.delete}><Trash2 size={16}/></button>}</>}>
    <div className="crmDrawerGrid">
      <section className="crmPanel"><h4>{c.details}</h4><div className="crmForm">
        {field("name", c.title)}<div className="crmRow2">{field("phone", c.phone)}{field("email", c.email)}</div><div className="crmRow2">{field("website", c.website)}{field("industry", c.industry)}</div><div className="crmRow2">{field("address", c.address)}{field("taxId", c.taxId)}</div>
        <label>{c.owner}<MemberSelect disabled={!canWrite} value={co.owner?.id} onChange={v => patch({ ownerMemberId: v })}/></label>
        <label>{c.tags}<TagEditor disabled={!canWrite} value={co.tags} onChange={tags => patch({ tags })}/></label>
        <label>{c.notes}<textarea rows={3} disabled={!canWrite} defaultValue={co.notes ?? ""} onBlur={e => { if (e.target.value !== (co.notes ?? "")) void patch({ notes: e.target.value }); }}/></label>
        {boot.fields.some(f => f.entity === "COMPANY") && <><h5>{c.customFields}</h5><CustomFieldsEditor entity="COMPANY" disabled={!canWrite} value={co.customFields} onChange={customFields => patch({ customFields })}/></>}
      </div>
      <h4>{c.contacts}{canWrite && <button type="button" className="crmLink" onClick={() => setNewContact(true)}>+ {c.newContact}</button>}</h4>
      <ul className="crmMiniList">{co.contacts.map(ct => <li key={ct.id}><button type="button" onClick={() => open({ type: "contact", id: ct.id })}><Avatar name={ct.name}/><b>{ct.name}</b><span>{ct.position ?? ""}</span><small>{ct.phone ?? ct.email ?? ""}</small></button></li>)}</ul>
      </section>
      <section className="crmPanel">
        <h4>{c.deals}</h4>
        {co.deals.length ? <ul className="crmMiniList">{co.deals.map(d => <li key={d.id}><button type="button" onClick={() => open({ type: "deal", id: d.id })}><span className="crmStageDot" style={{ background: d.stage.color }}/><b>{d.title}</b><span>{d.stage.name}</span><strong>{money(d.amount, d.currency, locale)}</strong></button></li>)}</ul> : <p className="crmMuted">{c.noDeals}</p>}
        <h4>{c.tasks}</h4>
        <TaskComposer target={{ companyId: co.id }} onDone={load} compact/>
        <ul className="crmTaskList">{co.crmTasks.map(t => <TaskRow key={t.id} task={t} onChanged={load}/>)}</ul>
        <h4>{c.timeline}</h4>
        <NoteComposer target={{ companyId: co.id }} onDone={load}/>
        <Timeline activities={co.crmActivities} onChanged={load}/>
      </section>
    </div>
    {newContact && <ContactCreateModal company={{ id: co.id, name: co.name }} onClose={() => setNewContact(false)} onCreated={() => { setNewContact(false); load(); }}/>}
    {newDeal && <DealCreateModal company={{ id: co.id, name: co.name }} onClose={() => setNewDeal(false)} onCreated={dealId => { setNewDeal(false); bump(); open({ type: "deal", id: dealId }); }}/>}
  </Drawer>;
}
