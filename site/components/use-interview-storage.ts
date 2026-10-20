'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ASSESSMENT_STORAGE_KEY, activeInterviews, assessmentSchema, backupSchema, type AssessmentSession } from '@/lib/assessment';

const recordSchema=z.object({session:assessmentSchema,revision:z.number().int().positive()});
export function useInterviewStorage(){
 const [sessions,setSessions]=useState<AssessmentSession[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(''),[retry,setRetry]=useState(0);
 const revisions=useRef(new Map<string,number>()),snapshots=useRef(new Map<string,string>()),latest=useRef(sessions),saving=useRef(false),mounted=useRef(true);
 latest.current=sessions;
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(latest.current.some(s=>snapshots.current.get(s.id)!==JSON.stringify(s))){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 useEffect(()=>{mounted.current=true;let cancelled=false;
  void(async()=>{try{
   const response=await fetch('/api/interviews',{cache:'no-store'});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'Chargement impossible.');
   const records=z.object({records:z.array(recordSchema)}).parse(data).records;if(cancelled)return;
   let next=records.map(r=>r.session);for(const r of records){revisions.current.set(r.session.id,r.revision);snapshots.current.set(r.session.id,JSON.stringify(r.session));}
   const local=localStorage.getItem(ASSESSMENT_STORAGE_KEY);
   if(local){const old=activeInterviews(backupSchema.parse(JSON.parse(local)).sessions);const ids=new Set(next.map(s=>s.id));next=[...next,...old.filter(s=>!ids.has(s.id))];if(!old.length)localStorage.removeItem(ASSESSMENT_STORAGE_KEY);}
   setSessions(next);setReady(true);setSaved(records.length?'Enregistré sur votre compte':'');
  }catch(e){if(!cancelled)setError((e as Error).message);}})();
  return()=>{cancelled=true;mounted.current=false;};
 },[]);
 useEffect(()=>{if(!ready)return;const timer=window.setInterval(()=>{setSessions(all=>{const next=activeInterviews(all);return next.length===all.length?all:next;});},15000);return()=>window.clearInterval(timer);},[ready]);
  const inFlight=useRef<Promise<void>|null>(null);
  function flush():Promise<void>{
   if(inFlight.current)return inFlight.current;
   if(!ready)return Promise.resolve();
   saving.current=true;
   const work=(async()=>{
   try{
    // Serialise writes, including edits made while a previous request is pending.
    while(mounted.current){
     const next=activeInterviews(latest.current).find(s=>snapshots.current.get(s.id)!==JSON.stringify(s));if(!next)break;
     const submitted=JSON.stringify(next);
     const response=await fetch('/api/interviews',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({session:next,expectedRevision:revisions.current.get(next.id)??0})});
     const body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error||'Enregistrement impossible.');
     const record=recordSchema.parse(body);revisions.current.set(next.id,record.revision);snapshots.current.set(next.id,JSON.stringify(record.session));
     // Keep newer typing; apply the server retention bound to subsequent writes.
     latest.current=latest.current.map(s=>s.id!==next.id?s:JSON.stringify(s)===submitted?record.session:{...s,retainedUntil:record.session.retainedUntil});
     if(mounted.current)setSessions(latest.current);window.dispatchEvent(new Event('recruitment:data'));
    }
    if(mounted.current){setSaved(`Enregistré sur votre compte à ${new Date().toLocaleTimeString('fr-FR')}`);setError('');localStorage.removeItem(ASSESSMENT_STORAGE_KEY);}
   }catch(e){if(mounted.current){setSaved('Non enregistré');setError((e as Error).message);}throw e;}
   finally{saving.current=false;}
   })();inFlight.current=work;void work.then(()=>{if(inFlight.current===work)inFlight.current=null;},()=>{if(inFlight.current===work)inFlight.current=null;});return work;
  }
 useEffect(()=>{
  if(!ready)return;
  if(sessions.some(s=>snapshots.current.get(s.id)!==JSON.stringify(s)))setSaved('Modifications à enregistrer…');
  const timer=window.setTimeout(()=>{void flush().catch(()=>{});},700);
  return()=>window.clearTimeout(timer);
 },[sessions,ready,retry]);
 async function remove(id:string){
  if(saving.current)throw new Error('Attendez la fin de l’enregistrement avant de supprimer.');
  const revision=revisions.current.get(id);
  if(revision){const response=await fetch('/api/interviews',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id,expectedRevision:revision})});const body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error||'Suppression impossible.');}
  revisions.current.delete(id);snapshots.current.delete(id);setSessions(all=>all.filter(s=>s.id!==id));
 }
 async function setFollowUpOutcome(id:string,value:'Go'|'No Go'){
  if(!ready)throw new Error('Attendez le chargement des entretiens.');
  if(!activeInterviews(latest.current).some(s=>s.id===id))throw new Error('Cet entretien est introuvable ou a expiré.');
  const now=new Date().toISOString();
  latest.current=latest.current.map(s=>s.id===id?{...s,followUpOutcome:{value,at:now},updatedAt:now}:s);
  setSessions(latest.current);await flush();
 }
 return{sessions,setSessions,ready,error,setError,saved,remove,flush,setFollowUpOutcome,retrySave:()=>ready?setRetry(x=>x+1):window.location.reload()};
}
