import assert from 'node:assert/strict';
import { runRecruitmentAI } from '../lib/recruitment-ai';
import { emptyBrief, buildSourcingStrategy } from '../lib/recruitment-engine';
import type { AISourcingPlan } from '../lib/ai-contract';
const brief={...emptyBrief,roleTitle:'Ingénieur réseaux',missions:'Diagnostiquer les incidents réseau et documenter leur résolution.',tools:'Palo Alto ; Active Directory'};
const axes=[{name:'Palo Alto',exactTerms:['Palo Alto','PAN-OS'],locked:false}];
const plan:AISourcingPlan={summary:'Cibler la sécurité réseau puis les expériences voisines.',axes:[{name:'Palo Alto',exactTerms:['Palo Alto','PAN-OS'],adjacentTerms:['Fortinet'],transferableTerms:['filtrage réseau'],locked:false,reason:'Le diagnostic des pare-feu mobilise des savoir-faire voisins.',verify:'Vérifier la maîtrise de PAN-OS et les écarts techniques.',evidence:[{field:'tools',excerpt:'Palo Alto'}]}],warnings:[]};
const originalFetch=globalThis.fetch;let calls=0;let output=structuredClone(plan);let sent:any;
globalThis.fetch=async (_url,options)=>{calls++;sent=JSON.parse(String(options?.body));return new Response(JSON.stringify({id:'resp_test',object:'response',created_at:1,status:'completed',model:sent.model,output:[{id:'msg_test',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(output),annotations:[]}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}),{status:200,headers:{'content-type':'application/json'}});};
const env={OPENAI_API_KEY:'fake-offline-key'};const context={cacheNamespace:'sourcing-tests'};
const input={task:'sourcing',brief,criteria:['Palo Alto'],sourcingAxes:axes,sourcingFeedback:'Peu de profils pertinents.'};
try{
 const first=await runRecruitmentAI(input,env,context);assert.equal(calls,1);assert.equal(first.model,'gpt-6.1-sol');assert.equal(first.reasoningEffort,'medium');assert.ok(JSON.stringify(sent.input).includes('Peu de profils pertinents.'));
 const cached=await runRecruitmentAI(input,env,context);assert.equal(calls,1);assert.equal(cached.cache?.hit,true);assert.equal(cached.optimization?.harness.modelCalls,0);
 await runRecruitmentAI({...input,sourcingFeedback:'Trop de profils hors cible.'},env,context);assert.equal(calls,2);
 output.axes[0].exactTerms=['Fortinet'];const locked=await runRecruitmentAI({...input,sourcingAxes:[{...axes[0],locked:true}]},env,context);assert.equal(calls,3);const protectedAxis=(locked.output as AISourcingPlan).axes[0];assert.deepEqual(protectedAxis.exactTerms,axes[0].exactTerms);assert.deepEqual(protectedAxis.adjacentTerms,[]);assert.deepEqual(protectedAxis.transferableTerms,[]);
 output=structuredClone(plan);const luna=await runRecruitmentAI({...input,modelPreference:'luna',resultCacheMode:'refresh'},env,context);assert.equal(luna.model,'gpt-6.1-sol');assert.equal(luna.reasoningEffort,'medium');assert.equal(calls,4);
 const strategy=buildSourcingStrategy(['Palo Alto'],['Palo Alto'],{'Palo Alto':plan.axes[0].exactTerms},{'Palo Alto':{adjacent:plan.axes[0].adjacentTerms,transferable:plan.axes[0].transferableTerms,reason:plan.axes[0].reason,verify:plan.axes[0].verify}});assert.equal(strategy.funnel.sets.length,9);assert.equal(calls,4);
 output.axes[0].evidence=[{field:'tools',excerpt:'Inventé'}];await assert.rejects(()=>runRecruitmentAI({...input,resultCacheMode:'refresh'},env,context),/source vérifiable/);assert.equal(calls,5);
 output=structuredClone(plan);output.axes[0].name='Autre axe';await assert.rejects(()=>runRecruitmentAI({...input,resultCacheMode:'refresh'},env,context),/axes choisis/);assert.equal(calls,6);
 await assert.rejects(()=>runRecruitmentAI({...input,sourcingAxes:[{...axes[0],locked:true,exactTerms:[' ']}]},env,context),/verrouillé/);assert.equal(calls,6);
 output=structuredClone(plan);await runRecruitmentAI({...input,sourcingFeedback:'Contact test@example.com',resultCacheMode:'refresh'},env,context);assert.ok(!JSON.stringify(sent.input).includes('test@example.com'));assert.equal(calls,7);
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: real provider adapter mocked offline; one call, cache, feedback/lock invalidation, Sol medium enforced even with Luna preference, literal evidence, axis preservation, locked terms, nine deterministic renderings, input privacy.');
