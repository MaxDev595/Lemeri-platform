"use client";

import { ReactNode } from "react";
import { Lock } from "lucide-react";

// Small form building blocks shared by the AI-employee, card and plan screens.

export function Section({ title, copy, children, aside, id }: { title: string; copy?: string; children: ReactNode; aside?: ReactNode; id?: string }) {
  return <section className="sxSection" id={id}><header><div><h3>{title}</h3>{copy && <p>{copy}</p>}</div>{aside}</header><div className="sxSectionBody">{children}</div></section>;
}

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? "sxField wide" : "sxField"}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className={disabled ? "sxToggle disabled" : "sxToggle"}>
    <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={checked ? "switch on" : "switch"} onClick={() => onChange(!checked)}><i/></button>
  </label>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return <div className="sxSegmented" role="radiogroup" aria-label={label}>{options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? "on" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

export function Chips<T extends string>({ values, options, onChange }: { values: T[]; options: Array<{ value: T; label: string }>; onChange: (values: T[]) => void }) {
  return <div className="sxChips">{options.map(option => { const on = values.includes(option.value); return <button key={option.value} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => onChange(on ? values.filter(item => item !== option.value) : [...values, option.value])}>{option.label}</button>; })}</div>;
}

/** Shown over controls the current plan does not include. */
export function PlanLock({ plan, locale, onUpgrade }: { plan: "Starter" | "Custom"; locale: string; onUpgrade?: () => void }) {
  const ru = locale !== "en";
  return <div className="sxLock"><Lock size={14}/><span>{ru ? `Доступно в тарифе ${plan}` : `Available on ${plan}`}</span>{onUpgrade && <button type="button" className="linkButton" onClick={onUpgrade}>{ru ? "Сменить тариф" : "Upgrade"}</button>}</div>;
}
