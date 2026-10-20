"use client";

import { useRef, useState, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import type { ScorecardCriterion } from '@/lib/recruitment-engine';

type Drag = {id:string;target:string;pointerId:number;startX:number;startY:number;moved:boolean};

export function ScorecardCriteriaList({criteria,activeId,onSelect,onMove}:{criteria:ScorecardCriterion[];activeId:string;onSelect:(id:string)=>void;onMove:(sourceId:string,targetId:string)=>void}) {
  const listRef=useRef<HTMLOListElement>(null);
  const dragRef=useRef<Drag|null>(null);
  const suppressClickRef=useRef(false);
  const [drag,setDrag]=useState<{id:string;target:string}|null>(null);
  const [announcement,setAnnouncement]=useState('');

  function move(source:string,target:string) {
    if(source===target)return;
    const position=criteria.findIndex(item=>item.id===target)+1;
    const name=criteria.find(item=>item.id===source)?.criterion;
    onMove(source,target);
    setAnnouncement(`${name} déplacé en position ${position} sur ${criteria.length}.`);
  }
  function start(event:PointerEvent<HTMLButtonElement>,id:string) {
    if(!event.isPrimary || event.button!==0 || criteria.length<2)return;
    suppressClickRef.current=false;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current={id,target:id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};
  }
  function update(event:PointerEvent<HTMLButtonElement>) {
    const current=dragRef.current;
    const list=listRef.current;
    if(!current || current.pointerId!==event.pointerId || !list)return;
    if(!current.moved && Math.hypot(event.clientX-current.startX,event.clientY-current.startY)<6)return;
    current.moved=true;
    event.preventDefault();
    const bounds=list.getBoundingClientRect();
    if(event.clientY<bounds.top+40)list.scrollTop-=18;
    else if(event.clientY>bounds.bottom-40)list.scrollTop+=18;
    const rows=Array.from(list.querySelectorAll<HTMLElement>('[data-criterion-id]'));
    const hit=rows.find(row=>{const rect=row.getBoundingClientRect();return event.clientY>=rect.top && event.clientY<=rect.bottom;});
    const target=hit?.dataset.criterionId;
    current.target=event.clientX>=bounds.left-30 && event.clientX<=bounds.right+30 && event.clientY>=bounds.top-20 && event.clientY<=bounds.bottom+20 ? target??current.id : current.id;
    setDrag({id:current.id,target:current.target});
  }
  function finish(event:PointerEvent<HTMLButtonElement>,cancel=false) {
    const current=dragRef.current;
    if(!current || current.pointerId!==event.pointerId)return;
    suppressClickRef.current=current.moved;
    dragRef.current=null;setDrag(null);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(!cancel && current.moved)move(current.id,current.target);
  }

  return <>
    <p id="scorecard-order-help" className="px-5 py-3 text-xs leading-5 text-slate-500">Glissez un critère pour le déplacer. Clavier : flèches sur la poignée.</p>
    <ol ref={listRef} aria-label="Compétences à évaluer" className="max-h-[690px] space-y-1 overflow-auto p-2">
      {criteria.map((item,index)=>{
        const active=activeId===item.id;
        const target=drag && drag.target===item.id && drag.id!==item.id;
        return <li key={item.id} data-criterion-id={item.id} className={`relative select-none rounded-xl border transition-colors ${target?'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200':active?'border-slate-950 bg-slate-950 text-white':'border-transparent hover:bg-slate-50'} ${drag?.id===item.id?'opacity-50':''}`}>
          {target?<span className="pointer-events-none absolute -top-2 right-3 z-10 rounded bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">Déposer en position {index+1}</span>:null}
          <div className="flex items-center gap-1 p-1">
            <button type="button" aria-label={`Déplacer ${item.criterion}`} aria-describedby="scorecard-order-help" title="Glisser pour déplacer" className="shrink-0 cursor-grab rounded-lg px-1 py-3 focus-visible:outline-2 focus-visible:outline-indigo-500 active:cursor-grabbing" style={{touchAction:'none'}} disabled={criteria.length<2}
              onPointerDown={event=>start(event,item.id)} onPointerMove={update} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={()=>{dragRef.current=null;setDrag(null);}}
              onKeyDown={event=>{if(event.key==='Escape'){dragRef.current=null;setDrag(null);}else if(event.key==='ArrowUp' || event.key==='ArrowDown'){event.preventDefault();const destination=criteria[index+(event.key==='ArrowUp'?-1:1)];if(destination)move(item.id,destination.id);}}}>
              <GripVertical aria-hidden="true" className="h-5 w-5"/>
            </button>
            <button type="button" title="Cliquer pour modifier · glisser pour réordonner" aria-describedby="scorecard-order-help"
              onPointerDown={event=>{if(event.pointerType==='mouse')start(event,item.id);}} onPointerMove={update} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={()=>{dragRef.current=null;setDrag(null);}}
              onKeyDown={event=>{if(event.key==='Escape'){dragRef.current=null;setDrag(null);}}}
              onClick={()=>{if(suppressClickRef.current){suppressClickRef.current=false;return;}onSelect(item.id);}} aria-current={active?'true':undefined} className="min-w-0 flex-1 cursor-grab rounded-lg py-3 text-left active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-indigo-500">
              <div className="flex items-start gap-2"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${active?'bg-white/15':'bg-slate-100 text-slate-600'}`}>{index+1}</span><div className="min-w-0"><div className="break-words text-sm font-semibold">{item.criterion}</div><div className={`mt-1 text-xs ${active?'text-slate-300':'text-slate-500'}`}>{item.type} · ×{item.coefficient}{item.eliminatory?' · éliminatoire':''}</div></div></div>
            </button>
            <div className="flex shrink-0 flex-col">
              <button type="button" aria-label={`Monter ${item.criterion}`} disabled={index===0} onClick={()=>move(item.id,criteria[index-1].id)} className="rounded p-1.5 disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-indigo-500"><ArrowUp className="h-3.5 w-3.5" aria-hidden="true"/></button>
              <button type="button" aria-label={`Descendre ${item.criterion}`} disabled={index===criteria.length-1} onClick={()=>move(item.id,criteria[index+1].id)} className="rounded p-1.5 disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-indigo-500"><ArrowDown className="h-3.5 w-3.5" aria-hidden="true"/></button>
            </div>
          </div>
        </li>;
      })}
    </ol>
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
  </>;
}
