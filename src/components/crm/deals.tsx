"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Columns3, List, Plus, Settings2, Trash2, Trophy, XCircle, RotateCcw } from "lucide-react";
import { api, Avatar, CustomFieldsEditor, daysSince, Drawer, Empty, EntityPicker, MemberSelect, Modal, money, shortMoney, TagEditor, toInputDate, useCrm, when, type Stage } from "./core";
import { CrmFailure, CrmSkeleton } from "./loader";
import { NoteComposer, TaskComposer, TaskRow, Timeline, type Activity, type Task } from "./panels";

export type DealCard = { id: string; title: string; amount: number; currency: string; stageId: string; pipelineId: string; status: string; tags: string[]; sort: number; stageChangedAt: string; createdAt: string; expectedCloseAt: string | null; source: string | null; customer: { id: string; name: string; phone: string | null } | null; company: { id: string; name: string } | null; owner: { id: string; name: string } | null; openTasks: number; overdueTasks: number };

export function DealsView({ onSettings }: { onSettings: () => void }) {
  const { c, locale, boot, notify, open, canWrite, refreshKey, bump } = useCrm();
  const [pipelineId, setPipelineId] = useState(boot.pipelines[0]?.id ?? "");
  const pipeline = boot.pipelines.find(p => p.id === pipelineId) ?? boot.pipelines[0];
  const [deals, setDeals] = useState<DealCard[] | null>(null); const [loadError, setLoadError] = useState<unknown>(null);
  const [view, setView] = useState<"board" | "list">(() => { try { return (localStorage.getItem("crm:dealsView") as "board" | "list") || "board"; } catch { return "board"; } });
  const [q, setQ] = useState(""); const [owner, setOwner] = useState(""); const [tag, setTag] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<{ dealId: string; stageId: string; sort?: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null); const [overStage, setOverStage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!pipeline) return;
    const params = new URLSearchParams({ pipelineId: pipeline.id, ...(q ? { q } : {}), ...(owner ? { owner } : {}), ...(tag ? { tag } : {}) });
    try { setDeals(await api<DealCard[]>(`deals?${params}`)); setLoadError(null); } catch (error) { setLoadError(error); setDeals(prev => { if (prev) notify(c.failed); return prev; }); }
  }, [pipeline, q, owner, tag, notify, c.failed]);
  useEffect(() => { const t = window.setTimeout(load, q ? 250 : 0); return () => window.clearTimeout(t); }, [load, q, refreshKey]);
  useEffect(() => { try { localStorage.setItem("crm:dealsView", view); } catch { /* ignore */ } }, [view]);

  const byStage = useMemo(() => { const map = new Map<string, DealCard[]>(); for (const s of pipeline?.stages ?? []) map.set(s.id, []); for (const d of deals ?? []) map.get(d.stageId)?.push(d); for (const list of map.values()) list.sort((a, b) => a.sort - b.sort); return map; }, [deals, pipeline]);

  const move = async (dealId: string, stage: Stage, sort: number, lostReason?: string) => {
    setDeals(list => list?.map(d => d.id === dealId ? { ...d, stageId: stage.id, sort, status: stage.kind, stageChangedAt: d.stageId === stage.id ? d.stageChangedAt : new Date().toISOString() } : d) ?? null);
    try { await api(`deals/${dealId}/move`, { method: "POST", body: { stageId: stage.id, sort, lostReason } }); } catch { notify(c.failed); load(); }
  };
  const onDrop = (e: DragEvent, stage: Stage, beforeId?: string) => {
    e.preventDefault(); e.stopPropagation(); setOverStage(null);
    const dealId = e.dataTransfer.getData("text/deal") || dragId; setDragId(null);
    if (!dealId || !canWrite) return;
    const list = (byStage.get(stage.id) ?? []).filter(d => d.id !== dealId);
    const index = beforeId ? list.findIndex(d => d.id === beforeId) : list.length;
    const prev = list[index - 1]?.sort, next = list[index]?.sort;
    const sort = prev === undefined && next === undefined ? 0 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    const deal = deals?.find(d => d.id === dealId);
    if (stage.kind === "LOST" && deal?.stageId !== stage.id) { setLostFor({ dealId, stageId: stage.id, sort }); return; }
    void move(dealId, stage, sort);
  };

  if (!pipeline) return <Empty title={c.noDeals}/>;
  const totals = (list: DealCard[]) => list.reduce((s, d) => s + d.amount, 0);
  return <div className="crmPage">
    <div className="crmToolbar">
      {boot.pipelines.length > 1 && <select value={pipeline.id} onChange={e => setPipelineId(e.target.value)} aria-label={c.pipeline}>{boot.pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      <input className="crmSearch" value={q} onChange={e => setQ(e.target.value)} placeholder={c.search}/>
      <select value={owner} onChange={e => setOwner(e.target.value)} aria-label={c.owner}><option value="">{c.owner}: {c.all}</option><option value="me">{c.mine}</option>{boot.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      {boot.tags.length > 0 && <select value={tag} onChange={e => setTag(e.target.value)} aria-label={c.tags}><option value="">{c.tags}: {c.all}</option>{boot.tags.map(t => <option key={t}>{t}</option>)}</select>}
      <div className="crmSpacer"/>
      <div className="crmSegment"><button type="button" className={view === "board" ? "on" : ""} onClick={() => setView("board")}><Columns3 size={15}/>{c.board}</button><button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")}><List size={15}/>{c.list}</button></div>
      {boot.role !== "VIEWER" && ["OWNER", "ADMIN"].includes(boot.role) && <button type="button" className="crmIcon" onClick={onSettings} aria-label={c.settings} title={c.settings}><Settings2 size={17}/></button>}
      {canWrite && <button type="button" className="crmBtn primary" onClick={() => setCreating(pipeline.stages[0]?.id ?? null)}><Plus size={15}/>{c.newDeal}</button>}
    </div>
    {deals === null ? (loadError ? <CrmFailure error={loadError} locale={locale} onRetry={load}/> : <CrmSkeleton locale={locale} variant="board" label={c.loading}/>) : view === "board" ? <div className="crmBoard">
      {pipeline.stages.map(stage => { const list = byStage.get(stage.id) ?? []; return <section key={stage.id} className={`crmColumn k-${stage.kind.toLowerCase()}${overStage === stage.id ? " over" : ""}`} onDragOver={e => { if (canWrite) { e.preventDefault(); setOverStage(stage.id); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null); }} onDrop={e => onDrop(e, stage)}>
        <header style={{ borderTopColor: stage.color }}><div><b>{stage.name}</b><span>{list.length}</span></div><small>{money(totals(list), list[0]?.currency ?? "RUB", locale)}{stage.kind === "OPEN" && stage.probability ? ` · ${stage.probability}%` : ""}</small></header>
        <div className="crmColumnBody">
          {list.map(d => <article key={d.id} className={dragId === d.id ? "crmCard dragging" : "crmCard"} draggable={canWrite} onDragStart={e => { e.dataTransfer.setData("text/deal", d.id); e.dataTransfer.effectAllowed = "move"; setDragId(d.id); }} onDragEnd={() => { setDragId(null); setOverStage(null); }} onDragOver={e => { if (canWrite) e.preventDefault(); }} onDrop={e => onDrop(e, stage, d.id)} onClick={() => open({ type: "deal", id: d.id })} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") open({ type: "deal", id: d.id }); }}>
            <b>{d.title}</b>
            <strong>{money(d.amount, d.currency, locale)}</strong>
            {(d.customer || d.company) && <small>{[d.customer?.name, d.company?.name].filter(Boolean).join(" · ")}</small>}
            {d.tags.length > 0 && <div className="crmCardTags">{d.tags.slice(0, 3).map(t => <span key={t} className="crmTag">{t}</span>)}</div>}
            <footer>{d.owner ? <Avatar name={d.owner.name}/> : <span/>}<span className="crmMuted">{daysSince(d.stageChangedAt)} {c.days}</span>{d.overdueTasks > 0 ? <span className="crmBadge bad"><AlertCircle size={12}/>{d.overdueTasks}</span> : d.openTasks > 0 ? <span className="crmBadge">{d.openTasks}</span> : null}</footer>
          </article>)}
          {canWrite && stage.kind === "OPEN" && <button type="button" className="crmAddCard" onClick={() => setCreating(stage.id)}><Plus size={14}/>{c.newDeal}</button>}
        </div>
      </section>; })}
    </div> : deals.length === 0 ? <Empty title={c.noDeals} copy={c.emptyCopy}/> : <div className="crmTableWrap"><table className="crmTable"><thead><tr><th>{c.title}</th><th>{c.stage}</th><th className="num">{c.amount}</th><th>{c.contact}</th><th>{c.owner}</th><th>{c.expectedClose}</th><th>{c.created}</th></tr></thead><tbody>
      {deals.map(d => { const stage = pipeline.stages.find(s => s.id === d.stageId); return <tr key={d.id} onClick={() => open({ type: "deal", id: d.id })}><td><b>{d.title}</b>{d.tags.length > 0 && <div className="crmCardTags">{d.tags.map(t => <span key={t} className="crmTag">{t}</span>)}</div>}</td><td><span className="crmStageDot" style={{ background: stage?.color }}/>{stage?.name}</td><td className="num">{money(d.amount, d.currency, locale)}</td><td>{[d.customer?.name, d.company?.name].filter(Boolean).join(" · ") || "—"}</td><td>{d.owner?.name ?? "—"}</td><td>{d.expectedCloseAt ? when(d.expectedCloseAt, locale, false) : "—"}</td><td>{when(d.createdAt, locale, false)}</td></tr>; })}
      <tr className="crmTotalRow"><td colSpan={2}>{c.total}</td><td className="num">{shortMoney(totals(deals), locale)}</td><td colSpan={4}/></tr>
    </tbody></table></div>}
    {creating && <DealCreateModal pipelineId={pipeline.id} stageId={creating} onClose={() => setCreating(null)} onCreated={id => { setCreating(null); bump(); load(); open({ type: "deal", id }); }}/>}
    {lostFor && <LostReasonModal onClose={() => setLostFor(null)} onSubmit={reason => { const stage = pipeline.stages.find(s => s.id === lostFor.stageId)!; void move(lostFor.dealId, stage, lostFor.sort ?? 0, reason); setLostFor(null); }}/>}
  </div>;
}

export function LostReasonModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string) => void }) {
  const { c, locale } = useCrm();
  const presets = locale === "ru" ? ["Дорого", "Выбрал конкурента", "Нет бюджета", "Не отвечает", "Неактуально"] : ["Too expensive", "Chose a competitor", "No budget", "No response", "Not relevant"];
  const [reason, setReason] = useState("");
  return <Modal title={c.lostReasonPrompt} onClose={onClose} footer={<><button type="button" className="crmBtn" onClick={onClose}>{c.cancel}</button><button type="button" className="crmBtn danger" onClick={() => onSubmit(reason.trim())}>{c.markLost}</button></>}>
    <div className="crmChips">{presets.map(p => <button type="button" key={p} className={reason === p ? "crmChip on" : "crmChip"} onClick={() => setReason(p)}>{p}</button>)}</div>
    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={300} placeholder={c.lostReason}/>
  </Modal>;
}

export function DealCreateModal({ pipelineId, stageId, customer, company, onClose, onCreated }: { pipelineId?: string; stageId?: string; customer?: { id: string; name: string } | null; company?: { id: string; name: string } | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { c, notify, boot } = useCrm();
  const [contact, setContact] = useState(customer ?? null); const [org, setOrg] = useState(company ?? null);
  const [owner, setOwner] = useState<string | null>(boot.members.find(m => m.me)?.id ?? null);
  const [tags, setTags] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true);
    try {
      const deal = await api<{ id: string }>("deals", { method: "POST", body: { title: String(data.get("title")), amount: Number(data.get("amount") || 0), pipelineId, stageId, customerId: contact?.id ?? null, companyId: org?.id ?? null, ownerMemberId: owner, expectedCloseAt: String(data.get("expectedCloseAt") || "") || null, tags } });
      onCreated(deal.id);
    } catch { notify(c.failed); setBusy(false); }
  };
  return <Modal title={c.newDeal} onClose={onClose}>
    <form className="crmForm" onSubmit={submit}>
      <label>{c.title}<input name="title" required maxLength={200} autoFocus/></label>
      <div className="crmRow2"><label>{c.amount}<input name="amount" type="number" min={0} step="0.01" defaultValue={0}/></label><label>{c.expectedClose}<input name="expectedCloseAt" type="date"/></label></div>
      <label>{c.contact}<EntityPicker kind="contacts" label={c.contact} value={contact} onChange={setContact}/></label>
      <label>{c.company}<EntityPicker kind="companies" label={c.company} value={org} onChange={setOrg}/></label>
      <label>{c.owner}<MemberSelect value={owner} onChange={setOwner}/></label>
      <label>{c.tags}<TagEditor value={tags} onChange={setTags}/></label>
      <footer><button type="button" className="crmBtn" onClick={onClose}>{c.cancel}</button><button className="crmBtn primary" disabled={busy}>{c.create}</button></footer>
    </form>
  </Modal>;
}

type DealFull = DealCard & { lostReason: string | null; customFields: Record<string, unknown> | null; closedAt: string | null; stage: Stage; pipeline: { id: string; name: string; stages: Stage[] }; items: Array<{ id: string; productId: string | null; name: string; price: number; quantity: number; discount: number }>; crmTasks: Task[]; crmActivities: Activity[] };

export function DealDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { c, locale, notify, open, canWrite, bump, boot } = useCrm();
  const [deal, setDeal] = useState<DealFull | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const load = useCallback(async () => { try { setDeal(await api<DealFull>(`deals/${id}`)); } catch { notify(c.failed); onClose(); } }, [id, notify, c.failed, onClose]);
  useEffect(() => { void load(); }, [load]);
  const patch = async (body: Record<string, unknown>) => { try { setDeal(await api<DealFull>(`deals/${id}`, { method: "PATCH", body })); bump(); } catch { notify(c.failed); } };
  if (!deal) return <Drawer title={c.loading} onClose={onClose}><CrmSkeleton variant="list" label={c.loading}/></Drawer>;
  const won = deal.pipeline.stages.find(s => s.kind === "WON"), lost = deal.pipeline.stages.find(s => s.kind === "LOST"), firstOpen = deal.pipeline.stages.find(s => s.kind === "OPEN");
  const remove = async () => { if (!window.confirm(c.confirmDelete)) return; try { await api(`deals/${id}`, { method: "DELETE" }); bump(); onClose(); } catch { notify(c.failed); } };
  return <Drawer wide onClose={onClose}
    title={canWrite ? <input className="crmTitleInput" defaultValue={deal.title} onBlur={e => { const v = e.target.value.trim(); if (v && v !== deal.title) void patch({ title: v }); }}/> : deal.title}
    subtitle={<>{deal.pipeline.name} · {when(deal.createdAt, locale, false)}{deal.source ? ` · ${deal.source}` : ""}</>}
    actions={canWrite && <button type="button" className="crmIcon" onClick={remove} aria-label={c.delete}><Trash2 size={16}/></button>}>
    <div className="crmStages">{deal.pipeline.stages.map(s => <button type="button" key={s.id} disabled={!canWrite} className={s.id === deal.stageId ? "on" : deal.pipeline.stages.findIndex(x => x.id === s.id) < deal.pipeline.stages.findIndex(x => x.id === deal.stageId) && s.kind === "OPEN" ? "past" : ""} style={{ ["--stage" as string]: s.color }} onClick={() => s.kind === "LOST" ? setLostOpen(true) : s.id !== deal.stageId && patch({ stageId: s.id })}>{s.name}</button>)}</div>
    {canWrite && <div className="crmDealStatus">
      {deal.status === "OPEN" ? <>{won && <button type="button" className="crmBtn success" onClick={() => patch({ stageId: won.id })}><Trophy size={15}/>{c.markWon}</button>}{lost && <button type="button" className="crmBtn danger ghost" onClick={() => setLostOpen(true)}><XCircle size={15}/>{c.markLost}</button>}</>
        : <><span className={deal.status === "WON" ? "crmStatus won" : "crmStatus lost"}>{deal.status === "WON" ? c.won : c.lost}{deal.closedAt ? ` · ${when(deal.closedAt, locale, false)}` : ""}{deal.lostReason ? ` · ${deal.lostReason}` : ""}</span>{firstOpen && <button type="button" className="crmBtn" onClick={() => patch({ stageId: firstOpen.id })}><RotateCcw size={14}/>{c.reopen}</button>}</>}
    </div>}
    <div className="crmDrawerGrid">
      <section className="crmPanel">
        <h4>{c.details}</h4>
        <div className="crmForm">
          <div className="crmRow2"><label>{c.amount}<input type="number" min={0} step="0.01" disabled={!canWrite} defaultValue={deal.amount} key={deal.amount} onBlur={e => { const v = Number(e.target.value); if (v !== deal.amount) void patch({ amount: v }); }}/></label><label>{c.expectedClose}<input type="date" disabled={!canWrite} defaultValue={toInputDate(deal.expectedCloseAt)} onChange={e => patch({ expectedCloseAt: e.target.value || null })}/></label></div>
          <label>{c.contact}<div className="crmPickRow"><EntityPicker kind="contacts" label={c.contact} disabled={!canWrite} value={deal.customer} onChange={v => patch({ customerId: v?.id ?? null })}/>{deal.customer && <button type="button" className="crmLink" onClick={() => open({ type: "contact", id: deal.customer!.id })}>→</button>}</div></label>
          <label>{c.company}<div className="crmPickRow"><EntityPicker kind="companies" label={c.company} disabled={!canWrite} value={deal.company} onChange={v => patch({ companyId: v?.id ?? null })}/>{deal.company && <button type="button" className="crmLink" onClick={() => open({ type: "company", id: deal.company!.id })}>→</button>}</div></label>
          <label>{c.owner}<MemberSelect disabled={!canWrite} value={deal.owner?.id} onChange={v => patch({ ownerMemberId: v })}/></label>
          <label>{c.tags}<TagEditor disabled={!canWrite} value={deal.tags} onChange={tags => patch({ tags })}/></label>
          {boot.fields.some(f => f.entity === "DEAL") && <><h5>{c.customFields}</h5><CustomFieldsEditor entity="DEAL" disabled={!canWrite} value={deal.customFields} onChange={customFields => patch({ customFields })}/></>}
        </div>
        <DealItems deal={deal} onSaved={next => { setDeal(next); bump(); }}/>
      </section>
      <section className="crmPanel">
        <h4>{c.tasks}</h4>
        <TaskComposer target={{ dealId: deal.id, customerId: deal.customer?.id }} onDone={load} compact/>
        <ul className="crmTaskList">{deal.crmTasks.map(t => <TaskRow key={t.id} task={t} onChanged={load}/>)}</ul>
        <h4>{c.timeline}</h4>
        <NoteComposer target={{ dealId: deal.id }} onDone={load}/>
        <Timeline activities={deal.crmActivities} onChanged={load}/>
      </section>
    </div>
    {lostOpen && lost && <LostReasonModal onClose={() => setLostOpen(false)} onSubmit={reason => { setLostOpen(false); void patch({ stageId: lost.id, lostReason: reason || null }); }}/>}
  </Drawer>;
}

function DealItems({ deal, onSaved }: { deal: DealFull; onSaved: (deal: DealFull) => void }) {
  const { c, locale, boot, notify, canWrite } = useCrm();
  const [items, setItems] = useState(deal.items.map(i => ({ ...i })));
  const [dirty, setDirty] = useState(false); const [sync, setSync] = useState(true);
  useEffect(() => { setItems(deal.items.map(i => ({ ...i }))); setDirty(false); }, [deal.items]);
  const total = items.reduce((s, i) => s + i.price * i.quantity * (1 - i.discount / 100), 0);
  const set = (index: number, patch: Partial<(typeof items)[number]>) => { setItems(list => list.map((item, i) => i === index ? { ...item, ...patch } : item)); setDirty(true); };
  const save = async () => { try { onSaved(await api<DealFull>(`deals/${deal.id}/items`, { method: "PUT", body: { items: items.filter(i => i.name.trim()).map(({ productId, name, price, quantity, discount }) => ({ productId, name, price: Number(price), quantity: Number(quantity) || 1, discount: Number(discount) || 0 })), syncAmount: sync } })); notify(c.saved); } catch { notify(c.failed); } };
  return <div className="crmItems">
    <h5>{c.items}</h5>
    {items.length > 0 && <table className="crmTable compact"><thead><tr><th>{c.product}</th><th className="num">{c.price}</th><th className="num">{c.qty}</th><th className="num">%</th><th/></tr></thead><tbody>
      {items.map((item, index) => <tr key={item.id ?? index}>
        <td><input disabled={!canWrite} list="crm-products" value={item.name} onChange={e => { const product = boot.products.find(p => p.name === e.target.value); set(index, product ? { name: product.name, productId: product.id, price: product.price } : { name: e.target.value, productId: null }); }}/></td>
        <td className="num"><input disabled={!canWrite} type="number" min={0} step="0.01" value={item.price} onChange={e => set(index, { price: Number(e.target.value) })}/></td>
        <td className="num"><input disabled={!canWrite} type="number" min={0} step="0.001" value={item.quantity} onChange={e => set(index, { quantity: Number(e.target.value) })}/></td>
        <td className="num"><input disabled={!canWrite} type="number" min={0} max={100} value={item.discount} onChange={e => set(index, { discount: Number(e.target.value) })}/></td>
        <td>{canWrite && <button type="button" className="crmIcon tiny" onClick={() => { setItems(list => list.filter((_, i) => i !== index)); setDirty(true); }} aria-label={c.delete}><Trash2 size={13}/></button>}</td>
      </tr>)}
      <tr className="crmTotalRow"><td>{c.total}</td><td className="num" colSpan={3}>{money(total, deal.currency, locale)}</td><td/></tr>
    </tbody></table>}
    <datalist id="crm-products">{boot.products.map(p => <option key={p.id} value={p.name}>{money(p.price, p.currency, locale)}</option>)}</datalist>
    {canWrite && <div className="crmItemsActions"><button type="button" className="crmBtn" onClick={() => { setItems(list => [...list, { id: `new-${Date.now()}`, productId: null, name: "", price: 0, quantity: 1, discount: 0 }]); setDirty(true); }}><Plus size={14}/>{c.addItem}</button>{dirty && <><label className="crmCheckLabel"><input type="checkbox" checked={sync} onChange={e => setSync(e.target.checked)}/>{c.syncAmount}</label><button type="button" className="crmBtn primary" onClick={save}>{c.save}</button></>}</div>}
  </div>;
}
