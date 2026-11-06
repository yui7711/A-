'use client';
import {useEffect,useRef} from 'react';
import {X,KeyRound} from 'lucide-react';
import FuyaoConnection from './fuyao-connection';

export default function FuyaoKeyDialog({open,onClose,onChange}:{open:boolean;onClose:()=>void;onChange:()=>void}){
 const root=useRef<HTMLElement>(null);
 useEffect(()=>{if(!open)return;const before=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';root.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>{document.body.style.overflow=overflow;before?.focus();};},[open]);
 if(!open)return null;
 return <div className="modal-overlay fuyao-key-overlay" onClick={onClose}><section ref={root} className="fuyao-key-dialog" role="dialog" aria-modal="true" aria-labelledby="fuyao-key-dialog-title" onClick={e=>e.stopPropagation()} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
  if(e.key!=='Tab')return;const nodes=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href]')||[]),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }}><header><div><KeyRound size={19}/><h2 id="fuyao-key-dialog-title">填写同花顺 API Key</h2></div><button className="icon-btn" aria-label="关闭 Key 设置" onClick={onClose}><X size={20}/></button></header><FuyaoConnection onChange={onChange}/></section></div>;
}
