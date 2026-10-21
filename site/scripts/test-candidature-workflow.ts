import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleApplications} from '../lib/application-store';
import {handleJobs} from '../lib/job-store';
import {handleAppointments} from '../lib/appointment-store';
import {handleInterviews,purgeExpiredInterviews} from '../lib/interview-store';
import {applicationSummary,resolveApplication} from '../lib/applications';
import {createJob} from '../lib/jobs';
import {createAppointment} from '../lib/appointments';
import {createAssessment,RETENTION_MS} from '../lib/assessment';
import {buildScorecard} from '../lib/recruitment-engine';
import {nextJobAction} from '../lib/next-action';
const sqlite=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const db={prepare(sql:string){const stmt=sqlite.prepare(sql);let params:any[]=[];const api={bind(...args:any[]){params=args;return api;},async run(){return{meta:{changes:Number(stmt.run(...params).changes)}};},async all(){return{results:stmt.all(...params)};},async first(){return stmt.get(...params)??null;}};return api;},async batch(statements:any[]){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
const env={DB:db},now=Date.now(),time=(d:number)=>new Date(now+d).toISOString();
const req=(path:string,method='GET',body?:unknown,user='owner',origin='https://test.invalid')=>new Request('https://test.invalid/api/'+path,{method,headers:{'content-type':'application/json',origin,...(user?{'oai-authenticated-user-id':user}:{})},body:body?JSON.stringify(body):undefined});
const get=async(user='owner',at=now)=>{const r=await handleApplications(req('applications','GET',undefined,user),env,at);assert.equal(r.status,200,await r.clone().text());return await r.json() as any;};
const action=async(body:any,at=now,user='owner')=>{const r=await handleApplications(req('applications','POST',body,user),env,at);return{status:r.status,body:await r.json() as any};};
assert.equal((await handleApplications(req('applications','GET',undefined,''),env,now)).status,401);
assert.equal((await handleApplications(req('applications','GET',undefined,'owner','https://evil.invalid'),env,now)).status,403);
const job=createJob('Responsable support'),other=createJob('ERP');await handleJobs(req('jobs','PUT',{job,expectedRevision:0}),env);await handleJobs(req('jobs','PUT',{job:other,expectedRevision:0}),env);
assert.equal(nextJobAction(job).label,'Compléter le besoin');job.workspace.brief.missions='Piloter le support';assert.equal(nextJobAction(job).label,'Préparer l’offre');
let result=await action({action:'create',id:crypto.randomUUID(),jobId:job.id,initials:'JD'});assert.equal(result.status,200);let candidate=result.body;
assert.match(candidate.application.reference,/^J\.D\.-/);assert.deepEqual(applicationSummary((await get()).records.map((r:any)=>r.application),job.id),{inProgress:1,closed:0});
assert.equal((await get('other')).records.length,0);
assert.equal((await action({action:'create',id:crypto.randomUUID(),jobId:job.id,initials:'Jean Dupont'})).status,400);
const appointments=[];
for(let i=0;i<3;i++){const a={...createAppointment(job.id,'JD',time(i*3600000)),applicationId:candidate.application.id,reference:candidate.application.reference};appointments.push(a);const r=await handleAppointments(req('appointments','PUT',{appointment:a,expectedRevision:0}),env,now);assert.equal(r.status,200,await r.clone().text());}
let data=await get();assert.equal(data.records.filter((r:any)=>!r.application.mergedInto).length,1);assert.deepEqual(applicationSummary(data.records.map((r:any)=>r.application)),{inProgress:1,closed:0});
const bad={...appointments[0],id:crypto.randomUUID(),jobId:other.id};assert.equal((await handleAppointments(req('appointments','PUT',{appointment:bad,expectedRevision:0}),env,now)).status,404);
const s={...createAssessment(buildScorecard(job.workspace.brief,'Manager',60,['Diagnostic']),job.title,'JD','YL'),jobId:job.id,applicationId:candidate.application.id,appointmentId:appointments[0].id,reference:candidate.application.reference,interviewAt:time(0)};
s.decision={value:'Ne pas poursuivre',date:time(999999),author:'Y.L.',justification:'Décision motivée après entretien.'};
let response=await handleInterviews(req('interviews','PUT',{session:s,expectedRevision:0}),env,now+10);assert.equal(response.status,200,await response.clone().text());let session:any=await response.json();assert.equal(session.session.decision.date,time(10));
data=await get();candidate=data.records[0];assert.equal(candidate.application.status,'Ne pas poursuivre');
response=await handleAppointments(req('appointments','PUT',{appointment:{...appointments[0],outcome:'Go'},expectedRevision:1}),env,now+20);assert.equal(response.status,200);assert.equal((await get()).records[0].application.status,'Ne pas poursuivre'); // a later stage Go never reopens M5
assert.equal((await action({action:'status',id:candidate.application.id,expectedRevision:candidate.revision,status:'Go'},now+30)).status,409);
assert.equal((await action({action:'reopen',id:candidate.application.id,expectedRevision:candidate.revision,reason:'Nom libre personnel'},now+30)).status,400);
result=await action({action:'reopen',id:candidate.application.id,expectedRevision:candidate.revision,reason:'Nouvelle information'},now+30);assert.equal(result.status,200);candidate=result.body;
data=await get('owner',now+31);assert.equal(data.records[0].application.status,'En cours'); // old M5 cannot reapply after explicit reopening
const duplicate=await action({action:'create',id:crypto.randomUUID(),jobId:job.id,initials:'JD'},now+40);assert.equal(duplicate.status,200);
const different=await action({action:'create',id:crypto.randomUUID(),jobId:job.id,initials:'AB'},now+40);
result=await action({action:'merge',id:different.body.application.id,expectedRevision:different.body.revision,targetId:candidate.application.id,targetRevision:candidate.revision},now+50);assert.equal(result.status,400);
result=await action({action:'merge',id:duplicate.body.application.id,expectedRevision:duplicate.body.revision,targetId:candidate.application.id,targetRevision:candidate.revision},now+50);assert.equal(result.status,200);
data=await get('owner',now+60);assert.equal(data.records.filter((r:any)=>!r.application.mergedInto).length,2);assert.equal(resolveApplication(data.records.map((r:any)=>r.application),duplicate.body.application.id)!.id,candidate.application.id);
const replay=await action({action:'merge',id:duplicate.body.application.id,expectedRevision:1,targetId:candidate.application.id,targetRevision:1},now+60);assert.equal(replay.status,404);
await purgeExpiredInterviews(db,now+RETENTION_MS+3*3600000+100);data=await get('owner',now+RETENTION_MS+3*3600000+100);assert.equal(data.records.length,0);assert.equal(data.history.reduce((n:number,h:any)=>n+h.total,0),2); // merged alias is never counted again
const serialised=JSON.stringify(data.history);assert.ok(!serialised.includes('J.D.')&&!serialised.includes(candidate.application.id)&&!serialised.includes('justification'));
const historyBefore=serialised;await purgeExpiredInterviews(db,now+RETENTION_MS+4*3600000);data=await get('owner',now+RETENTION_MS+4*3600000);assert.equal(JSON.stringify(data.history),historyBefore);assert.equal((await get('other',now+RETENTION_MS+4*3600000)).history.length,0);
// Legacy sources migrate once, with no requirement to rewrite old snapshots.
const legacyJob=createJob('Poste ancien');await handleJobs(req('jobs','PUT',{job:legacyJob,expectedRevision:0}),env);const legacy=createAppointment(legacyJob.id,'EF',time(0));sqlite.prepare('INSERT INTO recruitment_appointments VALUES (?,?,?,?,?)').run('legacy',legacy.id,JSON.stringify(legacy),1,now+RETENTION_MS);sqlite.prepare('INSERT INTO recruitment_jobs VALUES (?,?,?,?,?,?)').run('legacy',legacyJob.id,JSON.stringify(legacyJob),1,null,time(0));
assert.equal((await get('legacy')).records.length,1);assert.equal((await get('legacy')).records.length,1);
sqlite.close();console.log('PASS: real migrations and transactional history; three interviews count one application; M5 final protection; reasoned reopening; explicit same-initial merge; expiry without identifiers; idempotent migration, conflicts, ownership and source linkage.');
