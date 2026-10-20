import {buildAgentInput, agentFingerprint} from '../lib/assessment-agent-contract';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createAssessment, parseInitialsInput, initialsSchema, updateAssessment, recordDecision, assessmentTotals, comparableSessions, assessmentReport, assessmentSchema, backupSchema, ASSESSMENT_VERSION, assessedScorecard } from '../lib/assessment';
import { buildScorecard,emptyBrief } from '../lib/recruitment-engine';
import { runAssessmentAgent, handleAssessmentAI, retrieveAssessmentContext } from '../lib/assessment-ai';
import { handleMcpRequest } from '../lib/mcp-server';
import { buildScorecardExcel } from '../lib/scorecard-excel';
import { buildOfferPdf } from '../lib/offer-pdf';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

const card=buildScorecard({...emptyBrief,roleTitle:'Poste de recette'},'Manager',60,['Diagnostic','Coopération','Apprentissage']);
card.criteria[0].coefficient=3;card.criteria[1].coefficient=1;card.criteria[2].coefficient=2;
card.criteria[1].eliminatory=true;card.criteria[1].minimum=2;
card.criteria.forEach(c=>{c.transferQuestion='Décrivez une résolution dans un autre contexte et son adaptation au poste.';});
const pristine=JSON.stringify(card);
let session=createAssessment(card,'Poste de recette','A.B.','Y.L.');
assert.equal(JSON.stringify(card),pristine);
assert.notEqual(createAssessment(card,'Poste de recette','A.B.','Y.L.').reference,session.reference);
assert.throws(()=>createAssessment(card,'Poste','Nom complet','Y.L.'));
for(const input of ['jd','JD','J D','j.d',' J.D. ','J. D.'])assert.equal(parseInitialsInput(input,'candidat'),'J.D.');
assert.equal(parseInitialsInput('e\u0301 d','évaluateur'),'É.D.');
assert.equal(parseInitialsInput('jd-abc123','candidat'),'J.D.-ABC123');
for(const input of ['J','JDD','Jean Dupont','12','J-D',''])assert.throws(()=>parseInitialsInput(input,'candidat'),error=>error instanceof Error&&!error.message.includes('invalid_string')&&error.message.includes('candidat'));
assert.throws(()=>createAssessment(card,'Poste','JD',''),/évaluateur/);
assert.equal(initialsSchema.safeParse('JD').success,false);
const flexible=createAssessment(card,'Poste','jd','yl');assert.match(flexible.reference,/^J\.D\.-/);assert.equal(flexible.evaluator,'Y.L.');
assert.throws(()=>updateAssessment(session,card.criteria[0].id,{note:0}));
const first=card.criteria[0].id;
session=updateAssessment(session,first,{evidence:'Le diagnostic a isolé une cause et la résolution a été vérifiée.',note:2});
assert.equal(assessmentTotals(session).score,100*2/3);assert.equal(assessmentTotals(session).coverage,50);
session=updateAssessment(session,card.criteria[1].id,{evidence:'Aucun exemple de coopération démontré après les relances.',note:0});
assert.equal(assessmentTotals(session).score,50);assert.equal(assessmentTotals(session).belowMinimum.length,1);
assert.equal(assessmentTotals(session).indication,'À compléter');
assert.throws(()=>recordDecision(session,'Poursuivre',''));
session=recordDecision(session,'À approfondir','Critère non évalué et minimum non atteint à vérifier.');
assert.equal(session.decision?.author,'Y.L.');assert.equal(session.completedAt,null);
const version=JSON.stringify(session.scorecard);card.criteria[0].definition='Changement ultérieur';
assert.equal(JSON.stringify(session.scorecard),version);
assert.equal(comparableSessions(session,[session,createAssessment(card,'Autre poste','C.D.','Y.L.')]).length,1);
const reloaded=backupSchema.parse(JSON.parse(JSON.stringify({version:ASSESSMENT_VERSION,sessions:[session]})));
assert.deepEqual(reloaded.sessions[0],session);
const invalid=structuredClone(session);invalid.entries[first].evidence='';assert.equal(assessmentSchema.safeParse(invalid).success,false);
assert.equal(assessmentSchema.safeParse({...session,entries:{...session.entries,unknown:{evidence:'',comment:'',note:null}}}).success,false);
session={...session,reportText:'Synthèse de recette.',reportValidatedAt:new Date().toISOString()};
const changed=updateAssessment(session,first,{comment:'Écart à revoir.'});assert.equal(changed.decision,null);assert.equal(changed.reportValidatedAt,null);
assert.ok(assessmentReport(session).some(s=>s.body.includes('Couverture')||s.body.includes('couverture')));
const excel=await buildScorecardExcel(new Uint8Array(await fs.readFile('public/templates/scorecard-reference-v1.xlsx')),assessedScorecard(session),{...emptyBrief,roleTitle:`Poste ${session.reference}`});
const zip=await JSZip.loadAsync(excel);const xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string');assert.ok(xml.includes(session.reference));assert.ok(xml.includes('résolution a été vérifiée'));
const sections=assessmentReport(session).map((s,i)=>({...s,id:String(i),source:'Humain'}));
const pdf=await buildOfferPdf(`Rapport ${session.reference}`,sections,new Uint8Array(await fs.readFile('public/fonts/DejaVuSans.ttf')),new Uint8Array(await fs.readFile('public/fonts/DejaVuSans-Bold.ttf')));
assert.ok((await PDFDocument.load(pdf)).getPageCount()>=1);

const env={OPENAI_API_KEY:'fake-test-key-no-network'};
const previousFetch=globalThis.fetch;let calls=0;let bad:'none'|'quote'|'criterion'|'score'|'timeout'='none';let captured='';let capturedModel='';
globalThis.fetch=async(_url,options)=>{
 calls++;const request=JSON.parse(String(options?.body));captured=JSON.stringify(request);capturedModel=request.model;
 assert.equal(request.store,false);assert.equal(request.prompt_cache_key,undefined);assert.ok(request.max_output_tokens<=2200);
 if(bad==='timeout'){const e=new Error('timeout');e.name='TimeoutError';throw e;}
 const result:any={summary:'Synthèse limitée aux preuves fournies.',questions:[{criterionId:bad==='criterion'?'absent':first,question:'Quel contrôle a confirmé la résolution ?'}],findings:[{criterionId:first,quote:bad==='quote'?'Preuve inventée':'la résolution a été vérifiée',analysis:'La vérification de résolution est décrite.'}],limitations:['Le troisième critère reste non évalué.']};
 if(bad==='score')result.note=3;
 return new Response(JSON.stringify({id:`resp_assessment_${calls}`,object:'response',created_at:1,status:'completed',model:request.model,output:[{id:'msg_assessment',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(result),annotations:[]}]}],usage:{input_tokens:300,output_tokens:100,total_tokens:400}}),{headers:{'content-type':'application/json'}});
};
try{
 for(const task of ['interview','evaluate','report'] as const){
  const input=buildAgentInput(session,task,first);
  const before=calls;const result=await runAssessmentAgent(input,env);
  assert.equal(calls,before+1);assert.equal(result.harness.modelCalls,1);assert.equal(result.harness.maxRetries,0);
  assert.equal(result.harness.resultCache,'disabled');assert.equal(result.harness.promptCache,'disabled-private');
  assert.equal(result.reasoningEffort,task==='evaluate'?'medium':'low');assert.equal(capturedModel,task==='evaluate'?'gpt-6.1-sol':'gpt-6-luna');
  assert.equal(result.inputFingerprint,agentFingerprint(input));assert.ok(result.sources.length<=2);assert.equal(retrieveAssessmentContext(input).criteria.length,task==='interview'?1:3);
  assert.ok(captured.includes('RAG'));assert.ok(!captured.includes('sourceBriefSnapshot'));
  assert.equal(JSON.stringify(session.scorecard),version); // The agent never writes scores.
 }
 const privateInput=buildAgentInput(session,'evaluate');privateInput.criteria[0].evidence+=' test@example.org 0612345678 https://linkedin.com/in/example';
 const clean=await runAssessmentAgent(privateInput,env);assert.ok(clean.harness.redactions>=3);assert.ok(!captured.includes('test@example.org'));assert.ok(!captured.includes('0612345678'));assert.ok(!captured.includes('linkedin.com/in'));
 for(const kind of ['quote','criterion','score'] as const){bad=kind;const before=calls;await assert.rejects(()=>runAssessmentAgent(buildAgentInput(session,'evaluate'),env));assert.equal(calls,before+1);}
 bad='none';let before=calls;
 await assert.rejects(()=>runAssessmentAgent({...buildAgentInput(session,'evaluate'),privacyReviewed:false},env));assert.equal(calls,before);
 const withName=buildAgentInput(session,'evaluate');withName.criteria[0].comment='Nom : Exemple';await assert.rejects(()=>runAssessmentAgent(withName,env));assert.equal(calls,before);
 const large=buildAgentInput(session,'evaluate');large.criteria=Array.from({length:8},(_,i)=>({...large.criteria[0],id:`large${i}`,evidence:'x'.repeat(3000),comment:'x'.repeat(1500)}));await assert.rejects(()=>runAssessmentAgent(large,env));assert.equal(calls,before);
 const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://test.invalid/api/assessment-ai',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const payload=buildAgentInput(session,'interview',first);
 assert.equal((await handleAssessmentAI(request(payload),env)).status,401);
 assert.equal((await handleAssessmentAI(request(payload,{'oai-authenticated-user-id':'x',origin:'https://outside.invalid'}),env)).status,403);
 for(let i=0;i<6;i++)assert.equal((await handleAssessmentAI(request(payload,{'oai-authenticated-user-id':'rate-test'}),env)).status,200);
 before=calls;assert.equal((await handleAssessmentAI(request(payload,{'oai-authenticated-user-id':'rate-test'}),env)).status,429);assert.equal(calls,before);
 const listing=await handleMcpRequest(new Request('https://test.invalid/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}),env);
 const listed:any=await listing.json();for(const name of ['m4_assist_interview','m5_review_evidence','m6_draft_report'])assert.ok(listed.result.tools.some((t:any)=>t.name===name));
 const mcp=await handleMcpRequest(new Request('https://test.invalid/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'mcp-test'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'m4_assist_interview',arguments:{contextJson:JSON.stringify(payload),privacyReviewed:true}}})}),env);
 const reply:any=await mcp.json();assert.equal(reply.result.structuredContent.harness.modelCalls,1);
}finally{globalThis.fetch=previousFetch;}
if(process.argv.includes('--fixture'))await fs.writeFile('/workspace/scratch/7a4c868771a2/assessment-test-backup.json',JSON.stringify({version:ASSESSMENT_VERSION,sessions:[session]},null,2));
console.log('PASS: M4→M5→M6, frozen grid, NE/0/weights/minimum/coverage, human decision invalidation, backup validation, comparable sessions, Excel and PDF; three agents, routing, RAG, budget limits, source validation, privacy, auth, rate and MCP. All AI responses simulated; zero credits.');
