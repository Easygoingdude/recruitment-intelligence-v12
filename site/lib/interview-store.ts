import { z } from 'zod';
import {ApplicationError,validateApplicationLink,ownedApplication,syncApplication,purgeExpiredApplications} from './application-store';
import {isFinalApplication} from './applications';
import { assessmentSchema, interviewExpiry, type AssessmentSession } from './assessment';
import { assertNoDirectIdentifiers, redactDirectIdentifiers } from './candidate-privacy';

type Env = {DB?:D1Database};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}});
export async function purgeExpiredInterviews(db:D1Database,now=Date.now()) {
  const result=await db.prepare('DELETE FROM interviews WHERE expires_at <= ?').bind(now).run();
  await db.prepare('DELETE FROM recruitment_appointments WHERE expires_at <= ?').bind(now).run();
  await purgeExpiredApplications(db,now);
  return result.meta.changes;
}
// Traverse string values only: never rewrite JSON syntax or identifiers/UUIDs.
export function minimiseInterview(session:AssessmentSession):AssessmentSession {
  const technicalIds=new Set(['id','jobId','applicationId','appointmentId']);
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clean=(value:unknown,key=''):unknown=>{
    if(typeof value==='string'){
      // These fields are UUIDs validated by the input schema, never candidate text.
      // A numeric UUID suffix can otherwise resemble a phone or identity number.
      if(technicalIds.has(key)&&uuid.test(value))return value;
      const safe=redactDirectIdentifiers(value).value;assertNoDirectIdentifiers(safe);return safe;
    }
    return Array.isArray(value)?value.map(v=>clean(v)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v,k)])):value;
  };
  const safe=assessmentSchema.parse(clean(session));
  const content=JSON.stringify(safe);
  if(/(?:nom|prénom|candidate?\s+name)\s*[:=]\s*[\p{L}]{2}/iu.test(content))throw new Error('Retirez les noms et utilisez les initiales avant d’enregistrer.');
  return safe;
}
export async function handleInterviews(request:Request,env:Env,now=Date.now()):Promise<Response> {
  const url=new URL(request.url);
  const user=request.headers.get('oai-authenticated-user-id');
  const cleanup=url.pathname==='/api/interviews/cleanup';
  // Cleanup has no data return and only deletes expired rows. This endpoint is
  // behind the owner-private Sites access boundary, including service dispatch.
  if(!user&&!cleanup)return json({error:'Connectez-vous avec ChatGPT.'},401);
  if((request.headers.get('origin')&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origine non autorisée.'},403);
  if(!env.DB)return json({error:'Le stockage des entretiens est indisponible. Vos modifications ne sont pas enregistrées.'},503);
  if(!['GET','PUT','DELETE','POST'].includes(request.method))return json({error:'Méthode non autorisée.'},405);
  try {
    if(cleanup) {
      if(request.method!=='POST')return json({error:'POST requis.'},405);
      return json({deleted:await purgeExpiredInterviews(env.DB,now),checkedAt:new Date(now).toISOString()});
    }
    await purgeExpiredInterviews(env.DB,now);
    if(request.method==='GET') {
      const rows=await env.DB.prepare('SELECT payload, revision FROM interviews WHERE user_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 100').bind(user,now).all<{payload:string;revision:number}>();
      return json({records:rows.results.map(row=>({session:assessmentSchema.parse(JSON.parse(row.payload)),revision:row.revision}))});
    }
    if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON requis.'},415);
    const body=await request.text();if(body.length>800000)return json({error:'Entretien trop volumineux.'},413);
    const raw=JSON.parse(body);
    if(request.method==='DELETE') {
      const input=z.object({id:z.string().uuid(),expectedRevision:z.number().int().positive()}).strict().parse(raw);
      const result=await env.DB.prepare('DELETE FROM interviews WHERE user_id = ? AND id = ? AND revision = ?').bind(user,input.id,input.expectedRevision).run();
      return result.meta.changes?json({deleted:true}):json({error:'La session a changé ou a été supprimée. Rechargez la liste.'},409);
    }
    if(request.method!=='PUT')return json({error:'Méthode non autorisée.'},405);
    const input=z.object({session:assessmentSchema,expectedRevision:z.number().int().min(0)}).strict().parse(raw);
    let safe=minimiseInterview(input.session);
    if(safe.jobId){
      const job=await env.DB.prepare('SELECT id FROM recruitment_jobs WHERE user_id = ? AND id = ?').bind(user,safe.jobId).first();
      if(!job)return json({error:'Poste introuvable ou non autorisé.'},404);
    }
    await validateApplicationLink(env.DB,user!,safe.applicationId,safe.jobId,safe.reference,now);
    if(safe.appointmentId){
      const planned=await env.DB.prepare('SELECT payload FROM recruitment_appointments WHERE user_id = ? AND id = ?').bind(user,safe.appointmentId).first<{payload:string}>();
      const appointment=planned?JSON.parse(planned.payload):null;
      if(!appointment||appointment.jobId!==safe.jobId||appointment.reference!==safe.reference||(safe.applicationId??appointment.applicationId??appointment.id)!==(appointment.applicationId??appointment.id))return json({error:'Le rendez-vous ne correspond pas à cet entretien.'},400);
    }
    const old=await env.DB.prepare('SELECT payload, revision, expires_at FROM interviews WHERE user_id = ? AND id = ?').bind(user,safe.id).first<{payload:string;revision:number;expires_at:number}>();
    if((old?.revision??0)!==input.expectedRevision)return json({error:'Une autre version existe. Rechargez avant de modifier cet entretien.'},409);
    if(old){const previous=assessmentSchema.parse(JSON.parse(old.payload));if((previous.jobId&&previous.jobId!==safe.jobId)||(previous.appointmentId&&previous.appointmentId!==safe.appointmentId)||((previous.applicationId??previous.appointmentId??previous.id)!==(safe.applicationId??safe.appointmentId??safe.id)&&!!previous.jobId))return json({error:'Le rattachement d’un entretien existant ne peut pas être remplacé.'},400);}
    const previousDecision=old?assessmentSchema.parse(JSON.parse(old.payload)).decision:null;
    if(safe.decision&&JSON.stringify(safe.decision)!==JSON.stringify(previousDecision)){
      const app=await ownedApplication(env.DB,user!,safe.applicationId??safe.appointmentId??safe.id);
      if(app&&isFinalApplication(app.application)&&safe.decision.value!==app.application.status)return json({error:'Réouvrez la candidature avec un motif avant de modifier sa décision finale.'},409);
      safe={...safe,decision:{...safe.decision,date:new Date(now).toISOString()}};
    }
    // Date follow-up actions on the server; resaving unchanged evidence must not
    // manufacture a newer outcome and override a later human M5 decision.
    const previousFollowUp=old?assessmentSchema.parse(JSON.parse(old.payload)).followUpOutcome:undefined;
    if(safe.followUpOutcome&&JSON.stringify(safe.followUpOutcome)!==JSON.stringify(previousFollowUp))safe={...safe,followUpOutcome:{...safe.followUpOutcome,at:new Date(now).toISOString()}};
    if(old&&assessmentSchema.parse(JSON.parse(old.payload)).createdAt!==safe.createdAt)return json({error:'La date de création ne peut pas être modifiée.'},400);
    if(Date.parse(safe.createdAt)>now+60000||Date.parse(safe.interviewAt??safe.createdAt)>now+60000)return json({error:'La date de l’entretien ne peut pas être future.'},400);
    const expiry=Math.min(interviewExpiry(safe),old?.expires_at??Infinity);
    if(expiry<=now)return json({error:'Cet entretien a dépassé les 14 jours de conservation.'},410);
    safe={...safe,retainedUntil:new Date(expiry).toISOString()};
    const revision=input.expectedRevision+1;
    let changed=0;
    if(old) {
      const result=await env.DB.prepare('UPDATE interviews SET payload = ?, revision = ?, expires_at = ? WHERE user_id = ? AND id = ? AND revision = ?').bind(JSON.stringify(safe),revision,expiry,user,safe.id,input.expectedRevision).run();changed=result.meta.changes;
    } else {
      const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM interviews WHERE user_id = ?').bind(user).first<{total:number}>();
      if((count?.total??0)>=100)return json({error:'La limite de 100 entretiens actifs est atteinte.'},409);
      const result=await env.DB.prepare('INSERT INTO interviews (user_id, id, payload, revision, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id,id) DO NOTHING').bind(user,safe.id,JSON.stringify(safe),revision,expiry).run();changed=result.meta.changes;
    }
    if(changed)await syncApplication(env.DB,user!,safe,expiry,now);
    return changed?json({session:safe,revision}):json({error:'Conflit de sauvegarde. Rechargez la liste.'},409);
  } catch(error) {
    if(error instanceof ApplicationError)return json({error:error.message},error.status);
    if(error instanceof z.ZodError||error instanceof SyntaxError)return json({error:'Les données de l’entretien sont invalides.'},400);
    if(error instanceof Error&&/initiales/.test(error.message))return json({error:error.message},400);
    return json({error:'Enregistrement impossible. Réessayez sans fermer la page.'},503);
  }
}
