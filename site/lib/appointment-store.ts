import {z} from 'zod';
import {ApplicationError,validateApplicationLink,syncApplication} from './application-store';
import {appointmentSchema,appointmentExpiry} from './appointments';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}});
export async function handleAppointments(request:Request,env:{DB?:D1Database},now=Date.now()){
 const user=request.headers.get('oai-authenticated-user-id');if(!user)return json({error:'Connectez-vous pour consulter vos entretiens.'},401);
 if((request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origine non autorisée.'},403);
 if(!['GET','PUT'].includes(request.method))return json({error:'Méthode non autorisée.'},405);
 if(!env.DB)return json({error:'Agenda indisponible.'},503);
 try{
 await env.DB.prepare('DELETE FROM recruitment_appointments WHERE expires_at <= ?').bind(now).run();
 if(request.method==='GET'){const data=await env.DB.prepare('SELECT payload,revision FROM recruitment_appointments WHERE user_id = ? AND expires_at > ? LIMIT 1000').bind(user,now).all<{payload:string;revision:number}>();return json({records:data.results.map(r=>({appointment:appointmentSchema.parse(JSON.parse(r.payload)),revision:r.revision}))});}
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON requis.'},415);
 const body=await request.text();if(body.length>10000)return json({error:'Demande trop volumineuse.'},413);
 const input=z.object({appointment:appointmentSchema,expectedRevision:z.number().int().min(0)}).strict().parse(JSON.parse(body));
 const parent=await env.DB.prepare('SELECT id FROM recruitment_jobs WHERE user_id = ? AND id = ?').bind(user,input.appointment.jobId).first();if(!parent)return json({error:'Poste introuvable ou non autorisé.'},404);
 await validateApplicationLink(env.DB,user,input.appointment.applicationId,input.appointment.jobId,input.appointment.reference,now);
 const old=await env.DB.prepare('SELECT payload,revision FROM recruitment_appointments WHERE user_id = ? AND id = ?').bind(user,input.appointment.id).first<{payload:string;revision:number}>();
 if((old?.revision??0)!==input.expectedRevision)return json({error:'Cet entretien a changé. Rechargez l’agenda.'},409);
 const previous=old?appointmentSchema.parse(JSON.parse(old.payload)):null;
 if(previous&&(previous.jobId!==input.appointment.jobId||previous.reference!==input.appointment.reference||previous.createdAt!==input.appointment.createdAt||(previous.applicationId??previous.id)!==(input.appointment.applicationId??input.appointment.id)))return json({error:'L’identité et le rattachement de l’entretien ne peuvent pas être modifiés.'},400);
 const changed=!previous?input.appointment.outcome!=='À décider':previous.outcome!==input.appointment.outcome;
 const appointment={...input.appointment,updatedAt:new Date(now).toISOString(),outcomeAt:changed?new Date(now).toISOString():previous?.outcomeAt??null,outcomeBy:changed?user:previous?.outcomeBy??null};
 const expiry=appointmentExpiry(appointment);if(expiry<=now)return json({error:'La conservation de cet entretien a expiré.'},410);
 if(!old){const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM recruitment_appointments WHERE user_id = ?').bind(user).first<{total:number}>();if((count?.total??0)>=1000)return json({error:'La limite de 1 000 entretiens planifiés est atteinte.'},409);}
 const revision=input.expectedRevision+1;
 const result=old?await env.DB.prepare('UPDATE recruitment_appointments SET payload = ?, revision = ?, expires_at = ? WHERE user_id = ? AND id = ? AND revision = ?').bind(JSON.stringify(appointment),revision,expiry,user,appointment.id,input.expectedRevision).run():await env.DB.prepare('INSERT INTO recruitment_appointments (user_id,id,payload,revision,expires_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(user,appointment.id,JSON.stringify(appointment),revision,expiry).run();
 if(result.meta.changes)await syncApplication(env.DB,user,appointment,expiry,now);
 return result.meta.changes?json({appointment,revision}):json({error:'Conflit de sauvegarde. Rechargez l’agenda.'},409);
 }catch(e){if(e instanceof ApplicationError)return json({error:e.message},e.status);return json({error:e instanceof z.ZodError||e instanceof SyntaxError?'Vérifiez les initiales et la date de l’entretien.':'Enregistrement de l’entretien impossible.'},e instanceof z.ZodError||e instanceof SyntaxError?400:503);}
}
