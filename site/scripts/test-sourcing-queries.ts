import assert from 'node:assert/strict';
import { buildSourcingStrategy, type SourcingStrategy } from '../lib/recruitment-engine';
import { normaliseSearchTerms, suggestSearchTerms } from '../lib/sourcing-queries';
import { handleMcpRequest } from '../lib/mcp-server';

const names=['Développement .NET et maintenance','SQL et intégration','AngularJS','Communication utilisateur'];
const s=buildSourcingStrategy(names, names.slice(0,3),{
  [names[0]]:['C#','.NET'],[names[1]]:['SQL','T-SQL'],[names[2]]:['AngularJS'],
});
assert.equal(s.queries.large,'("C#" OR ".NET")');
assert.equal(s.queries.balanced,'("C#" OR ".NET") AND ("SQL" OR "T-SQL")');
assert.equal(s.queries.targeted,'("C#" OR ".NET") AND ("SQL" OR "T-SQL") AND "AngularJS"');
assert.deepEqual(s.queryAxes.large,[names[0]]);
assert.equal(s.platforms.linkedin.queries.targeted,s.queries.targeted);
assert.equal(s.platforms['jobboard-simple'].queries.targeted,'C# SQL AngularJS');
assert.equal(s.selected.length,3); assert.ok(s.excluded.includes(names[3]));
assert.ok(!s.queries.targeted.includes('maintenance')); assert.ok(!s.queries.targeted.includes('Communication'));
const abstract=buildSourcingStrategy(['Communication utilisateur','Autonomie et coopération']);
assert.equal(abstract.queries.large,''); assert.equal(abstract.warnings.length,2);
assert.equal(buildSourcingStrategy(names,[]).queries.large,''); // Explicit deselection remains empty.
assert.equal(buildSourcingStrategy(names,['Critère inconnu']).selected.length,0);
assert.equal(buildSourcingStrategy(['SQL'],undefined,{SQL:[]}).queries.large,'');
const duplicate=buildSourcingStrategy(['Active Directory','GPO']);
assert.equal(duplicate.queryAxes.targeted.length,1); assert.ok(duplicate.warnings.some(w=>w.includes('mêmes termes')));
assert.deepEqual(normaliseSearchTerms(['SQL','sql',' SQL ','C++','R&D (ERP)','']),['SQL','C++','R&D (ERP)']);
assert.ok(suggestSearchTerms('Responsable Support Utilisateurs').includes('support manager'));
assert.ok(suggestSearchTerms('Diagnostic Palo Alto Panorama').includes('Palo Alto'));
const special=buildSourcingStrategy(['Langage'],['Langage'],{Langage:['C++','C#','.NET','"SQL" OR admin','wild*card']});
assert.ok(special.queries.large.includes('"C++"')); assert.ok(special.queries.large.includes('"SQL OR admin"'));
assert.ok(!special.queries.large.includes('*'));
const response=await handleMcpRequest(new Request('https://test.invalid/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'test-user'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'m3_build_sourcing_strategy',arguments:{criteria:names,selectedCriteria:names.slice(0,3)}}})}),{});
const rpc=await response.json() as {error?:unknown;result:{isError?:boolean;structuredContent:SourcingStrategy}};
assert.ok(!rpc.error); assert.ok(!rpc.result.isError);
assert.ok(rpc.result.structuredContent.platforms.linkedin.queries.targeted.includes('AND'));
console.log('PASS: platform outputs, 1/2/3 axes, replacement terms, abstract criteria, explicit deselection, special characters, deduplication, no hidden exclusions, authenticated MCP output. No AI or external search calls.');
