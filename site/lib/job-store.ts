import {z} from 'zod';
import {jobSchema} from './jobs';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}});
export async function handleJobs(request:Request,env:{DB?:D1Database}){
 const user=request.headers.get('oai-authenticated-user-id');if(!user)return json({error:'Connectez-vous avec ChatGPT pour retrouver vos postes.'},401);
 if((request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origine non autorisée.'},403);
 if(!['GET','PUT'].includes(request.method))return json({error:'Méthode non autorisée.'},405);
 if(!env.DB)return json({error:'Le stockage des postes est indisponible.'},503);
 try{
  if(request.method==='GET'){const data=await env.DB.prepare('SELECT payload,revision FROM recruitment_jobs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200').bind(user).all<{payload:string;revision:number}>();return json({records:data.results.map(r=>({job:jobSchema.parse(JSON.parse(r.payload)),revision:r.revision}))});}
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON requis.'},415);
  const body=await request.text();if(body.length>1200000)return json({error:'Le dossier du poste dépasse la taille autorisée.'},413);
  const input=z.object({job:jobSchema,expectedRevision:z.number().int().min(0),legacyImport:z.boolean().optional()}).strict().parse(JSON.parse(body));
  const old=await env.DB.prepare('SELECT payload,revision FROM recruitment_jobs WHERE user_id = ? AND id = ?').bind(user,input.job.id).first<{payload:string;revision:number}>();
  if((old?.revision??0)!==input.expectedRevision)return json({error:'Ce poste a été modifié ailleurs. Rechargez la page avant de continuer.'},409);
  if(old&&jobSchema.parse(JSON.parse(old.payload)).createdAt!==input.job.createdAt)return json({error:'La date de création ne peut pas être modifiée.'},400);
  if(!old){const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM recruitment_jobs WHERE user_id = ?').bind(user).first<{total:number}>();if((count?.total??0)>=200)return json({error:'La limite de 200 postes est atteinte.'},409);}
  const job={...input.job,updatedAt:new Date().toISOString()};const revision=input.expectedRevision+1;let changes=0;
  if(old){changes=(await env.DB.prepare('UPDATE recruitment_jobs SET payload = ?, revision = ?, updated_at = ? WHERE user_id = ? AND id = ? AND revision = ?').bind(JSON.stringify(job),revision,job.updatedAt,user,job.id,input.expectedRevision).run()).meta.changes;}
  else{changes=(await env.DB.prepare('INSERT INTO recruitment_jobs (user_id,id,payload,revision,legacy_key,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(user,job.id,JSON.stringify(job),revision,input.legacyImport?'v12-single-workspace':null,job.updatedAt).run()).meta.changes;}
  if(!changes&&input.legacyImport&&!old){const existing=await env.DB.prepare('SELECT payload,revision FROM recruitment_jobs WHERE user_id = ? AND legacy_key = ?').bind(user,'v12-single-workspace').first<{payload:string;revision:number}>();if(existing)return json({job:jobSchema.parse(JSON.parse(existing.payload)),revision:existing.revision});}
  return changes?json({job,revision}):json({error:'Conflit d’enregistrement. Rechargez la liste des postes.'},409);
 }catch(error){if(error instanceof z.ZodError||error instanceof SyntaxError)return json({error:'Le poste contient des données invalides. Vérifiez le titre et les compteurs entiers positifs ou nuls.'},400);return json({error:'Enregistrement du poste impossible. Vos modifications restent affichées.'},503);}
}
