'use client';
import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {createJob,jobRecordSchema,LEGACY_WORKSPACE_KEY,migrateLegacyWorkspace,type JobRecord,type RecruitmentJob,type WorkspaceSnapshot} from '@/lib/jobs';
export function useJobStorage(){
 const [records,setRecords]=useState<JobRecord[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(0);
 const latest=useRef(new Map<string,JobRecord>()),queues=useRef(new Map<string,Promise<unknown>>());
 const publish=(record:JobRecord)=>{latest.current.set(record.job.id,record);setRecords([...latest.current.values()]);};
 async function put(job:RecruitmentJob,revision:number,legacyImport=false){const response=await fetch('/api/jobs',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({job,expectedRevision:revision,legacyImport})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'Enregistrement impossible.');const record=jobRecordSchema.parse(data);publish(record);return record;}
 useEffect(()=>{let cancelled=false;void(async()=>{try{
  const response=await fetch('/api/jobs',{cache:'no-store'});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'Chargement des postes impossible.');const loaded=z.object({records:z.array(jobRecordSchema)}).parse(data).records;if(cancelled)return;
  latest.current=new Map(loaded.map(r=>[r.job.id,r]));setRecords(loaded);
  const legacy=localStorage.getItem(LEGACY_WORKSPACE_KEY);
  if(legacy){try{const workspace=migrateLegacyWorkspace(JSON.parse(legacy));if(Object.values(workspace.brief).some(v=>v.trim())||workspace.scorecard||workspace.jobAd.length||workspace.styleCorpus.trim()){const job={...createJob(workspace.brief.roleTitle||'Poste repris'),workspace};await put(job,0,true);}localStorage.removeItem(LEGACY_WORKSPACE_KEY);}catch{setError('Le dossier précédent n’a pas pu être repris. Sa copie locale a été conservée.');}}
  if(!cancelled)setReady(true);
 }catch(e){if(!cancelled)setError((e as Error).message);}})();return()=>{cancelled=true;};},[]);
 function update(id:string,patch:Partial<Pick<RecruitmentJob,'title'|'status'|'inProgress'|'closed'|'workspace'>>){
  const previous=queues.current.get(id)??Promise.resolve();setPending(n=>n+1);
  const work=previous.catch(()=>undefined).then(async()=>{const old=latest.current.get(id);if(!old)throw new Error('Poste introuvable.');const next={...old.job,...patch};if(JSON.stringify(next)===JSON.stringify(old.job))return old;return put(next,old.revision);});
  queues.current.set(id,work);void work.catch(e=>setError((e as Error).message)).finally(()=>setPending(n=>n-1));return work;
 }
 async function add(title:string,preferences:Partial<Pick<WorkspaceSnapshot,'styleCorpus'|'modelPreference'|'jobFormat'|'jobTone'>>={}){setPending(n=>n+1);try{const job=createJob(title);job.workspace={...job.workspace,...preferences};const result=await put(job,0);setError('');return result;}catch(e){setError((e as Error).message);throw e;}finally{setPending(n=>n-1);}}
 async function remove(id:string){
  const record=latest.current.get(id);if(!record)throw new Error('Poste introuvable.');
  if(queues.current.has(id))await queues.current.get(id);
  setPending(n=>n+1);
  try{
   const response=await fetch('/api/jobs',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id,expectedRevision:record.revision})});
   const body=await response.json() as {error?:string;deleted?:boolean};
   if(!response.ok||!body.deleted)throw new Error(body.error||'Suppression impossible.');
   latest.current.delete(id);setRecords([...latest.current.values()]);setError('');
  }catch(e){setError((e as Error).message);throw e;}finally{setPending(n=>n-1);}
 }
 async function saveWorkspace(id:string,workspace:WorkspaceSnapshot){const result=await update(id,{workspace,...(workspace.brief.roleTitle.trim()?{title:workspace.brief.roleTitle.trim()}:{} )});return result;}
 return {records,ready,error,pending,setError,add,update,remove,saveWorkspace,getRecord:(id:string)=>latest.current.get(id)};
}
