"use client";

import { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { sourcingPlatformHelp, type SourcingPlatform } from '@/lib/sourcing-queries';
import type { FunnelDraft, FunnelLevel, SourcingFunnel } from '@/lib/sourcing-funnel';

const levels:Array<{id:FunnelLevel;title:string;description:string}>=[
  {id:'precise',title:'1. Profil directement ciblé',description:'P1 à P3 : mots-clés exacts, puis variantes de vocabulaire, sans retirer d’axe.'},
  {id:'adjacent',title:'2. Compétences voisines',description:'V1 à V3 : ajout progressif d’environnements et d’outils proches sur les axes 1, 2 puis 3.'},
  {id:'transferable',title:'3. Compétences transférables',description:'T1 à T3 : ajout progressif des savoir-faire sous-jacents. Les passerelles restent à qualifier.'},
];
export function SourcingFunnelView({funnel,draft,onChange}:{funnel:SourcingFunnel;draft:FunnelDraft;onChange:(value:FunnelDraft)=>void}) {
  const [platform,setPlatform]=useState<SourcingPlatform>('linkedin');
  const [copyStatus,setCopyStatus]=useState('');
  const info=sourcingPlatformHelp[platform];
  const copy=async(id:string,text:string)=>{
    try {await navigator.clipboard.writeText(text);setCopyStatus(`${id} copié.`);}
    catch {setCopyStatus('Copie indisponible. Sélectionnez le texte de la requête.');}
  };
  const update=(name:string,patch:NonNullable<FunnelDraft[string]>)=>onChange({...draft,[name]:{...draft[name],...patch}});
  return <section className="space-y-5" aria-label="Entonnoir inverse de sourcing">
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold">Neuf sets, du précis au plus large</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Choisissez un moteur, puis copiez une requête.</p>
      <label className="mt-4 block text-sm font-semibold">Plateforme cible<select className="field-control mt-2" value={platform} onChange={event=>setPlatform(event.target.value as SourcingPlatform)}>{Object.entries(sourcingPlatformHelp).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
      <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Mode d’emploi du moteur</summary><p className="mt-2 text-sm leading-6 text-slate-600"><strong>Champ : {info.field}.</strong> {info.instructions}</p>
      {info.source?<a className="mt-2 inline-block text-xs text-indigo-700 underline" href={info.source} target="_blank" rel="noreferrer">Documentation du moteur</a>:null}
      <p className="mt-3 text-xs leading-5 text-slate-500">Filtres à régler séparément : mobilité, lieu de travail, disponibilité et conditions du poste. Aucun diplôme, âge, ancienneté ou rejet automatique n’est ajouté. Les volumes réels dépendent du moteur ; aucune mesure de pénurie n’est déduite des requêtes.</p></details>
    </div>
    <details className="rounded-2xl border border-slate-200 bg-white p-5">
      <summary className="cursor-pointer font-bold">Ajuster les passerelles et les verrous</summary>
      <p className="mt-3 text-sm leading-6 text-slate-600">Une passerelle est une hypothèse de sourcing à valider avec le manager. Un axe verrouillé conserve ses termes exacts dans les neuf sets. Pour un domaine absent du référentiel, renseignez vous-même les pistes pertinentes.</p>
      <div className="mt-4 space-y-5">{funnel.axes.map(axis=><div key={axis.name} className="rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold">{axis.name}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Socle exact : {axis.exact.join(' ; ')}</p>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={axis.locked} onChange={event=>update(axis.name,{locked:event.target.checked})}/>Conserver ce socle sans élargissement</label>
        <label className="mt-3 block text-xs font-semibold">Compétences ou environnements voisins<textarea className="field-control mt-2" rows={2} disabled={axis.locked} value={draft[axis.name]?.adjacent??axis.adjacent.join('\n')} onChange={event=>update(axis.name,{adjacent:event.target.value})} placeholder="Une alternative par ligne"/></label>
        <label className="mt-3 block text-xs font-semibold">Savoir-faire transférables<textarea className="field-control mt-2" rows={2} disabled={axis.locked} value={draft[axis.name]?.transferable??axis.transferable.join('\n')} onChange={event=>update(axis.name,{transferable:event.target.value})} placeholder="Un savoir-faire pertinent par ligne"/></label>
        <p className="mt-3 text-xs leading-5 text-slate-600"><strong>Lien proposé :</strong> {axis.reason}</p>
        <p className="mt-2 text-xs leading-5 text-amber-800"><strong>À vérifier :</strong> {axis.verify}</p>
      </div>)}</div>
    </details>
    {funnel.warnings.length?<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{funnel.warnings.map(w=><p key={w}>{w}</p>)}</div>:null}
    <p role="status" aria-live="polite" className="text-sm text-indigo-700">{copyStatus}</p>
    {levels.map(level=><section key={level.id} aria-label={level.title} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-bold">{level.title}</h3>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">{funnel.sets.filter(set=>set.level===level.id).map(set=>{
        const query=set.queries[platform];
        const duplicate=set.duplicateOf[platform];
        return <article key={set.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2"><h4 className="font-bold">{set.id}</h4><button className="secondary-button" disabled={!query} aria-label={`Copier ${set.id}`} onClick={()=>void copy(set.id,query)}><Copy className="h-4 w-4"/>Copier</button></div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{set.expandedAxes.length?`Axes élargis : ${set.expandedAxes.join(' ; ')}`:'Socles exacts conservés.'}</p>
          {duplicate?<p className="mt-2 text-xs text-amber-800">Identique à {duplicate} sur ce moteur. Compléter les alternatives pour diversifier.</p>:null}
          <pre className="mt-3 flex-1 whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-100">{query||'Renseignez des termes recherchables pour un axe.'}</pre>
          {(platform==='google-xray'||platform==='google-web')&&query?<a className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 underline" href={`https://www.google.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">Ouvrir {set.id} dans Google<ExternalLink className="h-3 w-3"/></a>:null}
        </article>;
      })}</div>
    </section>)}
  </section>;
}
