"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { api, Empty, Modal, money, shortMoney, useCrm, type FieldDef, type Pipeline, type Product } from "./core";
import { TaskComposer, TaskRow, taskBucket, type Task } from "./panels";

// ------------------------------------------------------------------ tasks
export function TasksView() {
  const { c, notify, refreshKey, boot } = useCrm();
  const [scope, setScope] = useState<"mine" | "all">("mine"); const [showDone, setShowDone] = useState(false);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const load = useCallback(async () => { try { setTasks(await api<Task[]>(`tasks?status=${showDone ? "all" : "open"}${scope === "mine" ? "&scope=mine" : ""}`)); } catch { notify(c.failed); } }, [scope, showDone, notify, c.failed]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const groups: Array<[string, string]> = [["overdue", c.overdue], ["today", c.today], ["tomorrow", c.tomorrow], ["later", c.later], ["noDue", c.noDue], ["done", c.done]];
  return <div className="crmPage">
    <div className="crmToolbar">
      <div className="crmSegment"><button type="button" className={scope === "mine" ? "on" : ""} onClick={() => setScope("mine")}>{c.mine}</button><button type="button" className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>{c.all}</button></div>
      <label className="crmCheckLabel"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)}/>{c.showDone}</label>
    </div>
    {boot.role !== "VIEWER" && <div className="crmCardBox"><TaskComposer target={{}} onDone={load}/></div>}
    {!tasks ? <p className="crmMuted pad">{c.loading}</p> : !tasks.length ? <Empty title={c.noTasks}/> : <div className="crmTaskGroups">{groups.map(([key, label]) => { const list = tasks.filter(t => taskBucket(t) === key); if (!list.length) return null; return <section key={key} className={`crmTaskGroup g-${key}`}><h4>{label}<span>{list.length}</span></h4><ul className="crmTaskList">{list.map(t => <TaskRow key={t.id} task={t} onChanged={load} showLinks/>)}</ul></section>; })}</div>}
  </div>;
}

// ------------------------------------------------------------------ products
export function ProductsView() {
  const { c, locale, notify, canWrite, refreshKey, reloadBoot } = useCrm();
  const [rows, setRows] = useState<Product[] | null>(null); const [editing, setEditing] = useState<Product | "new" | null>(null);
  const load = useCallback(async () => { try { setRows(await api<Product[]>("products")); } catch { notify(c.failed); } }, [notify, c.failed]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const d = new FormData(e.currentTarget);
    const body = { name: String(d.get("name")), sku: String(d.get("sku") ?? ""), category: String(d.get("category") ?? ""), description: String(d.get("description") ?? ""), price: Number(d.get("price") || 0), durationMin: d.get("durationMin") ? Number(d.get("durationMin")) : null, active: d.get("active") === "on" };
    try { await api(editing === "new" ? "products" : `products/${(editing as Product).id}`, { method: editing === "new" ? "POST" : "PATCH", body }); setEditing(null); load(); void reloadBoot(); } catch { notify(c.failed); }
  };
  const remove = async (p: Product) => { if (!window.confirm(c.confirmDelete)) return; try { await api(`products/${p.id}`, { method: "DELETE" }); setEditing(null); load(); void reloadBoot(); } catch { notify(c.failed); } };
  const item = editing && editing !== "new" ? editing : null;
  return <div className="crmPage">
    <div className="crmToolbar"><div className="crmSpacer"/>{canWrite && <button type="button" className="crmBtn primary" onClick={() => setEditing("new")}><Plus size={15}/>{c.newProduct}</button>}</div>
    {!rows ? <p className="crmMuted pad">{c.loading}</p> : !rows.length ? <Empty title={c.noProducts}/> : <div className="crmTableWrap"><table className="crmTable"><thead><tr><th>{c.title}</th><th>{c.category}</th><th>{c.sku}</th><th className="num">{c.duration}</th><th className="num">{c.price}</th><th>{c.status}</th></tr></thead><tbody>
      {rows.map(p => <tr key={p.id} onClick={() => canWrite && setEditing(p)} className={p.active ? "" : "muted"}><td><b>{p.name}</b>{p.description && <small className="crmClamp">{p.description}</small>}</td><td>{p.category ?? "—"}</td><td>{p.sku ?? "—"}</td><td className="num">{p.durationMin ?? "—"}</td><td className="num">{money(p.price, p.currency, locale)}</td><td>{p.active ? c.active : c.inactive}</td></tr>)}
    </tbody></table></div>}
    {editing && <Modal title={item ? item.name : c.newProduct} onClose={() => setEditing(null)}><form className="crmForm" onSubmit={save}>
      <label>{c.title}<input name="name" required maxLength={200} defaultValue={item?.name ?? ""} autoFocus/></label>
      <div className="crmRow2"><label>{c.price}<input name="price" type="number" min={0} step="0.01" defaultValue={item?.price ?? 0}/></label><label>{c.duration}<input name="durationMin" type="number" min={0} max={1440} defaultValue={item?.durationMin ?? ""}/></label></div>
      <div className="crmRow2"><label>{c.category}<input name="category" maxLength={120} defaultValue={item?.category ?? ""}/></label><label>{c.sku}<input name="sku" maxLength={80} defaultValue={item?.sku ?? ""}/></label></div>
      <label>{c.description}<textarea name="description" rows={3} maxLength={2000} defaultValue={item?.description ?? ""}/></label>
      <label className="crmCheckLabel"><input type="checkbox" name="active" defaultChecked={item?.active ?? true}/>{c.active}</label>
      <footer>{item && <button type="button" className="crmBtn danger ghost" onClick={() => remove(item)}><Trash2 size={14}/>{c.delete}</button>}<div className="crmSpacer"/><button type="button" className="crmBtn" onClick={() => setEditing(null)}>{c.cancel}</button><button className="crmBtn primary">{c.save}</button></footer>
    </form></Modal>}
  </div>;
}

// ------------------------------------------------------------------ reports
type Report = { pipeline: { id: string; name: string }; days: number; funnel: Array<{ stageId: string; name: string; color: string; kind: string; count: number; amount: number; probability: number }>; forecast: number; totals: { created: number; won: number; lost: number; wonAmount: number; lostAmount: number; winRate: number | null; avgDeal: number; avgCycleDays: number | null; tasksOverdue: number; tasksOpen: number; newContacts: number; activities: number }; revenueByMonth: Array<{ month: string; won: number; count: number }>; bySource: Array<{ key: string; count: number; amount: number; won: number }>; byOwner: Array<{ key: string; name: string; count: number; amount: number; won: number }>; lostReasons: Array<{ key: string; count: number; amount: number }> };

export function ReportsView() {
  const { c, locale, boot, notify, refreshKey } = useCrm();
  const [pipelineId, setPipelineId] = useState(boot.pipelines[0]?.id ?? ""); const [days, setDays] = useState(90);
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => { api<Report>(`reports?days=${days}${pipelineId ? `&pipelineId=${pipelineId}` : ""}`).then(setReport).catch(() => notify(c.failed)); }, [days, pipelineId, notify, c.failed, refreshKey]);
  if (!report) return <p className="crmMuted pad">{c.loading}</p>;
  const t = report.totals;
  const maxFunnel = Math.max(1, ...report.funnel.map(f => f.count));
  const maxMonth = Math.max(1, ...report.revenueByMonth.map(m => m.won));
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString(locale === "ru" ? "ru-RU" : "en-US", { month: "short" });
  const tiles: Array<[string, string, string?]> = [
    [c.kpiWon, money(t.wonAmount, "RUB", locale), `${t.won}`], [c.kpiWinRate, t.winRate === null ? "—" : `${t.winRate}%`, `${t.won} / ${t.won + t.lost}`], [c.kpiAvg, money(t.avgDeal, "RUB", locale)], [c.kpiCycle, t.avgCycleDays === null ? "—" : `${t.avgCycleDays} ${c.days}`],
    [c.kpiForecast, money(Math.round(report.forecast), "RUB", locale)], [c.kpiNew, String(t.created)], [c.kpiContacts, String(t.newContacts)], [c.kpiOverdue, String(t.tasksOverdue), `${c.tasks}: ${t.tasksOpen}`],
  ];
  return <div className="crmPage">
    <div className="crmToolbar">
      {boot.pipelines.length > 1 && <select value={pipelineId} onChange={e => setPipelineId(e.target.value)}>{boot.pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      <div className="crmSegment">{[[30, c.d30], [90, c.d90], [180, c.d180], [365, c.d365]].map(([d, label]) => <button type="button" key={d} className={days === d ? "on" : ""} onClick={() => setDays(d as number)}>{label}</button>)}</div>
    </div>
    <div className="crmKpis">{tiles.map(([label, value, sub]) => <div key={label} className={label === c.kpiOverdue && t.tasksOverdue > 0 ? "crmKpi warn" : "crmKpi"}><small>{label}</small><b>{value}</b>{sub && <span>{sub}</span>}</div>)}</div>
    <div className="crmReportGrid">
      <section className="crmCardBox"><h4>{c.funnel}</h4><ul className="crmBars">{report.funnel.map(f => <li key={f.stageId} title={`${f.name}: ${f.count} · ${money(f.amount, "RUB", locale)}`}><span className="lbl">{f.name}</span><span className="bar"><i style={{ width: `${Math.max(2, f.count / maxFunnel * 100)}%`, background: f.color }}/></span><span className="val">{f.count}<small>{shortMoney(f.amount, locale)}</small></span></li>)}</ul></section>
      <section className="crmCardBox"><h4>{c.revenue}</h4><div className="crmColumns">{report.revenueByMonth.map(m => <div key={m.month} className="col" title={`${monthLabel(m.month)}: ${money(m.won, "RUB", locale)} · ${m.count}`}><span className="v">{m.won ? shortMoney(m.won, locale) : ""}</span><i style={{ height: `${Math.max(m.won ? 4 : 1, m.won / maxMonth * 100)}%` }}/><small>{monthLabel(m.month)}</small></div>)}</div></section>
      <section className="crmCardBox"><h4>{c.bySource}</h4>{report.bySource.length ? <table className="crmTable compact"><thead><tr><th>{c.source}</th><th className="num">{c.count}</th><th className="num">{c.won}</th><th className="num">{c.amount}</th></tr></thead><tbody>{report.bySource.map(s => <tr key={s.key}><td>{s.key}</td><td className="num">{s.count}</td><td className="num">{s.won}</td><td className="num">{shortMoney(s.amount, locale)}</td></tr>)}</tbody></table> : <p className="crmMuted">{c.none}</p>}</section>
      <section className="crmCardBox"><h4>{c.byOwner}</h4>{report.byOwner.length ? <table className="crmTable compact"><thead><tr><th>{c.owner}</th><th className="num">{c.count}</th><th className="num">{c.won}</th><th className="num">{c.amount}</th></tr></thead><tbody>{report.byOwner.map(s => <tr key={s.key}><td>{s.name}</td><td className="num">{s.count}</td><td className="num">{s.won}</td><td className="num">{shortMoney(s.amount, locale)}</td></tr>)}</tbody></table> : <p className="crmMuted">{c.none}</p>}</section>
      {report.lostReasons.length > 0 && <section className="crmCardBox"><h4>{c.lostReasons}</h4><ul className="crmBars">{report.lostReasons.map(r => <li key={r.key}><span className="lbl">{r.key}</span><span className="bar"><i style={{ width: `${r.count / Math.max(...report.lostReasons.map(x => x.count)) * 100}%` }}/></span><span className="val">{r.count}</span></li>)}</ul></section>}
    </div>
  </div>;
}

// ------------------------------------------------------------------ settings
export function CrmSettingsView() {
  const { c, notify, boot, reloadBoot, isAdmin } = useCrm();
  const [pipelineId, setPipelineId] = useState(boot.pipelines[0]?.id ?? "");
  const pipeline = boot.pipelines.find(p => p.id === pipelineId) ?? boot.pipelines[0];
  if (!isAdmin) return <Empty title={c.readOnly}/>;
  return <div className="crmPage crmSettings">
    <section className="crmCardBox">
      <h4>{c.pipelines}</h4>
      <div className="crmToolbar">
        <select value={pipeline?.id} onChange={e => setPipelineId(e.target.value)}>{boot.pipelines.map(p => <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ` (${c.makeDefault})` : ""}</option>)}</select>
        <button type="button" className="crmBtn" onClick={async () => { const name = window.prompt(c.newPipeline); if (!name) return; try { const p = await api<Pipeline>("pipelines", { method: "POST", body: { name } }); await reloadBoot(); setPipelineId(p.id); } catch { notify(c.failed); } }}><Plus size={14}/>{c.newPipeline}</button>
      </div>
      {pipeline && <PipelineEditor key={pipeline.id} pipeline={pipeline} canDelete={boot.pipelines.length > 1} onSaved={reloadBoot}/>}
    </section>
    <FieldsEditor/>
  </div>;
}

function PipelineEditor({ pipeline, canDelete, onSaved }: { pipeline: Pipeline; canDelete: boolean; onSaved: () => Promise<void> }) {
  const { c, notify } = useCrm();
  const [name, setName] = useState(pipeline.name);
  const [stages, setStages] = useState(pipeline.stages.map(s => ({ id: s.id as string | undefined, name: s.name, color: s.color, kind: s.kind, probability: s.probability })));
  const set = (i: number, patch: Partial<(typeof stages)[number]>) => setStages(list => list.map((s, j) => j === i ? { ...s, ...patch } : s));
  const swap = (i: number, j: number) => setStages(list => { if (j < 0 || j >= list.length) return list; const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next; });
  const save = async () => { try { await api(`pipelines/${pipeline.id}`, { method: "PATCH", body: { name, stages } }); await onSaved(); notify(c.saved); } catch { notify(c.failed); } };
  const remove = async () => { if (!window.confirm(c.confirmDelete)) return; try { await api(`pipelines/${pipeline.id}`, { method: "DELETE" }); await onSaved(); } catch { notify(c.failed); } };
  return <div className="crmPipelineEditor">
    <div className="crmForm"><div className="crmRow2"><label>{c.title}<input value={name} onChange={e => setName(e.target.value)} maxLength={80}/></label><label className="crmCheckLabel"><input type="checkbox" defaultChecked={pipeline.isDefault} disabled={pipeline.isDefault} onChange={e => e.target.checked && api(`pipelines/${pipeline.id}`, { method: "PATCH", body: { isDefault: true } }).then(onSaved)}/>{c.makeDefault}</label></div></div>
    <table className="crmTable compact"><thead><tr><th/><th>{c.stage}</th><th>{c.type}</th><th className="num">{c.probability}</th><th/></tr></thead><tbody>
      {stages.map((s, i) => <tr key={s.id ?? `n${i}`}>
        <td className="stageColor"><input type="color" value={s.color} onChange={e => set(i, { color: e.target.value })} aria-label="color"/></td>
        <td><input value={s.name} onChange={e => set(i, { name: e.target.value })} maxLength={60}/></td>
        <td><select value={s.kind} onChange={e => set(i, { kind: e.target.value as "OPEN" | "WON" | "LOST", probability: e.target.value === "WON" ? 100 : e.target.value === "LOST" ? 0 : s.probability })}><option value="OPEN">{c.kindOpen}</option><option value="WON">{c.kindWon}</option><option value="LOST">{c.kindLost}</option></select></td>
        <td className="num"><input type="number" min={0} max={100} value={s.probability} onChange={e => set(i, { probability: Number(e.target.value) })}/></td>
        <td className="rowActions"><button type="button" className="crmIcon tiny" onClick={() => swap(i, i - 1)} aria-label="up"><ArrowUp size={13}/></button><button type="button" className="crmIcon tiny" onClick={() => swap(i, i + 1)} aria-label="down"><ArrowDown size={13}/></button><button type="button" className="crmIcon tiny" disabled={stages.length <= 2} onClick={() => setStages(list => list.filter((_, j) => j !== i))} aria-label={c.delete}><Trash2 size={13}/></button></td>
      </tr>)}
    </tbody></table>
    <div className="crmItemsActions"><button type="button" className="crmBtn" onClick={() => setStages(list => { const firstClosed = list.findIndex(s => s.kind !== "OPEN"); const next = [...list]; next.splice(firstClosed < 0 ? list.length : firstClosed, 0, { id: undefined, name: c.stage, color: "#2f7fd8", kind: "OPEN", probability: 50 }); return next; })}><Plus size={14}/>{c.addStage}</button><div className="crmSpacer"/>{canDelete && <button type="button" className="crmBtn danger ghost" onClick={remove}><Trash2 size={14}/>{c.delete}</button>}<button type="button" className="crmBtn primary" onClick={save}>{c.save}</button></div>
  </div>;
}

function FieldsEditor() {
  const { c, notify, boot, reloadBoot } = useCrm();
  const [entity, setEntity] = useState<FieldDef["entity"]>("CUSTOMER");
  const fields = boot.fields.filter(f => f.entity === entity);
  const add = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); try { await api("fields", { method: "POST", body: { entity, label: String(d.get("label")), type: String(d.get("type")), options: String(d.get("options") ?? "").split(",").map(s => s.trim()).filter(Boolean) } }); form.reset(); await reloadBoot(); } catch { notify(c.failed); } };
  const remove = async (f: FieldDef) => { if (!window.confirm(c.confirmDelete)) return; try { await api(`fields/${f.id}`, { method: "DELETE" }); await reloadBoot(); } catch { notify(c.failed); } };
  const typeLabel: Record<string, string> = { TEXT: c.tText, NUMBER: c.tNumber, DATE: c.tDate, SELECT: c.tSelect, BOOLEAN: c.tBoolean, URL: c.tUrl };
  return <section className="crmCardBox">
    <h4>{c.fields}</h4>
    <div className="crmSegment">{([["CUSTOMER", c.entityCustomer], ["DEAL", c.entityDeal], ["COMPANY", c.entityCompany]] as const).map(([k, label]) => <button type="button" key={k} className={entity === k ? "on" : ""} onClick={() => setEntity(k)}>{label}</button>)}</div>
    <ul className="crmMiniList">{fields.map(f => <li key={f.id}><span><b>{f.label}</b> · {typeLabel[f.type]}{f.options.length ? ` · ${f.options.join(", ")}` : ""}</span><button type="button" className="crmIcon tiny" onClick={() => remove(f)} aria-label={c.delete}><Trash2 size={13}/></button></li>)}</ul>
    <form className="crmInlineForm" onSubmit={add}><input name="label" required maxLength={80} placeholder={c.fieldLabel}/><select name="type" defaultValue="TEXT">{Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><input name="options" placeholder={c.options}/><button className="crmBtn primary"><Plus size={14}/>{c.addField}</button></form>
  </section>;
}
