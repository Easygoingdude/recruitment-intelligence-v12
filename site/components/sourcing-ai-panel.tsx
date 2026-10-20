"use client";
import type { AISourcingPlan } from '@/lib/ai-contract';

export function SourcingAIPanel({feedback,setFeedback,busy,proposal,stale,onOptimize,onApply,onDismiss}:{feedback:string;setFeedback:(value:string)=>void;busy:boolean;proposal:AISourcingPlan|null;stale:boolean;onOptimize:()=>void;onApply:()=>void;onDismiss:()=>void}) {
  return <section className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5" aria-label="Optimisation IA du sourcing">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Optimiser la recherche avec l’IA</h2><p className="mt-1 text-sm text-slate-600">Proposer des mots-clés adaptés au poste et à son niveau.</p></div><button className="primary-button" disabled={busy} onClick={onOptimize}>{busy?'Optimisation IA en cours…':'Optimiser les neuf sets avec l’IA'}</button></div>
    <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Affiner avec vos retours de recherche</summary>
    <label className="mt-3 block text-sm font-semibold">Résultats observés, facultatif<textarea className="field-control mt-2" maxLength={4000} rows={3} disabled={busy} value={feedback} onChange={event=>setFeedback(event.target.value)} placeholder="Ex. LinkedIn P1 : peu de résultats ; V2 : trop de profils commerciaux. Indiquez les volumes ou le bruit constaté, sans nom ni donnée candidat."/></label>
    </details>
    {proposal?<div className="mt-5 space-y-4 border-t border-indigo-200 pt-5">
      <h3 className="font-bold">Proposition IA à examiner</h3><p className="text-sm leading-6">{proposal.summary}</p>
      {proposal.axes.map(axis=><article className="rounded-xl border border-indigo-100 bg-white p-4" key={axis.name}>
        <h4 className="font-semibold">{axis.name}{axis.locked?' · axe verrouillé':''}</h4>
        <dl className="mt-3 space-y-2 text-sm leading-6"><div><dt className="font-semibold">Précis</dt><dd>{axis.exactTerms.join(' ; ')||'Aucun terme défendable proposé.'}</dd></div><div><dt className="font-semibold">Voisins</dt><dd>{axis.adjacentTerms.join(' ; ')||'Pas d’élargissement proposé.'}</dd></div><div><dt className="font-semibold">Transférables</dt><dd>{axis.transferableTerms.join(' ; ')||'Pas de passerelle proposée.'}</dd></div></dl>
        <p className="mt-3 text-sm leading-6"><strong>Lien métier :</strong> {axis.reason}</p><p className="mt-2 text-sm leading-6 text-amber-900"><strong>À vérifier :</strong> {axis.verify}</p>
        <details className="mt-3"><summary className="cursor-pointer text-xs text-slate-500">Sources du brief</summary>{axis.evidence.map((e,i)=><p className="mt-2 text-xs leading-5 text-slate-500" key={`${e.field}-${i}`}>Source {e.field} : « {e.excerpt} »</p>)}</details>
      </article>)}
      {proposal.warnings.map((w,i)=><p className="text-sm leading-6 text-amber-900" key={i}>{w}</p>)}
      {stale?<p role="alert" className="text-sm font-semibold text-amber-900">Le brief, les termes, les verrous ou les retours ont changé. Relancez l’optimisation avant d’appliquer.</p>:null}
      <div className="flex flex-wrap gap-3"><button className="primary-button" disabled={busy||stale} onClick={onApply}>Appliquer cette stratégie aux neuf sets</button><button className="secondary-button" disabled={busy} onClick={onDismiss}>Écarter la proposition</button></div>
    </div>:null}
  </section>;
}
