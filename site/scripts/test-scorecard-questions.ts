import assert from 'node:assert/strict';
import { runRecruitmentAI } from '../lib/recruitment-ai';
import { scorecardPrimaryQuestions, reviewScorecardQuestions } from '../lib/scorecard-questions';
import { emptyBrief, type ScorecardData } from '../lib/recruitment-engine';
import { AI_PROMPT_VERSION, AI_RESULT_CACHE_VERSION } from '../lib/ai-cache';

// A simulated provider response: no network and no API key required.
const precise = {
  dimension:'Compétences métier',transferQuestion:'Quels contrôles de votre exemple seraient réutilisables pour les incidents du poste ?',transferableEvidence:'Diagnostic argumenté sur un autre environnement de support.',learningCheck:'Vérifier les contrôles propres à Microsoft 365.',
  criterion:'Diagnostic des incidents',type:'Hard skill',definition:'Diagnostiquer un incident Microsoft 365 et vérifier sa résolution.',coefficient:3,
  mainQuestion:'Pensez à un incident Microsoft 365 que vous n’avez pas résolu au premier diagnostic. Quels contrôles avez-vous réalisés avant de le résoudre ou de l’escalader ?',
  followUps:'Quel était le symptôme initial ?\nQuel contrôle a permis d’isoler la cause ?\nComment avez-vous confirmé la résolution avec l’utilisateur ?',
  expectedEvidence:'Contrôles expliqués, rôle personnel et confirmation de résolution.',anchor0:'Aucun contrôle décrit.',anchor1:'Contrôles assistés.',anchor2:'Diagnostic autonome et résolution vérifiée.',anchor3:'Cause supprimée et récurrence suivie.',sourceFields:['mustHave','missions'],
};
assert.deepEqual(reviewScorecardQuestions([precise]),[]);
const vague={...precise,mainQuestion:'Comment pilotez-vous la qualité ?',followUps:'Quel résultat ?'};
assert.equal(reviewScorecardQuestions([vague]).length,2);
const originalFetch=globalThis.fetch;
let calls=0;
let generated=precise;
globalThis.fetch=async (_url, options) => {
  calls++;
  const request=JSON.parse(String(options?.body));
  const prompt=JSON.stringify(request.input);
  assert.ok(prompt.includes('Questions d’entretien contextualisées'));
  assert.ok(prompt.includes('Microsoft 365'));
  assert.ok(prompt.includes('trois ou quatre questions'));
  assert.ok(prompt.includes('Ne pas inventer'));
  assert.ok(prompt.includes('exactement deux questions distinctes, une principale et une alternative de preuve'));
  assert.ok(prompt.includes('une seule note par critère'));
  return new Response(JSON.stringify({
    id:`resp_test_${calls}`,object:'response',created_at:1,status:'completed',model:'gpt-6.1-sol',
    output:[{id:'msg_test',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({criteria:[generated],warnings:[]}),annotations:[]}]}],
    usage:{input_tokens:100,output_tokens:100,total_tokens:200,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}},
  }),{status:200,headers:{'content-type':'application/json'}});
};
try {
  const brief={...emptyBrief,roleTitle:'Technicien support',missions:'Résoudre les incidents utilisateur Microsoft 365.',mustHave:'Diagnostic Microsoft 365'};
  const env={OPENAI_API_KEY:'fake-test-key-no-network'};
  const result=await runRecruitmentAI({task:'scorecard',brief},env);
  assert.equal(calls,1);
  assert.equal(result.promptVersion,AI_PROMPT_VERSION);
  assert.equal(result.cache?.keyVersion,AI_RESULT_CACHE_VERSION);
  assert.equal(result.model,'gpt-6.1-sol'); assert.equal(result.reasoningEffort,'medium');
  assert.equal((result.output as ScorecardData).criteria[0].mainQuestion,precise.mainQuestion);
  const item=(result.output as ScorecardData).criteria[0];
  assert.equal(item.note,null);
  assert.equal(item.transferQuestion,precise.transferQuestion);
  assert.equal(item.followUps,precise.followUps);
  assert.ok(scorecardPrimaryQuestions(item).includes('2. Compétence transférable'));
  assert.equal(scorecardPrimaryQuestions({mainQuestion:'Ancienne question'}),'Ancienne question');
  assert.ok(!result.warnings.some(w=>w.includes('Question à contextualiser')));
  generated=vague;
  const warned=await runRecruitmentAI({task:'scorecard',brief,resultCacheMode:'refresh'},env);
  assert.equal(calls,2); // One call per request, including poor questions. No correction loop.
  assert.ok(warned.warnings.some(w=>w.includes('Question à contextualiser')));
  assert.ok(warned.warnings.some(w=>w.includes('Relances à compléter')));
} finally {globalThis.fetch=originalFetch;}
console.log('PASS: contextualised prompt through provider adapter, source brief, targeted follow-ups, review warnings, one model call, Luna/Sol routing and empty human notes preserved.');
