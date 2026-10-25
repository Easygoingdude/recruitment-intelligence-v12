'use client';
import {useEffect,useState} from 'react';
import {extractCvText,pseudonymiseCv} from '@/lib/candidate-cv';
import {renderSearchQuery,normaliseSearchTerms,type SourcingPlatform} from '@/lib/sourcing-queries';

const stages=['À examiner','À qualifier','Pertinent','Écarté'] as const;
type Stage=typeof stages[number];
type Entry={id:string;reference:string;source:'HelloWork'|'Apec'|'LinkedIn Recruiter';stage:Stage;createdAt:number;expiresAt:number;evidence:string};
const TTL=14*86400000;
export function SourcingWorkspace({jobId,roleTitle,axes}:{jobId:string;roleTitle:string;axes:string[]}){
 const key='ri:v13:sourcing:'+jobId;
 const [entries,setEntries]=useState<Entry[]>([]),[loaded,setLoaded]=useState(false),[source,setSource]=useState<Entry['source']>('HelloWork');
 const [name,setName]=useState(''),[reference,setReference]=useState(''),[preview,setPreview]=useState(''),[reviewed,setReviewed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
 useEffect(()=>{try{const raw=sessionStorage.getItem(key);const values=raw?JSON.parse(raw):[];setEntries(Array.isArray(values)?values.filter((e:Entry)=>e.expiresAt>Date.now()&&stages.includes(e.stage)):[]);}catch{setEntries([]);}setLoaded(true);},[key]);
 useEffect(()=>{if(loaded)try{sessionStorage.setItem(key,JSON.stringify(entries.filter(e=>e.expiresAt>Date.now())));}catch{setError('Enregistrement dans la session indisponible.');}},[key,entries,loaded]);
 const terms=normaliseSearchTerms([roleTitle,...axes].filter(Boolean),3);
 const platform:SourcingPlatform=source==='HelloWork'?'hellowork':source==='Apec'?'apec':'linkedin';
 const query=renderSearchQuery(terms.map(t=>[t]),platform);
 async function load(file:File){setError('');setPreview('');setReviewed(false);setBusy(true);try{if(!reference.trim())throw new Error('Indiquez une référence pseudonymisée au format J.D.-ABC123.');setPreview(pseudonymiseCv(await extractCvText(file),name,reference.trim()));setName('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function save(){if(!reviewed||!preview.trim())return;const evidence=preview.slice(0,800);setEntries(previous=>[{id:crypto.randomUUID(),reference:reference.trim(),source,stage:'À examiner',evidence,createdAt:Date.now(),expiresAt:Date.now()+TTL},...previous]);setPreview('');setReference('');setReviewed(false);}
 function move(id:string,stage:Stage){setEntries(old=>old.map(e=>e.id===id?{...e,stage}:e));}
 return <section aria-label="Assistant de sourcing" className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
  <header><h3 className="text-xl font-bold">Sourcing Assistant · V13.0</h3><p className="mt-2 text-sm text-slate-600">Recherches préparées et suivi manuel des profils. Aucun accès automatisé aux CVthèques et aucun contact candidat.</p></header>
  <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">CVthèque<select className="field-control mt-2 w-full" value={source} onChange={e=>setSource(e.target.value as Entry['source'])}><option>HelloWork</option><option>Apec</option><option>LinkedIn Recruiter</option></select></label><label className="text-sm font-semibold">Requête à copier<textarea className="field-control mt-2 w-full" readOnly rows={2} value={query}/></label></div>
  <button className="secondary-button" disabled={!query} onClick={()=>{void navigator.clipboard.writeText(query).then(()=>setCopied(true)).catch(()=>setError('Copie automatique impossible : sélectionnez la requête.'));}}>{copied?'Requête copiée':'Copier la requête'}</button>
  <p className="text-xs text-slate-500">Recherche indicative construite avec l'intitulé et les critères. Affinez-la dans le module M3 avant utilisation ; les filtres de localisation restent propres à chaque plateforme.</p>
  <div className="rounded-xl bg-slate-50 p-4"><h4 className="font-semibold">Importer un profil après consultation autorisée</h4><p className="mt-1 text-xs text-slate-600">Le CV est traité localement. Seule une preuve textuelle de 800 caractères maximum est conservée dans cette session du navigateur pendant 14 jours ; elle ne doit contenir aucune donnée identifiante. Aucun appel IA n'est effectué.</p>
   <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">Prénom et nom (temporaire)<input className="field-control mt-1 w-full" value={name} onChange={e=>setName(e.target.value)} autoComplete="off"/></label><label className="text-sm">Référence pseudonymisée<input className="field-control mt-1 w-full" value={reference} onChange={e=>setReference(e.target.value)} placeholder="J.D.-ABC123" autoComplete="off"/></label></div>
   <label className="mt-3 block text-sm">CV (PDF, DOCX ou TXT)<input type="file" className="mt-1 block" accept=".pdf,.docx,.txt" disabled={!name.trim()||!reference.trim()||busy} onChange={e=>{const f=e.target.files?.[0];if(f)void load(f);e.currentTarget.value='';}}/></label>
   {preview&&<><label className="mt-3 block text-sm">Extrait pseudonymisé à vérifier<textarea className="field-control mt-1 min-h-28 w-full" value={preview} maxLength={800} onChange={e=>{setPreview(e.target.value);setReviewed(false);}}/></label><label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>J'ai retiré les coordonnées et informations identifiantes de cet extrait.</label><button className="primary-button mt-3" disabled={!reviewed||!preview.trim()} onClick={save}>Ajouter au Kanban</button></>}
  </div>
  {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
  <div className="grid gap-3 md:grid-cols-4">{stages.map(stage=><div key={stage} className="rounded-xl bg-slate-100 p-3"><h4 className="mb-3 text-sm font-bold">{stage} ({entries.filter(e=>e.stage===stage).length})</h4><div className="space-y-2">{entries.filter(e=>e.stage===stage).map(entry=><article key={entry.id} className="rounded-lg border border-slate-200 bg-white p-3"><p className="font-semibold">{entry.reference}</p><p className="mt-1 text-xs text-slate-500">{entry.source}</p><p className="my-2 line-clamp-4 whitespace-pre-wrap text-xs">{entry.evidence}</p><select aria-label={'Statut de '+entry.reference} className="field-control w-full text-xs" value={entry.stage} onChange={e=>move(entry.id,e.target.value as Stage)}>{stages.map(s=><option key={s}>{s}</option>)}</select><button className="mt-2 text-xs text-rose-700" onClick={()=>setEntries(old=>old.filter(x=>x.id!==entry.id))}>Retirer</button></article>)}</div></div>)}</div>
  <p className="text-xs text-slate-500">KPI locaux : {entries.length} profils examinés, {entries.filter(e=>e.stage==='Pertinent').length} pertinents, {entries.filter(e=>e.stage==='Écarté').length} écartés. Les données de session ne sont pas synchronisées avec les candidatures serveur.</p>
 </section>;
}
