'use client';
import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {randomId} from '@/lib/random-id';
import {applicationRecordSchema,type ApplicationRecord,type ApplicationHistory,type RecruitmentApplication} from '@/lib/applications';
const responseSchema=z.object({records:z.array(applicationRecordSchema),history:z.array(z.object({jobId:z.string(),month:z.string(),total:z.number(),closed:z.number(),inProgress:z.number()}))});
export function useApplications(){
 const [records,setRecords]=useState<ApplicationRecord[]>([]),[history,setHistory]=useState<ApplicationHistory[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const latest=useRef(records),mounted=useRef(true),sequence=useRef(0),locked=useRef(false);latest.current=records;
 async function refresh(reconcile=false){const ticket=++sequence.current;try{const response=await fetch(`/api/applications${reconcile?'':'?refresh=1'}`,{cache:'no-store'});const body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error||'Suivi indisponible.');const data=responseSchema.parse(body);if(mounted.current&&ticket===sequence.current){latest.current=data.records;setRecords(data.records);setHistory(data.history);setReady(true);setError('');}}catch(e){if(mounted.current&&ticket===sequence.current){setReady(false);setError((e as Error).message);}throw e;}}
 useEffect(()=>{mounted.current=true;void refresh(true).catch(()=>{});let timer:number|undefined;const changed=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>{void refresh().catch(()=>{});},150);};const interval=window.setInterval(changed,60000);window.addEventListener('recruitment:data',changed);return()=>{mounted.current=false;++sequence.current;window.clearInterval(interval);window.clearTimeout(timer);window.removeEventListener('recruitment:data',changed);};},[]);
 async function mutate(body:Record<string,unknown>){if(locked.current)throw new Error('Un suivi est en cours d’enregistrement.');locked.current=true;setBusy(true);try{const response=await fetch('/api/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json() as {error?:string;application?:RecruitmentApplication};if(!response.ok)throw new Error(data.error||'Enregistrement impossible.');await refresh();return data.application;}catch(e){setError((e as Error).message);throw e;}finally{locked.current=false;setBusy(false);}}
 const record=(id:string)=>{const r=latest.current.find(r=>r.application.id===id);if(!r)throw new Error('Candidature introuvable.');return r;};
 const create=(jobId:string,initials:string,id=randomId())=>mutate({action:'create',jobId,initials,id}).then(a=>{if(!a)throw new Error('La création n’a pas été confirmée.');return a;});
 const status=(id:string,status:string)=>mutate({action:'status',id,status,expectedRevision:record(id).revision});
 const reopen=(id:string,reason:string)=>mutate({action:'reopen',id,reason,expectedRevision:record(id).revision});
 const merge=(id:string,targetId:string)=>mutate({action:'merge',id,targetId,expectedRevision:record(id).revision,targetRevision:record(targetId).revision});
 return {applications:records.map(r=>r.application),history,ready,error,busy,create,status,reopen,merge,refresh};
}
