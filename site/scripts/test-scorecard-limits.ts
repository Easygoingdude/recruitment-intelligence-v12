import assert from 'node:assert/strict';
import { runRecruitmentAI } from '../lib/recruitment-ai';
import { buildScorecard, emptyBrief, SCORECARD_LEVELS, scorecardCriterionLimit, type ScorecardData } from '../lib/recruitment-engine';
import { handleMcpRequest } from '../lib/mcp-server';

// Exercise the production provider adapter with simulated responses only.
// Both a full valid grid and an over-limit grid are checked for every level.
const brief = { ...emptyBrief, roleTitle: 'Poste de recette', missions: 'Diagnostiquer les incidents, coopérer et apprendre de la résolution.' };
const env = { OPENAI_API_KEY: 'fake-test-key-no-network' };
const originalFetch = globalThis.fetch;
let count = 6;
let calls = 0;
let prompt = '';
let providerMaximum = 0;
const dimensions = ['Compétences métier', 'Comportements et apprentissage', 'Motivation professionnelle'];
function criterion(i: number) {
  return {
    criterion: `Compétence ${i + 1}`, type: 'Hybride', dimension: dimensions[i % 3], coefficient: 1,
    definition: 'Résoudre une situation de travail avec une preuve observable.',
    mainQuestion: 'Décrivez un incident que vous avez diagnostiqué. Quelles actions avez-vous réalisées ?',
    transferQuestion: 'Décrivez une difficulté résolue dans un autre contexte. Comment adapteriez-vous ces contrôles aux incidents du poste ?',
    followUps: 'Quel problème précis ?\nQu’avez-vous fait personnellement ?\nQuel résultat avez-vous vérifié ?',
    expectedEvidence: 'Actions expliquées et résultat vérifié.', transferableEvidence: 'Résolution dans un autre environnement.',
    learningCheck: 'Vérifier les particularités du contexte cible.',
    anchor0: 'Non démontré.', anchor1: 'Démontré avec assistance.', anchor2: 'Démontré au niveau attendu.', anchor3: 'Amélioration démontrée.',
    sourceFields: ['missions'],
  };
}
globalThis.fetch = async (_url, options) => {
  calls++;
  const request = JSON.parse(String(options?.body));
  prompt = JSON.stringify(request.input);
  providerMaximum = request.text.format.schema.properties.criteria.maxItems;
  return new Response(JSON.stringify({
    id: `resp_limit_${calls}`, object: 'response', created_at: 1, status: 'completed', model: 'gpt-6.1-sol',
    output: [{ id: 'msg_limit', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ criteria: Array.from({ length: count }, (_, i) => criterion(i)), warnings: [] }), annotations: [] }] }],
    usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
try {
  for (const level of SCORECARD_LEVELS) {
    const limit = level === 'Direction' ? 8 : 6;
    assert.equal(scorecardCriterionLimit(level), limit);
    const requested = Array.from({ length: 12 }, (_, i) => `Critère ${i + 1}`);
    assert.equal(buildScorecard(brief, level, 60, requested).criteria.length, limit);
    count = limit;
    const input = { task: 'scorecard', brief, level };
    const result = await runRecruitmentAI(input, env, { cacheNamespace: `limits-${level}` });
    const card = result.output as ScorecardData;
    assert.equal(card.criteria.length, limit);
    assert.ok(card.criteria.every(c => c.mainQuestion && c.transferQuestion && c.note === null));
    assert.ok(prompt.includes(`au maximum ${limit} critères`));
    assert.ok(prompt.includes(`au plus ${limit} questions principales, hors alternatives et relances`));
    assert.equal(providerMaximum, limit);
    const beforeCache = calls;
    await runRecruitmentAI(input, env, { cacheNamespace: `limits-${level}` });
    assert.equal(calls, beforeCache);
    count = limit + 1;
    await assert.rejects(() => runRecruitmentAI({ ...input, resultCacheMode: 'refresh' }, env));
    assert.equal(calls, beforeCache + 1); // No retries, truncation or repair call.
  }
  // A short brief may return fewer criteria: the maximum is not a quota.
  count = 1;
  const short = await runRecruitmentAI({ task: 'scorecard', brief, level: 'Manager', resultCacheMode: 'refresh' }, env);
  assert.equal((short.output as ScorecardData).criteria.length, 1);
  count = 7;
  const response = await handleMcpRequest(new Request('https://example.invalid/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'limit-test-user' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'm2_build_scorecard', arguments: { brief, level: 'Manager' } } }),
  }), env);
  const json = await response.json() as { error: { code: number; message: string } };
  assert.equal(json.error.code, -32602);
  assert.match(json.error.message, /génération IA a échoué|contrôles/);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('PASS: 6/6/6/8 limits, provider schemas and prompts, over-limit rejection through server and MCP, short grids, cache reuse, two questions and empty notes. No network or AI credits used.');
