"use client";

import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export type AppSelectOption = { value: string; label: string; disabled?: boolean; icon?: ReactNode };
type AppSelectProps = {
  name?: string; label?: string; placeholder?: string; options: AppSelectOption[];
  value?: string; defaultValue?: string; onChange?: (value: string) => void;
  disabled?: boolean; error?: string | boolean; size?: "sm" | "md" | "lg";
  icon?: ReactNode; searchable?: boolean; width?: CSSProperties["width"];
  className?: string; ariaLabel?: string; required?: boolean;
};

export function AppSelect({name,label,placeholder="Выберите значение",options,value,defaultValue,onChange,disabled=false,error=false,size="md",icon,searchable=false,width,className="",ariaLabel,required=false}:AppSelectProps){
  const generatedId=useId(); const triggerRef=useRef<HTMLButtonElement>(null); const menuRef=useRef<HTMLDivElement>(null);
  const controlled=value!==undefined; const [internal,setInternal]=useState(defaultValue??""); const selectedValue=controlled?value:internal;
  const [open,setOpen]=useState(false); const [query,setQuery]=useState(""); const [active,setActive]=useState(0);
  const [position,setPosition]=useState<CSSProperties>({}); const selected=options.find(option=>option.value===selectedValue);
  const filtered=searchable&&query?options.filter(option=>option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())):options;
  const choose=(next:string)=>{if(!controlled)setInternal(next);onChange?.(next);setOpen(false);setQuery("");triggerRef.current?.focus()};
  const place=()=>{const trigger=triggerRef.current;if(!trigger)return;const rect=trigger.getBoundingClientRect();const gap=7;const margin=10;const desired=Math.min(320,Math.max(120,filtered.length*42+(searchable?52:14)));const below=window.innerHeight-rect.bottom-margin;const above=rect.top-margin;const upward=below<Math.min(desired,220)&&above>below;const maxHeight=Math.max(96,Math.min(desired,(upward?above:below)-gap));setPosition({position:"fixed",left:Math.max(margin,Math.min(rect.left,window.innerWidth-rect.width-margin)),width:Math.min(rect.width,window.innerWidth-margin*2),maxHeight,top:upward?undefined:rect.bottom+gap,bottom:upward?window.innerHeight-rect.top+gap:undefined})};
  useLayoutEffect(()=>{if(open)place()},[open,filtered.length]);
  useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{const node=event.target as Node;if(!triggerRef.current?.contains(node)&&!menuRef.current?.contains(node))setOpen(false)};const reposition=()=>place();document.addEventListener("pointerdown",close);window.addEventListener("resize",reposition);window.addEventListener("scroll",reposition,true);return()=>{document.removeEventListener("pointerdown",close);window.removeEventListener("resize",reposition);window.removeEventListener("scroll",reposition,true)}},[open]);
  useEffect(()=>{if(open){const index=Math.max(0,filtered.findIndex(option=>option.value===selectedValue));setActive(index)}},[open,selectedValue]);
  const keyDown=(event:React.KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);triggerRef.current?.focus();return}if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();if(!open){setOpen(true);return}const direction=event.key==="ArrowDown"?1:-1;let next=active;do next=(next+direction+filtered.length)%filtered.length;while(filtered[next]?.disabled&&next!==active);setActive(next);menuRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({block:"nearest"})}if(event.key==="Enter"||event.key===" "){event.preventDefault();if(!open)setOpen(true);else if(filtered[active]&&!filtered[active].disabled)choose(filtered[active].value)}if(event.key==="Home"&&open){event.preventDefault();setActive(0)}if(event.key==="End"&&open){event.preventDefault();setActive(filtered.length-1)}};
  const menu=open&&typeof document!=="undefined"?createPortal(<div ref={menuRef} id={`${generatedId}-listbox`} className="appSelectMenu" style={position} role="listbox" aria-label={ariaLabel??label} onKeyDown={keyDown}>{searchable&&<div className="appSelectSearch"><Search size={15}/><input autoFocus value={query} onChange={event=>{setQuery(event.target.value);setActive(0)}} placeholder="Поиск…" aria-label="Поиск"/></div>}<div className="appSelectOptions">{filtered.map((option,index)=><button type="button" key={option.value} data-index={index} role="option" aria-selected={option.value===selectedValue} disabled={option.disabled} className={`appSelectOption${option.value===selectedValue?" selected":""}${index===active?" active":""}`} onMouseEnter={()=>setActive(index)} onClick={()=>choose(option.value)}>{option.icon&&<span className="appSelectOptionIcon">{option.icon}</span>}<span title={option.label}>{option.label}</span>{option.value===selectedValue&&<Check size={15}/>}</button>)}{!filtered.length&&<p className="appSelectEmpty">Ничего не найдено</p>}</div></div>,document.body):null;
  return <div className={`appSelect appSelect--${size}${error?" appSelect--error":""} ${className}`} style={{width}}>{label&&<span className="appSelectLabel">{label}</span>}<button ref={triggerRef} type="button" className="appSelectTrigger" disabled={disabled} aria-label={ariaLabel??label} aria-haspopup="listbox" aria-controls={`${generatedId}-listbox`} aria-expanded={open} aria-invalid={!!error} onClick={()=>setOpen(current=>!current)} onKeyDown={keyDown}>{icon&&<span className="appSelectIcon">{icon}</span>}<span className={selected?"appSelectValue":"appSelectPlaceholder"} title={selected?.label}>{selected?.label??placeholder}</span><ChevronDown className="appSelectChevron" size={16}/></button>{name&&<input type="hidden" name={name} value={selectedValue} required={required}/>} {typeof error==="string"&&<small className="appSelectError">{error}</small>}{menu}</div>;
}
