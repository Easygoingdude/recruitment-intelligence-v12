import assert from 'node:assert/strict';
import { emptyBrief, buildSourcingStrategy } from '../lib/recruitment-engine';
import { requiresManagementAnchor,isResponsibilityTerm,validateSourcingPlan } from '../lib/sourcing-ai';
import type { AISourcingPlan } from '../lib/ai-contract';
const brief={...emptyBrief,roleTitle:'Responsable Support Utilisateurs',missions:'Encadrer cinq techniciens du helpdesk et piloter les incidents, les escalades et les engagements de service.',tools:'Windows, Microsoft 365, ManageEngine'};
assert.equal(requiresManagementAnchor(brief),true);
assert.equal(requiresManagementAnchor({...emptyBrief,roleTitle:'Technicien support',missions:'Résoudre les incidents et escalader au responsable support.'}),false);
assert.equal(isResponsibilityTerm('technicien support'),false);assert.equal(isResponsibilityTerm('IT support'),false);
const evidence=[{field:'missions' as const,excerpt:'Encadrer cinq techniciens'}];
const makeAxis=(name:string,terms:string[])=>({name,exactTerms:terms,adjacentTerms:['technicien support'],transferableTerms:['assistance utilisateurs'],locked:false,reason:'Responsabilité à qualifier.',verify:'Vérifier les actions d’encadrement réellement exercées.',evidence});
const plan:AISourcingPlan={summary:'Encadrement du support.',axes:[makeAxis('Encadrement du support',['responsable support informatique','service desk manager','team lead support']),makeAxis('Support IT',['support informatique','helpdesk']),makeAxis('Pilotage du service',['ITSM','SLA'])],warnings:[]};
const previous=[{name:'Windows',exactTerms:['Windows'],locked:false},{name:'Microsoft 365',exactTerms:['Microsoft 365'],locked:false},{name:'ITSM',exactTerms:['ITSM'],locked:false}];
const checked=validateSourcingPlan(plan,brief,[],previous);
assert.equal(checked.axes[0].locked,true);assert.deepEqual(checked.axes[0].adjacentTerms,[]);assert.deepEqual(checked.axes[0].transferableTerms,[]);
const strategy=buildSourcingStrategy(checked.axes.map(a=>a.name),checked.axes.map(a=>a.name),Object.fromEntries(checked.axes.map(a=>[a.name,a.exactTerms])),Object.fromEntries(checked.axes.map(a=>[a.name,{locked:a.locked,adjacent:a.adjacentTerms,transferable:a.transferableTerms}])));
assert.equal(strategy.funnel.sets.length,9);
for(const set of strategy.funnel.sets){
 assert.deepEqual(set.groups[0],plan.axes[0].exactTerms);
 for(const query of Object.values(set.queries)){assert.ok(query.includes('responsable support informatique'));}
}
assert.throws(()=>validateSourcingPlan({...plan,axes:[makeAxis('Support',['technicien support'])]},brief,[],[]),/encadrement/);
assert.throws(()=>validateSourcingPlan(plan,brief,[],[{...previous[0],locked:true}]),/axes choisis/);
console.log('PASS: manager vs technician context, mandatory responsibility axis across nine sets/all platforms, technical axes replaceable only when unlocked, no NOT technician exclusion.');
