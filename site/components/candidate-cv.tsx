'use client';
import { useEffect, useState } from 'react';
import { extractCvText, pseudonymiseCv } from '@/lib/candidate-cv';
import type { AssessmentSession } from '@/lib/assessment';
export function CandidateCv({session,onChange}:{session:AssessmentSession;onChange:(s:AssessmentSession)=>void}){
 const [fullName,setFullName]=useState(''),[preview,setPreview]=useState(''),[reviewed,setReviewed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setFullName('');setPreview('');setReviewed(false);setError('');},[session.id]);
 async function importFile(file:File){setBusy(true);setError('');setReviewed(false);setPreview('');try{setPreview(pseudonymiseCv(await extractCvText(file),fullName,session.reference));setFullName('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="mb-5 rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer font-semibold">CV pseudonymisé{session.candidateCv?' · enregistré':''}</summary>
  <p className="mt-3 text-xs text-slate-600">Seul le texte relu est enregistré. Le fichier original, ses images, métadonnées et votre saisie du nom ne sont pas conservés.</p>
  <label className="mt-4 block text-sm">Prénom puis nom du candidat · saisie temporaire<input className="field-control mt-1 w-full" autoComplete="off" value={fullName} onChange={e=>setFullName(e.target.value)} disabled={busy}/></label>
  <label className="mt-3 block text-sm">Importer le CV (PDF, DOCX, TXT)<input className="mt-2 block w-full" type="file" accept=".pdf,.docx,.txt" disabled={!fullName.trim()||busy} onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file);e.target.value='';}}/></label>
  {busy&&<p role="status" className="mt-2 text-sm">Pseudonymisation locale en cours…</p>}{error&&<p role="alert" className="mt-2 text-sm text-rose-800">{error}</p>}
  {preview&&<><label className="mt-4 block text-sm">Texte à relire<textarea className="field-control mt-2 min-h-40 w-full" maxLength={40000} value={preview} onChange={e=>{setPreview(e.target.value);setReviewed(false);}}/></label><label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>J’ai vérifié les initiales et retiré les autres éléments permettant d’identifier le candidat.</label><button className="primary-button mt-3" disabled={!reviewed} onClick={()=>{onChange({...session,candidateCv:{text:preview,importedAt:new Date().toISOString(),reviewed:true},updatedAt:new Date().toISOString()});setPreview('');setReviewed(false);}}>Enregistrer le texte pseudonymisé</button></>}
  {session.candidateCv&&<><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap text-sm">{session.candidateCv.text}</pre><button className="secondary-button mt-3" onClick={()=>{const next={...session,updatedAt:new Date().toISOString()};delete next.candidateCv;onChange(next);}}>Supprimer le CV</button></>}
 </details>;
}
