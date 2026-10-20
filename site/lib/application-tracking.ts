import {activeInterviews,type AssessmentSession} from './assessment';
import {appointmentExpiry,type Appointment} from './appointments';

export type ApplicationStatus='Entretien planifié'|'En évaluation'|'À décider'|'Go'|'No Go'|'À approfondir'|'Poursuivre'|'Ne pas poursuivre';
export type TrackedApplication={key:string;jobId:string;reference:string;interviewAt:string;updatedAt:string;status:ApplicationStatus;closed:boolean;appointmentId?:string;sessionId?:string;source:'Agenda'|'M4'|'Suivi'|'M5'};
type Event={at:string;status:ApplicationStatus;source:TrackedApplication['source'];priority:number};
/** @deprecated V12.7 projection retained for compatibility tests. Production uses
 * persisted applications and their M5/reopening rules in application-store.ts. */
export function trackedApplications(appointments:Appointment[],sessions:AssessmentSession[],now=Date.now()):TrackedApplication[]{
 const groups=new Map<string,{row:TrackedApplication;events:Event[]}>();
 const appointmentKey=(jobId:string,id:string)=>`${jobId}:appointment:${id}`;
 for(const a of appointments){
  if(appointmentExpiry(a)<=now)continue;
  const key=appointmentKey(a.jobId,a.id);
  groups.set(key,{row:{key,jobId:a.jobId,reference:a.reference,interviewAt:a.interviewAt,updatedAt:a.updatedAt,status:'Entretien planifié',closed:false,appointmentId:a.id,source:'Agenda'},events:a.outcomeAt?[{at:a.outcomeAt,status:a.outcome,source:'Suivi',priority:1}]:[]});
 }
 for(const s of activeInterviews(sessions,now)){
  if(!s.jobId)continue;
  const key=s.appointmentId?appointmentKey(s.jobId,s.appointmentId):`${s.jobId}:session:${s.id}`;
  let group=groups.get(key);
  if(!group){group={row:{key,jobId:s.jobId,reference:s.reference,interviewAt:s.interviewAt??s.createdAt,updatedAt:s.updatedAt,status:'En évaluation',closed:false,appointmentId:s.appointmentId,sessionId:s.id,source:'M4'},events:[]};groups.set(key,group);}
  else {group.row.status='En évaluation';group.row.source='M4';if(s.updatedAt>=group.row.updatedAt){group.row.updatedAt=s.updatedAt;group.row.sessionId=s.id;}else group.row.sessionId??=s.id;}
  if(s.followUpOutcome)group.events.push({at:s.followUpOutcome.at,status:s.followUpOutcome.value,source:'Suivi',priority:1});
  if(s.decision)group.events.push({at:s.decision.date,status:s.decision.value,source:'M5',priority:2});
 }
 return [...groups.values()].map(({row,events})=>{
  const last=events.sort((a,b)=>b.at.localeCompare(a.at)||b.priority-a.priority)[0];
  const status=last?.status??row.status;
  return {...row,status,source:last?.source??row.source,closed:status==='No Go'||status==='Ne pas poursuivre',updatedAt:last&&last.at>row.updatedAt?last.at:row.updatedAt};
 }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.key.localeCompare(b.key));
}
export function applicationCounts(rows:TrackedApplication[],jobId:string){return rows.reduce((counts,row)=>row.jobId!==jobId?counts:{inProgress:counts.inProgress+(row.closed?0:1),closed:counts.closed+(row.closed?1:0)},{inProgress:0,closed:0});}
