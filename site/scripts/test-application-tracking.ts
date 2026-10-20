import assert from 'node:assert/strict';
import {trackedApplications,applicationCounts} from '../lib/application-tracking';
import {createAppointment} from '../lib/appointments';
import {createJob} from '../lib/jobs';
import {createAssessment,RETENTION_MS} from '../lib/assessment';
import {buildScorecard,emptyBrief} from '../lib/recruitment-engine';
const now=Date.now(),time=(delta:number)=>new Date(now+delta).toISOString();
const j=createJob('Responsable support'),j2=createJob('ERP');
const appointment={...createAppointment(j.id,'JD',time(0)),createdAt:time(-1000),updatedAt:time(-1000)};
const session={...createAssessment(buildScorecard({...emptyBrief,roleTitle:j.title},'Manager',60,['Diagnostic']),j.title,'JD','YL'),jobId:j.id,appointmentId:appointment.id,reference:appointment.reference,createdAt:time(-500),updatedAt:time(-500),interviewAt:time(0)};
const rows=()=>trackedApplications([appointment],[session],now);
assert.equal(rows().length,1);assert.equal(rows()[0].status,'En évaluation');assert.deepEqual(applicationCounts(rows(),j.id),{inProgress:1,closed:0});assert.deepEqual(applicationCounts(rows(),j2.id),{inProgress:0,closed:0});
appointment.outcome='No Go';appointment.outcomeAt=time(-400);assert.equal(rows()[0].closed,true);assert.deepEqual(applicationCounts(rows(),j.id),{inProgress:0,closed:1});
session.decision={value:'Poursuivre',date:time(-300),author:'Y.L.',justification:'Décision du recruteur'};assert.equal(rows()[0].status,'Poursuivre');assert.equal(rows()[0].closed,false);
appointment.outcome='No Go';appointment.outcomeAt=time(-200);assert.equal(rows()[0].closed,true);assert.equal(rows()[0].source,'Suivi');
session.decision={...session.decision,value:'À approfondir',date:time(-200)};assert.equal(rows()[0].status,'À approfondir');assert.equal(rows()[0].source,'M5');
session.decision={...session.decision,value:'Ne pas poursuivre',date:time(-100)};assert.deepEqual(applicationCounts(rows(),j.id),{inProgress:0,closed:1});
appointment.outcome='Go';appointment.outcomeAt=time(0);assert.deepEqual(applicationCounts(rows(),j.id),{inProgress:1,closed:0});
const direct={...session,id:crypto.randomUUID(),appointmentId:undefined,followUpOutcome:{value:'No Go' as const,at:time(1)}};
const two=trackedApplications([appointment],[session,direct],now);assert.equal(two.length,2);assert.equal(two[0].reference,two[1].reference);assert.deepEqual(applicationCounts(two,j.id),{inProgress:1,closed:1}); // identical initials/reference do not merge distinct sessions
assert.equal(trackedApplications([appointment],[session,{...session,id:crypto.randomUUID()}],now).length,1); // even duplicate linked reports count once
assert.equal(trackedApplications([],[{...session,jobId:undefined}],now).length,0);
assert.equal(trackedApplications([appointment],[session],now+RETENTION_MS).length,0);
const reconstructed=trackedApplications(JSON.parse(JSON.stringify([appointment])),JSON.parse(JSON.stringify([session,direct])),now);assert.deepEqual(reconstructed,two); // reload from persisted records
const future={...appointment,id:crypto.randomUUID(),interviewAt:time(10*86400000),outcome:'À décider' as const,outcomeAt:null};assert.equal(trackedApplications([future],[],now)[0].status,'Entretien planifié');
assert.equal(JSON.stringify(two).includes('justification'),false);assert.equal(JSON.stringify(two).includes('entries'),false); // projection contains neither evaluation evidence nor CV
console.log('PASS: automatic application counters, linked report deduplication, initials collision safety, latest human action/M5 tie priority, No Go closure, Go reopening, exact retention, unassigned exclusion, future planning and persisted reload. No AI calls.');

// Exercise the actual authenticated persistence path, not just in-memory fixtures.
const {DatabaseSync}=await import('node:sqlite');const fs=await import('node:fs');
const {handleJobs}=await import('../lib/job-store');const {handleAppointments}=await import('../lib/appointment-store');const {handleInterviews}=await import('../lib/interview-store');
const sqlite=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const db={prepare(sql:string){const stmt=sqlite.prepare(sql);let params:any[]=[];const api={bind(...args:any[]){params=args;return api;},async run(){return{meta:{changes:Number(stmt.run(...params).changes)}};},async all(){return{results:stmt.all(...params)};},async first(){return stmt.get(...params)??null;}};return api;}} as unknown as D1Database;
const env={DB:db},req=(path:string,body?:unknown,user='owner')=>new Request('https://test.invalid/api/'+path,{method:body?'PUT':'GET',headers:{'content-type':'application/json','oai-authenticated-user-id':user},body:body?JSON.stringify(body):undefined});
assert.equal((await handleJobs(req('jobs',{job:j,expectedRevision:0}),env)).status,200);
const savedAppointment=await handleAppointments(req('appointments',{appointment,expectedRevision:0}),env,now);assert.equal(savedAppointment.status,200);
const input={...session,decision:{...session.decision!,value:'Ne pas poursuivre' as const,date:time(10)},followUpOutcome:undefined};
let response=await handleInterviews(req('interviews',{session:input,expectedRevision:0}),env,now);assert.equal(response.status,200);let record:any=await response.json();
const readRows=async(user='owner')=>{const a:any=await(await handleAppointments(req('appointments',undefined,user),env,now)).json();const s:any=await(await handleInterviews(req('interviews',undefined,user),env,now)).json();return trackedApplications(a.records.map((r:any)=>r.appointment),s.records.map((r:any)=>r.session),now);};
assert.deepEqual(applicationCounts(await readRows(),j.id),{inProgress:0,closed:1});assert.equal((await readRows('other')).length,0);
record.session.followUpOutcome={value:'Go',at:'2099-01-01T00:00:00.000Z'};
response=await handleInterviews(req('interviews',{session:record.session,expectedRevision:record.revision}),env,now+20);assert.equal(response.status,200);record=await response.json();assert.equal(record.session.followUpOutcome.at,time(20));
assert.deepEqual(applicationCounts(await readRows(),j.id),{inProgress:1,closed:0});
response=await handleInterviews(req('interviews',{session:record.session,expectedRevision:record.revision}),env,now+30);record=await response.json();assert.equal(record.session.followUpOutcome.at,time(20));
const denied=await handleInterviews(req('interviews',{session:record.session,expectedRevision:record.revision},'other'),env,now+40);assert.equal(denied.status,404);
sqlite.close();console.log('PASS: authenticated SQLite API writes/reload feed automatic counters, M5 closure, Go reopening, account isolation and server follow-up timestamps without renewal on unchanged saves.');
