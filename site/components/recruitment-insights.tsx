'use client';
import {useMemo,useState} from 'react';
import type {RecruitmentJob} from '@/lib/jobs';
import type {RecruitmentApplication} from '@/lib/applications';
import type {Appointment} from '@/lib/appointments';
import type {AssessmentSession} from '@/lib/assessment';
import {assessmentTotals} from '@/lib/assessment';

type Props={jobs:RecruitmentJob[];applications:RecruitmentApplication[];appointments:Appointment[];sessions:AssessmentSession[];ready:boolean;onOpenCandidates:()=>void;onStatus:(id:string,status:string)=>Promise<unknown>};
const states=['En cours','À approfondir','Poursuivre','Go','No Go','Ne pas poursuivre','Embauché'] as const;
type Period='month'|'quarter'|'year'|'all';
function fromPeriod(p:Period,now:Date){if(p==='all')return 0;const y=now.getFullYear(),m=now.getMonth();return p==='month'?new Date(y,m,1).getTime():p==='quarter'?new Date(y,Math.floor(m/3)*3,1).getTime():new Date(y,0,1).getTime();}
function pct(n:number,d:number){return d?Math.round(100*n/d)+' %':'—';}
export function RecruitmentInsights({jobs,applications,appointments,sessions,ready,onOpenCandidates,onStatus}:Props){
 const [period,setPeriod]=useState<Period>('month'),[job,setJob]=useState('all'),[error,setError]=useState(''),[pending,setPending]=useState<string|null>(null);
 const [now]=useState(()=>Date.now());
 const visibleJobs=jobs.filter(j=>job==='all'||j.id===job),jobIds=new Set(visibleJobs.map(j=>j.id));
 const eligibleApps=applications.filter(a=>!a.mergedInto&&Date.parse(a.expiresAt)>now&&jobIds.has(a.jobId));
 const since=fromPeriod(period,new Date(now)),until=now;
 const selectedAppointments=appointments.filter(a=>jobIds.has(a.jobId)&&Date.parse(a.interviewAt)>=since&&Date.parse(a.interviewAt)<=until);
 const selectedSessions=sessions.filter(s=>s.jobId&&jobIds.has(s.jobId)&&Date.parse(s.interviewAt??s.createdAt)>=since&&Date.parse(s.interviewAt??s.createdAt)<=until);
 const interviews=useMemo(()=>{
  const keyed=new Map<string,{at:number;finished:boolean;score:number|null;decisionAt:number|null}>();
  for(const a of selectedAppointments){keyed.set('a:'+a.id,{at:Date.parse(a.interviewAt),finished:!!a.outcomeAt,score:null,decisionAt:a.outcomeAt?Date.parse(a.outcomeAt):null});}
  for(const s of selectedSessions){
   const key=s.appointmentId&&keyed.has('a:'+s.appointmentId)?'a:'+s.appointmentId:'s:'+s.id;
   const earlier=keyed.get(key),t=assessmentTotals(s);
   keyed.set(key,{at:Date.parse(s.interviewAt??s.createdAt),finished:!!s.completedAt||!!s.decision||!!s.followUpOutcome||!!earlier?.finished,score:s.completedAt?t.score:null,decisionAt:s.decision?Date.parse(s.decision.date):s.followUpOutcome?Date.parse(s.followUpOutcome.at):earlier?.decisionAt??null});
  }
  return [...keyed.values()];
 },[appointments,sessions,job,period,now]);
 const completed=interviews.filter(x=>x.finished),withScore=completed.filter(x=>x.score!==null),decided=eligibleApps.filter(a=>a.decisionAt&&Date.parse(a.decisionAt)>=since&&Date.parse(a.decisionAt)<=until&&(a.status==='Go'||a.status==='No Go'||a.status==='Ne pas poursuivre'||a.status==='Embauché'));
 const go=decided.filter(a=>a.status==='Go'||a.status==='Embauché').length;
 const delays=completed.filter(x=>x.decisionAt!==null&&x.decisionAt>=x.at).map(x=>(x.decisionAt!-x.at)/86400000);
 const countByWeek=Array.from({length:6},(_,idx)=>{const end=now-(5-idx)*7*86400000;const start=end-7*86400000;return {label:'S-'+(5-idx),total:completed.filter(x=>x.at>=start&&x.at<end).length};});
 const maxWeekly=Math.max(1,...countByWeek.map(x=>x.total));
 return <section className="mt-6 space-y-5" aria-label="Pilotage des recrutements et des entretiens">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Workflow et KPI des entretiens</h2><p className="mt-1 text-xs text-slate-500">Données réelles enregistrées dans Recruitment Intelligence ; les suivis expirés sont exclus du Kanban.</p></div><div className="flex flex-wrap gap-2"><label className="text-xs">Poste<select aria-label="Filtrer les KPI par poste" className="field-control mt-1 block" value={job} onChange={e=>setJob(e.target.value)}><option value="all">Tous les postes</option>{jobs.map(j=><option value={j.id} key={j.id}>{j.title}</option>)}</select></label><label className="text-xs">Période<select aria-label="Période des entretiens" className="field-control mt-1 block" value={period} onChange={e=>setPeriod(e.target.value as Period)}><option value="month">Ce mois</option><option value="quarter">Ce trimestre</option><option value="year">Cette année</option><option value="all">Tout l'historique conservé</option></select></label></div></header>
  {!ready?<p role="status" className="text-sm text-slate-500">Chargement des données de suivi…</p>:<>
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Entretiens enregistrés',interviews.length],['Entretiens terminés',completed.length],['Taux de GO',pct(go,decided.length)],['Décisions définitives',decided.length],['Score moyen',withScore.length?(withScore.reduce((n,x)=>n+x.score!,0)/withScore.length).toFixed(1)+' %':'—'],['Grilles complètes',withScore.length],['Délai entretien → décision',delays.length?(delays.reduce((a,b)=>a+b,0)/delays.length).toFixed(1)+' j':'—'],['Taux de réalisation',pct(completed.length,interviews.filter(x=>x.at<=now).length)]].map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p></div>)}</div>
   <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-3 font-semibold">Entretiens terminés — six dernières semaines</h3><div className="flex h-28 items-end gap-4">{countByWeek.map(x=><div className="flex min-w-0 flex-1 flex-col items-center gap-1" key={x.label}><span className="text-xs tabular-nums">{x.total}</span><div className="w-full rounded-t bg-indigo-500" style={{height:Math.max(3,76*x.total/maxWeekly)+'px'}}/><span className="text-xs text-slate-500">{x.label}</span></div>)}</div></div>
   <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Kanban des candidatures</h3><button className="secondary-button" onClick={onOpenCandidates}>Ouvrir le suivi détaillé</button></div>
   {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
   <div className="flex gap-3 overflow-x-auto pb-3">{states.map(status=>{const rows=eligibleApps.filter(a=>a.status===status);return <div key={status} className="min-w-44 flex-1 rounded-xl bg-slate-100 p-3"><h4 className="mb-3 text-sm font-semibold">{status} <span className="font-normal text-slate-500">({rows.length})</span></h4><div className="space-y-2">{rows.map(a=><div key={a.id} className="rounded-lg border border-slate-200 bg-white p-3"><p className="font-medium">{a.reference}</p><p className="my-1 text-xs text-slate-500">{jobs.find(j=>j.id===a.jobId)?.title??'Poste inconnu'}</p><label className="block text-xs text-slate-500">Changer le statut<select aria-label={'Statut '+a.reference} className="field-control mt-1 w-full text-xs" value={a.status} disabled={pending!==null} onChange={async e=>{setPending(a.id);setError('');try{await onStatus(a.id,e.target.value);}catch(err){setError((err as Error).message);}finally{setPending(null);}}}>{states.map(v=><option key={v} value={v}>{v}</option>)}</select></label></div>)}</div></div>;})}</div>
   <p className="text-xs text-slate-500">Les statuts sont modifiés uniquement par action humaine et enregistrés par l'API de suivi existante. Une étape d'entretien ne constitue pas une décision GO/No GO. Les KPI utilisent les données encore conservées ; les entretiens sans clôture explicite ne sont pas supposés terminés.</p>
  </>}
 </section>;
}
