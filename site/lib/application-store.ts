import {z} from 'zod';
import {applicationSchema,newApplication,isClosedApplication,isFinalApplication,reopenReasons,type RecruitmentApplication,type ApplicationRecord} from './applications';
import {appointmentSchema,appointmentExpiry,type Appointment} from './appointments';
import {assessmentSchema,interviewExpiry,type AssessmentSession} from './assessment';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}});
export class ApplicationError extends Error{constructor(message:string,public status=409){super(message);}}
const load=async(db:D1Database,user:string,id:string):Promise<ApplicationRecord|null>=>{const row=await db.prepare('SELECT payload,revision FROM recruitment_applications WHERE user_id = ? AND id = ?').bind(user,id).first<{payload:string;revision:number}>();return row?{application:applicationSchema.parse(JSON.parse(row.payload)),revision:row.revision}:null;};
export async function ownedApplication(db:D1Database,user:string,id:string):Promise<ApplicationRecord|null>{let row=await load(db,user,id);const seen=new Set<string>();while(row?.application.mergedInto){if(seen.has(row.application.id))throw new ApplicationError('Rattachement incohérent.',409);seen.add(row.application.id);row=await load(db,user,row.application.mergedInto);}return row;}
async function save(db:D1Database,user:string,a:RecruitmentApplication,revision:number){return(await db.prepare('UPDATE recruitment_applications SET payload = ?, revision = revision + 1, expires_at = ? WHERE user_id = ? AND id = ? AND revision = ?').bind(JSON.stringify(a),Date.parse(a.expiresAt),user,a.id,revision).run()).meta.changes>0;}
export async function validateApplicationLink(db:D1Database,user:string,applicationId:string|undefined,jobId:string|undefined,reference:string,now:number){if(!applicationId)return;const r=await ownedApplication(db,user,applicationId);if(!r||r.application.jobId!==jobId||Date.parse(r.application.expiresAt)<=now)throw new ApplicationError('Candidature introuvable, expirée ou liée à un autre poste.',404);const original=await load(db,user,applicationId);if(r.application.reference!==reference&&original?.application.reference!==reference)throw new ApplicationError('La référence ne correspond pas à cette candidature.',400);}
/** Reconciles legacy rows idempotently. No initials-based identity matching. */
export async function syncApplication(db:D1Database,user:string,source:Appointment|AssessmentSession,expiry:number,now=Date.now()){
 if(!source.jobId||expiry<=now)return;
 const id=source.applicationId??('outcome' in source?source.id:source.appointmentId??source.id);
 let record=await ownedApplication(db,user,id);
 const alias=await load(db,user,id);if(alias?.application.mergedInto&&expiry>Date.parse(alias.application.expiresAt))await save(db,user,{...alias.application,expiresAt:new Date(expiry).toISOString()},alias.revision);
 if(!record){
  const job=await db.prepare('SELECT id FROM recruitment_jobs WHERE user_id = ? AND id = ?').bind(user,source.jobId).first();if(!job)return;
  const a={...newApplication(source.jobId,source.reference,id,now),reference:source.reference,createdAt:source.createdAt,expiresAt:new Date(expiry).toISOString()};
  await db.prepare('INSERT INTO recruitment_applications (user_id,id,job_id,payload,revision,expires_at) VALUES (?,?,?,?,1,?) ON CONFLICT DO NOTHING').bind(user,id,source.jobId,JSON.stringify(a),expiry).run();record=await ownedApplication(db,user,id);
 }
 for(let attempt=0;attempt<5&&record;attempt++){
  const a=record.application;if(a.jobId!==source.jobId)throw new ApplicationError('Rattachement de candidature incohérent.',400);
  let next={...a,expiresAt:new Date(Math.max(Date.parse(a.expiresAt),expiry)).toISOString()};
  const event='outcome' in source?(source.outcomeAt&&source.outcome!=='À décider'?{value:source.outcome,at:source.outcomeAt,source:'Suivi' as const}:null):source.decision&&source.decision.value!=='À décider'?{value:source.decision.value,at:source.decision.date,source:'M5' as const}:source.followUpOutcome?{value:source.followUpOutcome.value,at:source.followUpOutcome.at,source:'Suivi' as const}:null;
  if(event){
   const afterReopen=!a.reopenedAt||Date.parse(event.at)>Date.parse(a.reopenedAt);
   const newer=!a.decisionAt||Date.parse(event.at)>Date.parse(a.decisionAt)||(event.at===a.decisionAt&&event.source==='M5'&&a.source!=='M5');
   const stageAllowed=a.source!=='M5'&&a.status!=='Embauché'&&!(isClosedApplication(a)&&event.value==='Go');
   if(afterReopen&&((event.source==='M5'&&!isFinalApplication(a)&&(a.source!=='M5'||newer))||(event.source==='Suivi'&&stageAllowed&&newer)))next={...next,status:event.value,source:event.source,decisionAt:event.at};
  }
  if(JSON.stringify(next)===JSON.stringify(a))return a;
  next.updatedAt=new Date(now).toISOString();
  if(await save(db,user,next,record.revision))return next;
  record=await ownedApplication(db,user,id);
 }
 throw new ApplicationError('La candidature a changé. Rechargez le suivi.');
}
export async function reconcileApplications(db:D1Database,user:string,now:number){
 const [appointments,sessions]=await Promise.all([db.prepare('SELECT payload FROM recruitment_appointments WHERE user_id = ? AND expires_at > ?').bind(user,now).all<{payload:string}>(),db.prepare('SELECT payload FROM interviews WHERE user_id = ? AND expires_at > ?').bind(user,now).all<{payload:string}>()]);
 for(const row of appointments.results){const a=appointmentSchema.parse(JSON.parse(row.payload));await syncApplication(db,user,a,appointmentExpiry(a),now);}
 for(const row of sessions.results){const s=assessmentSchema.parse(JSON.parse(row.payload));await syncApplication(db,user,s,interviewExpiry(s),now);}
}
export async function purgeExpiredApplications(db:D1Database,now=Date.now()){await db.prepare('DELETE FROM recruitment_applications WHERE expires_at <= ?').bind(now).run();}
export async function handleApplications(request:Request,env:{DB?:D1Database},now=Date.now()){
 const user=request.headers.get('oai-authenticated-user-id');if(!user)return json({error:'Connectez-vous avec ChatGPT.'},401);
 if((request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origine non autorisée.'},403);
 if(!env.DB)return json({error:'Le suivi des candidatures est indisponible.'},503);const db=env.DB;
 if(!['GET','POST'].includes(request.method))return json({error:'Méthode non autorisée.'},405);
 try{
  if(request.method==='GET'){
   if(new URL(request.url).searchParams.get('refresh')!=='1')await reconcileApplications(db,user,now);await purgeExpiredApplications(db,now);
   const [rows,history]=await Promise.all([db.prepare('SELECT payload,revision FROM recruitment_applications WHERE user_id = ? AND expires_at > ? ORDER BY expires_at DESC').bind(user,now).all<{payload:string;revision:number}>(),db.prepare('SELECT job_id AS jobId,month,total,closed,in_progress AS inProgress FROM recruitment_application_history WHERE user_id = ? ORDER BY month DESC').bind(user).all()]);
   return json({records:rows.results.map(r=>({application:applicationSchema.parse(JSON.parse(r.payload)),revision:r.revision})),history:history.results});
  }
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON requis.'},415);
  const body=await request.text();if(body.length>6000)return json({error:'Demande trop volumineuse.'},413);
  const raw=JSON.parse(body);
  if(raw.action==='create'){
   const input=z.object({action:z.literal('create'),id:z.string().uuid(),jobId:z.string().uuid(),initials:z.string().max(40)}).strict().parse(raw);
   const job=await db.prepare('SELECT id FROM recruitment_jobs WHERE user_id = ? AND id = ?').bind(user,input.jobId).first();if(!job)return json({error:'Poste introuvable.'},404);
   const existing=await load(db,user,input.id);if(existing){if(existing.application.jobId!==input.jobId)return json({error:'Identifiant déjà utilisé.'},409);return json(existing);}
   const count=await db.prepare('SELECT COUNT(*) AS n FROM recruitment_applications WHERE user_id = ?').bind(user).first<{n:number}>();if((count?.n??0)>=2000)return json({error:'La limite de 2 000 candidatures actives est atteinte.'},409);
   const application=newApplication(input.jobId,input.initials,input.id,now);
   const result=await db.prepare('INSERT INTO recruitment_applications (user_id,id,job_id,payload,revision,expires_at) VALUES (?,?,?,?,1,?) ON CONFLICT DO NOTHING').bind(user,application.id,application.jobId,JSON.stringify(application),Date.parse(application.expiresAt)).run();return result.meta.changes?json({application,revision:1}):json({error:'Identifiant déjà utilisé. Rechargez la liste.'},409);
  }
  const input=z.discriminatedUnion('action',[
   z.object({action:z.literal('status'),id:z.string().uuid(),expectedRevision:z.number().int().positive(),status:z.enum(['Go','No Go','À approfondir','Embauché'])}).strict(),
   z.object({action:z.literal('reopen'),id:z.string().uuid(),expectedRevision:z.number().int().positive(),reason:z.enum(reopenReasons)}).strict(),
   z.object({action:z.literal('merge'),id:z.string().uuid(),expectedRevision:z.number().int().positive(),targetId:z.string().uuid(),targetRevision:z.number().int().positive()}).strict()
  ]).parse(raw);
  const record=await load(db,user,input.id);if(!record||record.application.mergedInto||Date.parse(record.application.expiresAt)<=now)return json({error:'Candidature introuvable ou expirée.'},404);
  if(record.revision!==input.expectedRevision)return json({error:'La candidature a changé. Rechargez la page.'},409);
  const a=record.application,at=new Date(now).toISOString();let next:RecruitmentApplication;
  if(input.action==='merge'){
   const target=await load(db,user,input.targetId);if(!target||target.application.mergedInto||Date.parse(target.application.expiresAt)<=now)return json({error:'Candidature cible introuvable.'},404);
   if(a.id===target.application.id||a.jobId!==target.application.jobId||a.reference.split('-')[0]!==target.application.reference.split('-')[0])return json({error:'Choisissez deux références de mêmes initiales sur le même poste, puis vérifiez qu’il s’agit de la même personne.'},400);
   if(target.revision!==input.targetRevision)return json({error:'La candidature cible a changé.'},409);
   // The selected target keeps its decision. Tombstones prevent a legacy source from being recreated.
   const t={...target.application,expiresAt:new Date(Math.max(Date.parse(a.expiresAt),Date.parse(target.application.expiresAt))).toISOString(),updatedAt:at,audit:[...target.application.audit,{at,event:'Regroupement' as const,author:user}].slice(-30)};
   // Conditional batch is atomic; both updates use the same revision guards.
   const targetGuard='EXISTS (SELECT 1 FROM recruitment_applications WHERE user_id = ? AND id = ? AND revision = ?)';
   const results=await db.batch([
    db.prepare(`UPDATE recruitment_applications SET payload = ?, revision = revision + 1 WHERE user_id = ? AND id = ? AND revision = ? AND ${targetGuard}`).bind(JSON.stringify({...a,mergedInto:t.id,updatedAt:at}),user,a.id,record.revision,user,t.id,target.revision),
    db.prepare('UPDATE recruitment_applications SET payload = ?, revision = revision + 1, expires_at = ? WHERE user_id = ? AND id = ? AND revision = ? AND EXISTS (SELECT 1 FROM recruitment_applications WHERE user_id = ? AND id = ? AND revision = ? AND json_extract(payload,\'$.mergedInto\') = ?)').bind(JSON.stringify(t),Date.parse(t.expiresAt),user,t.id,target.revision,user,a.id,record.revision+1,t.id),
    db.prepare("UPDATE recruitment_applications SET payload = json_set(payload,'$.mergedInto',?), revision = revision + 1 WHERE user_id = ? AND json_extract(payload,'$.mergedInto') = ? AND EXISTS (SELECT 1 FROM recruitment_applications WHERE user_id = ? AND id = ? AND revision = ? AND json_extract(payload,'$.mergedInto') = ?)").bind(t.id,user,a.id,user,a.id,record.revision+1,t.id)
   ]);if(results.slice(0,2).some(r=>!r.meta.changes))throw new ApplicationError('Le regroupement a changé. Rechargez la liste.');return json({merged:true});
  }
  if(input.action==='reopen')next={...a,status:'En cours',source:'Candidature',decisionAt:at,reopenedAt:at,updatedAt:at,audit:[...a.audit,{at,event:'Réouverture' as const,reason:input.reason,author:user}].slice(-30)};
  else{
   if(isClosedApplication(a)||a.source==='M5')return json({error:'La décision d’évaluation est conservée. Réouvrez explicitement la candidature avec un motif pour la modifier.'},409);
   next={...a,status:input.status,source:'Candidature',decisionAt:at,updatedAt:at,audit:[...a.audit,{at,event:'Statut' as const,author:user}].slice(-30)};
  }
  return await save(db,user,next,record.revision)?json({application:next,revision:record.revision+1}):json({error:'Conflit de sauvegarde.'},409);
 }catch(e){if(e instanceof ApplicationError)return json({error:e.message},e.status);if(e instanceof z.ZodError||e instanceof SyntaxError)return json({error:'Vérifiez les initiales et les champs de la candidature.'},400);if(e instanceof Error&&/initiales/i.test(e.message))return json({error:e.message},400);return json({error:'Enregistrement du suivi impossible. Rechargez la page avant de réessayer.'},503);}
}
