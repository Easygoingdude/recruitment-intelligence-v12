import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import {handleMcpRequest} from '../lib/mcp-server';
import {runRecruitmentAI} from '../lib/recruitment-ai';
import {emptyBrief,type ScorecardData} from '../lib/recruitment-engine';
import {buildScorecardExcel} from '../lib/scorecard-excel';
import {reviewScorecardProfile} from '../lib/scorecard-profiles';
const originalFetch=globalThis.fetch;
let calls=0;let prompt='';let technicalOnly=false;
const criterion=(dimension:string,coefficient:number,name:string)=>({dimension,coefficient,transferQuestion:"Quelles étapes de cet exemple seraient réutilisables pour diagnostiquer les incidents du poste ?",criterion:name,type:dimension==='Compétences métier'?'Hard skill':'Soft skill',definition:'Démarche observable liée au diagnostic et à la coopération.',mainQuestion:'Choisissez un projet d’études ou un stage où vous avez recherché la cause d’un problème. Quels contrôles avez-vous effectués ?',followUps:'Quel était le symptôme ?\nQuel était votre rôle personnel ?\nComment avez-vous vérifié le résultat ?',expectedEvidence:'Démarche expliquée et résultat vérifié.',transferableEvidence:'Même démarche de diagnostic sur un autre environnement, à complexité comparable.',learningCheck:'Vérifier les commandes propres à l’environnement cible dans un exercice annoncé.',anchor0:'Démarche non démontrée après vérification adaptée. Sans occasion, laisser NE.',anchor1:'Contrôles partiels.',anchor2:'Contrôles pertinents et résultat vérifié, même sur un autre outil.',anchor3:'Démarche argumentée, limites identifiées et amélioration démontrée.',sourceFields:['missions']});
globalThis.fetch=async(_url,options)=>{calls++;prompt=JSON.stringify(JSON.parse(String(options?.body)).input);const criteria=technicalOnly?[criterion('Compétences métier',3,'Diagnostic')]:[criterion('Compétences métier',2,'Diagnostic'),criterion('Comportements et apprentissage',3,'Apprentissage après retour'),criterion('Motivation professionnelle',2,'Compréhension des missions')];return new Response(JSON.stringify({id:'resp_profile',object:'response',created_at:1,status:'completed',model:'gpt-6.1-sol',output:[{id:'msg_profile',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({criteria,warnings:[]}),annotations:[]}]}],usage:{input_tokens:200,output_tokens:200,total_tokens:400,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}),{status:200,headers:{'content-type':'application/json'}});};
const brief={...emptyBrief,roleTitle:'Technicien support - exemple fictif',missions:'Diagnostiquer les incidents utilisateur et coopérer avec l’équipe.',mustHave:'Méthode de diagnostic',softSkills:'Apprendre après retour et coopérer'};
const env={OPENAI_API_KEY:'fake-offline-test-key'};const context={cacheNamespace:'profiles-test'};
try{
 const input={task:'scorecard',brief,level:'Jeune diplômé'};
 const young=await runRecruitmentAI(input,env,context);assert.equal(calls,1);const card=young.output as ScorecardData;
 assert.equal(card.profile,'Jeune diplômé');assert.equal(card.metadata.layoutContractId,'SCORECARD_STANDARD_1_0');assert.deepEqual(reviewScorecardProfile(card.criteria,card.profile),[]);
 assert.ok(prompt.includes('projets d’études'));assert.ok(prompt.includes('plus de la moitié'));assert.ok(prompt.includes('NE, pas 0'));assert.ok(prompt.includes('pas diagnostic de personnalité'));
 assert.ok(card.criteria.every(c=>c.note===null && c.comment==='' && !c.eliminatory));
 assert.ok(card.criteria.every(c=>c.expectedEvidence.includes('Preuve transférable recevable') && c.expectedEvidence.includes('Écart à vérifier')));
 assert.ok(card.criteria[0].anchor2.includes('autre outil'));assert.ok(card.criteria.every(c=>c.transferQuestion?.includes('réutilisables pour diagnostiquer')));assert.ok(prompt.includes('pour TOUS les types de scorecard'));assert.equal(card.level,'Jeune diplômé');
 await runRecruitmentAI(input,env,context);assert.equal(calls,1);
 const transfer=await runRecruitmentAI({...input,level:'Manager'},env,context);assert.equal(calls,2);assert.equal((transfer.output as ScorecardData).profile,'Standard');assert.equal((transfer.output as ScorecardData).level,'Manager');assert.ok(prompt.includes('Aucun bonus ni malus automatique'));
 const bad={...card,criteria:card.criteria.map(c=>({...c,coefficient:(c.dimension==='Compétences métier'?3:1) as 1|3}))};assert.ok(reviewScorecardProfile(bad.criteria,'Jeune diplômé').length);
 technicalOnly=true;await assert.rejects(()=>runRecruitmentAI({...input,resultCacheMode:'refresh'},env,context),/Profil Jeune diplômé/);assert.equal(calls,3);
 technicalOnly=false;
 for(const level of ['Opérationnel','Direction']){const result=await runRecruitmentAI({...input,level},env,context);const output=result.output as ScorecardData;assert.equal(output.level,level);assert.equal(output.profile,'Standard');assert.ok(output.criteria.every(c=>c.transferQuestion?.includes('réutilisables pour diagnostiquer')));}
 const listing=await handleMcpRequest(new Request('https://example.invalid/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}),env);
 const listed=await listing.json() as {result:{tools:Array<{name:string;inputSchema:{properties:Record<string,any>}}>}};
 const schema=listed.result.tools.find(tool=>tool.name==='m2_build_scorecard')!.inputSchema;
 assert.deepEqual(schema.properties.level.enum,['Opérationnel','Manager','Direction','Jeune diplômé']);assert.ok(!('scorecardProfile' in schema.properties));
 const template=new Uint8Array(await fs.readFile('public/templates/scorecard-reference-v1.xlsx'));const zip=await JSZip.loadAsync(await buildScorecardExcel(template,card,brief));
 const sheet=await zip.file('xl/worksheets/sheet1.xml')!.async('string');const guide=await zip.file('xl/worksheets/sheet2.xml')!.async('string');
 assert.ok(sheet.includes('Jeune diplômé'));assert.ok(guide.includes('Preuve transférable recevable'));assert.ok(guide.includes('Écart à vérifier'));assert.ok(guide.includes('Motivation professionnelle'));assert.ok(guide.includes('Une preuve transférable peut atteindre 2 ou 3'));
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: young-graduate weighting, three dimensions, accessible evidence, transfer at expected level, NE/null preserved, no automatic elimination, profile-aware cache, rejected invalid balance, profile/evidence in both-sheet Excel contract. Offline simulated provider only.');
