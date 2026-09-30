"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, copyFor, CrmContext, type Bootstrap, type Locale, type Opened } from "./core";
import { DealDrawer, DealsView } from "./deals";
import { CompaniesView, CompanyDrawer, ContactDrawer, ContactsView } from "./contacts";
import { CrmSettingsView, ProductsView, ReportsView, TasksView } from "./more";

export type CrmView = "deals" | "contacts" | "companies" | "tasks" | "products" | "reports" | "crmSettings";

const CRM_TABS: [CrmView, string, string][] = [["deals", "Сделки", "Deals"], ["contacts", "Контакты", "Contacts"], ["companies", "Компании", "Companies"], ["tasks", "Задачи", "Tasks"], ["products", "Товары и услуги", "Products"], ["reports", "Отчёты", "Reports"], ["crmSettings", "Настройки", "Settings"]];

/** The whole CRM, loaded only in the browser (keeps the Cloudflare Worker small). */
export default function CrmApp({ view, locale, notify, onNavigate, openTarget }: { view: CrmView; locale: Locale; notify: (text: string) => void; onNavigate: (section: string) => void; openTarget?: Opened }) {
  const c = copyFor(locale);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [failed, setFailed] = useState(false);
  const [stack, setStack] = useState<NonNullable<Opened>[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const reloadBoot = useCallback(async () => { try { setBoot(await api<Bootstrap>("bootstrap")); setFailed(false); } catch { setFailed(true); } }, []);
  useEffect(() => { void reloadBoot(); }, [reloadBoot]);
  useEffect(() => { if (openTarget) setStack([openTarget]); }, [openTarget]);
  const open = useCallback((target: Opened) => { if (target) setStack(s => [...s.filter(x => !(x.type === target.type && x.id === target.id)), target].slice(-5)); }, []);
  const bump = useCallback(() => setRefreshKey(k => k + 1), []);
  const value = useMemo(() => boot && ({ locale, c, boot, reloadBoot, notify, open, canWrite: ["OWNER", "ADMIN", "MANAGER"].includes(boot.role), isAdmin: ["OWNER", "ADMIN"].includes(boot.role), refreshKey, bump, goConversations: () => onNavigate("conversations") }), [boot, locale, c, reloadBoot, notify, open, refreshKey, bump, onNavigate]);
  if (failed) return <div className="crmEmpty"><h3>{c.failed}</h3><button type="button" className="crmBtn primary" onClick={() => void reloadBoot()}>↻</button></div>;
  if (!value) return <p className="crmMuted pad">{c.loading}</p>;
  const top = stack.at(-1);
  const close = () => setStack(s => s.slice(0, -1));
  return <CrmContext.Provider value={value}>
    <div className="crmRoot">
      <div className="crmTabs crmSections" role="tablist" aria-label="CRM">
        {CRM_TABS.map(([id, ru, en]) => <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "on" : ""} onClick={() => onNavigate(id)}>{locale === "en" ? en : ru}</button>)}
      </div>
      {view === "deals" && <DealsView onSettings={() => onNavigate("crmSettings")}/>}
      {view === "contacts" && <ContactsView/>}
      {view === "companies" && <CompaniesView/>}
      {view === "tasks" && <TasksView/>}
      {view === "products" && <ProductsView/>}
      {view === "reports" && <ReportsView/>}
      {view === "crmSettings" && <CrmSettingsView/>}
      {top?.type === "deal" && <DealDrawer key={`d${top.id}`} id={top.id} onClose={close}/>}
      {top?.type === "contact" && <ContactDrawer key={`c${top.id}`} id={top.id} onClose={close}/>}
      {top?.type === "company" && <CompanyDrawer key={`o${top.id}`} id={top.id} onClose={close}/>}
    </div>
  </CrmContext.Provider>;
}
