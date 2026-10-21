import assert from 'node:assert/strict';
import {moveCriterion} from '../lib/scorecard-order';
import {buildScorecard,emptyBrief} from '../lib/recruitment-engine';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import {buildScorecardExcel} from '../lib/scorecard-excel';
import {chooseModel} from '../lib/recruitment-ai';
const original=buildScorecard({...emptyBrief,roleTitle:'Test fictif',mustHave:'Diagnostic réseau\nAdministration système\nGestion des incidents'},'Opérationnel',60);
const criteria=original.criteria.map((item,i)=>({...item,note:i%4 as 0|1|2|3,comment:`Preuve ${i}`}));
assert.ok(criteria.length>=3);
const snapshot=structuredClone(criteria);
const reordered=moveCriterion(criteria,criteria[0].id,criteria[2].id);
assert.deepEqual(reordered.slice(0,3).map(item=>item.id),[criteria[1].id,criteria[2].id,criteria[0].id]);
assert.deepEqual(criteria,snapshot);
assert.equal(reordered.length,criteria.length);
for(const item of reordered)assert.strictEqual(item,criteria.find(old=>old.id===item.id));
assert.deepEqual(moveCriterion(reordered,criteria[0].id,criteria[1].id),criteria);
assert.strictEqual(moveCriterion(criteria,'missing',criteria[0].id),criteria);
assert.strictEqual(moveCriterion(criteria,criteria[0].id,criteria[0].id),criteria);
const restored=JSON.parse(JSON.stringify({...original,criteria:reordered}));
assert.deepEqual(restored.criteria,reordered);
for(const preference of ['auto','luna','sol'] as const)assert.deepEqual(chooseModel('sourcing',preference,{OPENAI_SOL_MODEL:'other',OPENAI_LUNA_MODEL:'other'}),{model:'gpt-6.1-sol',reasoningEffort:'medium'});
assert.equal(chooseModel('import','auto',{}).model,'gpt-6-luna');
console.log('PASS: upward/downward reorder, stable identity, all assessment data preserved, no mutation/loss, persistence round trip, sourcing fixed to Sol 6.1 medium in every mode.');

const template=new Uint8Array(await fs.readFile('public/templates/scorecard-reference-v1.xlsx'));
const zip=await JSZip.loadAsync(await buildScorecardExcel(template,{...original,criteria:reordered},emptyBrief));
for(const sheet of ['sheet1','sheet2']){
 const xml=await zip.file(`xl/worksheets/${sheet}.xml`)!.async('string');
 const labels=[...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(match=>match[1]);
 const ordered=labels.filter(value=>reordered.some(item=>item.criterion===value));
 assert.deepEqual(ordered,reordered.map(item=>item.criterion));
}
console.log('PASS: reordered criteria exported in the same order in both Excel sheets.');
