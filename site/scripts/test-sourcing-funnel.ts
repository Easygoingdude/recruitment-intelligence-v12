import assert from 'node:assert/strict';
import { buildSourcingStrategy, type SourcingStrategy } from '../lib/recruitment-engine';
import { buildSourcingFunnel } from '../lib/sourcing-funnel';
import { handleMcpRequest } from '../lib/mcp-server';

const selected=Array.from({length:3},(_,i)=>({name:`Axe ${i+1}`,synonyms:[`exact${i}a`,`exact${i}b`,`exact${i}c`]}));
const overrides=Object.fromEntries(selected.map((a,i)=>[a.name,{adjacent:[`voisin${i}a`,`voisin${i}b`],transferable:[`transfert${i}a`,`transfert${i}b`]}]));
const funnel=buildSourcingFunnel(selected,overrides);
assert.deepEqual(funnel.sets.map(s=>s.id),['P1','P2','P3','V1','V2','V3','T1','T2','T3']);
assert.equal(new Set(funnel.sets.map(s=>s.queries.linkedin)).size,9);
assert.equal(new Set(funnel.sets.map(s=>s.queries['google-xray'])).size,9);
for(let i=1;i<9;i++) for(let axis=0;axis<3;axis++) {
  for(const term of funnel.sets[i-1].groups[axis]) assert.ok(funnel.sets[i].groups[axis].includes(term),'Each successive set must preserve previous alternatives and all axes');
}
for(let i=1;i<9;i++) for(const match of funnel.sets[i-1].queries['google-xray'].matchAll(/"([^"]+)"/g)) assert.ok(funnel.sets[i].queries['google-xray'].includes(`"${match[1]}"`));
for(const set of funnel.sets) {
  assert.equal(set.groups.length,3);
  assert.ok(set.queries.hellowork.includes(' ET ')); assert.ok(set.queries.apec.includes(' ET '));
  assert.ok(set.queries.monster.includes(' AND '));
  assert.ok(set.queries['google-xray'].startsWith('site:linkedin.com/in/ '));
  assert.ok(!set.queries['google-web'].includes('site:')); assert.ok(!set.queries['google-xray'].includes(' AND '));
  assert.ok(!set.queries.linkedin.includes('NOT'));
}
const locked=buildSourcingFunnel(selected,{...overrides,'Axe 1':{...overrides['Axe 1'],locked:true}});
assert.ok(locked.sets.every(set=>JSON.stringify(set.groups[0])===JSON.stringify(selected[0].synonyms)));
const vendor=buildSourcingStrategy(['Palo Alto','SQL','Polarion']);
assert.ok(vendor.funnel.sets[0].queries.linkedin.includes('Palo Alto'));
assert.ok(!vendor.funnel.sets[0].queries.linkedin.includes('Fortinet'));
assert.ok(vendor.funnel.sets[3].queries.linkedin.includes('Fortinet'));
assert.ok(vendor.funnel.sets[8].queries.linkedin.includes('requirements management'));
assert.ok(vendor.funnel.sets[8].queries['google-xray'].includes('Fortinet'));
assert.ok(!vendor.funnel.sets[8].queries['google-xray'].includes('Stormshield'));
assert.ok(vendor.funnel.sets[8].queries['google-xray'].includes('SQL'));
assert.ok(vendor.funnel.axes.every(a=>a.verify.length>40));
const unknown=buildSourcingFunnel([{name:'Métier inconnu',synonyms:['terme inconnu']}]);
assert.equal(unknown.axes[0].adjacent.length,0); assert.ok(unknown.warnings.length);
assert.equal(unknown.sets[8].duplicateOf.linkedin,'P1');
assert.ok(buildSourcingFunnel([]).sets.every(s=>!s.queries.linkedin && !s.queries['google-xray']));
const maxTerms=buildSourcingFunnel([{name:'custom',synonyms:Array.from({length:8},(_,i)=>`e${i}`)}],{custom:{adjacent:Array.from({length:8},(_,i)=>`v${i}`),transferable:Array.from({length:8},(_,i)=>`t${i}`)}});
assert.equal(maxTerms.sets[8].groups[0].length,24);
const response=await handleMcpRequest(new Request('https://test.invalid/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'test-user'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'m3_build_sourcing_strategy',arguments:{criteria:['Palo Alto','SQL','Polarion'],funnelOptions:{'Palo Alto':{locked:true},SQL:{adjacent:['PostgreSQL'],transferable:[]}}}}})}),{});
const rpc=await response.json() as {result:{isError?:boolean;structuredContent:SourcingStrategy}};
assert.ok(!rpc.result.isError); assert.equal(rpc.result.structuredContent.funnel.sets.length,9);
assert.ok(rpc.result.structuredContent.funnel.axes[0].locked);
assert.deepEqual(rpc.result.structuredContent.funnel.axes[1].transferable,[]);
assert.deepEqual(Object.keys(rpc.result.structuredContent.funnel.sets[0].queries),['linkedin']);
console.log('PASS: 3×3 cumulative widening, nine distinct sets on three complete axes, platform syntax, X-ray, non-negotiable locks, justified bridges, unknown domains, duplicates, empty inputs, 24-term retention and authenticated MCP overrides. Zero model calls.');
