import assert from 'node:assert/strict';
import { chooseModel, handleAIRequest, runRecruitmentAI } from '../lib/recruitment-ai';
import { handleMcpRequest } from '../lib/mcp-server';
import { buildScorecard, emptyBrief, type JobAdSection, type ScorecardData } from '../lib/recruitment-engine';
import { retrieveStyleExcerpts, selectStyleExcerpts } from '../lib/style-reference';
import type { AIAnalysis } from '../lib/ai-contract';
import { assertNoDirectIdentifiers, candidateInitials, prepareCandidateForModel } from '../lib/candidate-privacy';
import { AI_RESULT_CACHE_VERSION, createAIResultCacheKey } from '../lib/ai-cache';

// Données fictives, identiques pour les trois contrôles métier. Aucune donnée candidat.
const brief = { ...emptyBrief,
  roleTitle: 'Responsable support utilisateurs',
  recruitmentReason: 'Remplacement du responsable support pour stabiliser le traitement des incidents.',
  consequences: 'Le responsable informatique reprend actuellement les escalades et ne peut plus piloter ses projets.',
  alternatives: 'Une prestation a été étudiée puis écartée pour conserver le management en interne.',
  goals3: 'Cartographier les incidents récurrents et reprendre les escalades prioritaires.',
  goals6: 'Réduire de 20 % les tickets de plus de dix jours par rapport au relevé du premier mois.',
  goals12: 'Faire fonctionner une base de connaissances alimentée par les quatre techniciens.',
  indicators: 'Âge des tickets ; taux de réouverture ; utilisation de la base de connaissances.',
  missions: 'Prioriser les incidents ; encadrer quatre techniciens ; analyser les causes récurrentes ; maintenir la base de connaissances.',
  priorities: 'Résorber les tickets anciens sans dégrader la qualité des résolutions.',
  tools: 'Microsoft 365 ; Active Directory ; GLPI',
  methods: 'Gestion des incidents et documentation des résolutions.',
  interactions: 'Utilisateurs internes et équipe infrastructure.',
  management: 'Quatre techniciens ; rattachement au responsable informatique.',
  autonomy: 'Arbitrage quotidien des priorités ; les dépenses restent validées par le responsable informatique.',
  mustHave: 'Diagnostic des incidents Microsoft 365 et Active Directory\nPriorisation des incidents selon leur impact\nManagement de proximité',
  important: 'Structuration d’une base de connaissances',
  niceToHave: 'Connaissance de PowerShell, apprenable après l’arrivée',
  softSkills: 'Expliquer simplement un incident à un utilisateur non technique\nArbitrer calmement deux urgences concurrentes',
  difficultSituations: 'Un incident affecte plusieurs équipes pendant une absence de deux techniciens.',
  eliminatory: 'Aucun',
  assets: 'Responsabilité de l’organisation du support et marge de décision sur les priorités quotidiennes.',
  constraints: 'Présence sur site nécessaire trois jours par semaine. Pas d’astreinte.',
  salary: '45 000 à 50 000 euros bruts annuels fixes',
  benefits: 'Titres-restaurant', location: 'Lyon', remote: 'Deux jours de télétravail par semaine après intégration',
  schedule: 'Du lundi au vendredi, 9 h à 18 h', mobility: 'Aucun déplacement', team: 'Quatre techniciens',
  recruitmentProcess: 'Entretien RH puis entretien manager avec un cas de diagnostic technique.',
};

const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_LUNA_MODEL: 'gpt-6-luna', OPENAI_SOL_MODEL: 'gpt-6.1-sol' };
const request = (body: unknown, identity = true) => new Request('https://test.invalid/api/ai', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(identity ? { 'oai-authenticated-user-id': 'test-user' } : {}) }, body: JSON.stringify(body),
});
assert.equal((await handleAIRequest(request({ task: 'analyze', brief }, false), env)).status, 401);
assert.equal((await handleAIRequest(new Request('https://test.invalid/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://untrusted.invalid', 'oai-authenticated-user-id': 'test-user' }, body: '{}' }), env)).status, 403);
await assert.rejects(() => runRecruitmentAI({ task: 'analyze', brief }, {}), /configuré/);
await assert.rejects(() => runRecruitmentAI({ task: 'analyze', brief, injected: true }, env), /invalides/);
assert.ok(buildScorecard(brief, 'Opérationnel', 60).criteria.every(item => !item.eliminatory && item.minimum === 0));
const retrieved = retrieveStyleExcerpts('Le support utilisateurs traite les incidents Microsoft 365.\n\nLa finance prépare le budget annuel.\n\nLe support documente les résolutions récurrentes.', 'support utilisateurs incidents');
assert.equal(retrieved.length, 2);
assert.ok(retrieved.every(item => item.score > 0 && item.matchedTerms.includes('support')));
assert.equal(selectStyleExcerpts('Texte sans correspondance.', 'support utilisateurs').length, 0);
assert.deepEqual(chooseModel('import', 'auto', env), { model: 'gpt-6-luna', reasoningEffort: 'low' });
assert.deepEqual(chooseModel('offer', 'auto', env), { model: 'gpt-6.1-sol', reasoningEffort: 'medium' });
assert.deepEqual(chooseModel('scorecard', 'luna', env), { model: 'gpt-6-luna', reasoningEffort: 'low' });
const cacheA = await createAIResultCacheKey({ task: 'analyze', brief: { roleTitle: 'Support', missions: 'Incidents' } }, 'test-user');
const cacheB = await createAIResultCacheKey({ brief: { missions: 'Incidents', roleTitle: 'Support' }, task: 'analyze' }, 'test-user');
const cacheC = await createAIResultCacheKey({ task: 'analyze', brief: { roleTitle: 'Support', missions: 'Réseau' } }, 'test-user');
assert.ok(cacheA?.startsWith(`${AI_RESULT_CACHE_VERSION}:`));
assert.equal(cacheA, cacheB);
assert.notEqual(cacheA, cacheC);
assert.equal(await createAIResultCacheKey({ task: 'analyze', dataScope: 'candidate', candidateName: 'Jean Dupont' }, 'test-user'), null);
assert.equal(candidateInitials('Jean Dupont'), 'J.D.');
const privateCandidate = prepareCandidateForModel({
  candidateName: 'Jean Dupont', candidateReference: 'J.D.-A7K2', sourceName: 'CV Jean Dupont.pdf',
  content: 'Jean Dupont, jean.dupont@example.com, +33 6 12 34 56 78, https://linkedin.com/in/jean-dupont, 12 rue de Paris',
});
assert.equal(privateCandidate.reference, 'J.D.-A7K2');
assert.ok(privateCandidate.content.includes('J.D.-A7K2'));
assert.ok(!/Jean|Dupont|example\.com|linkedin|06 12/i.test(privateCandidate.content));
assertNoDirectIdentifiers(privateCandidate.content);
const discovery = await handleMcpRequest(new Request('https://test.invalid/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }), env);
assert.equal(discovery.status, 200);
assert.equal((await handleMcpRequest(new Request('https://test.invalid/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'm1_analyze_need', arguments: { brief } } }) }), env)).status, 401);
console.info(JSON.stringify({ offlineChecks: 'PASS', checks: 22, routing: 'Luna low / Sol medium', privacy: 'PASS', resultCache: 'PASS', selectiveRag: 'PASS' }));

if (process.argv.includes('--live')) {
  const analysis = await runRecruitmentAI({ task: 'analyze', brief }, env);
  assert.equal(analysis.status, 'AI_PROPOSED');
  const a = analysis.output as AIAnalysis;
  assert.ok(a.synthesis.length > 60 && a.followUpQuestions.length <= 8);
  console.info(JSON.stringify({ task: 'analyze', result: 'PASS', questions: a.followUpQuestions.length, sample: a.followUpQuestions[0] }));

  const offer = await runRecruitmentAI({ task: 'offer', brief, format: 'Standard', tone: 'Professionnel direct', styleCorpus: 'Le support est un point de contact concret avec le travail quotidien. Décrire un problème, puis son effet observable, permet de comprendre pourquoi il compte.' }, env);
  const sections = (offer.output as { sections: JobAdSection[] }).sections;
  assert.equal(sections.length, 8);
  assert.equal(new Set(sections.map(item => item.id)).size, 8);
  assert.ok(offer.sourceRefs.some(ref => ref.id === 'user-corpus'));
  const offerText = sections.map(s => s.body).join('\n');
  assert.ok(/Lyon/i.test(offerText));
  assert.ok(/45\s?000/.test(offerText) && /50\s?000/.test(offerText));
  assert.ok(!sections.find(s => s.id === 'required')!.body.includes('PowerShell'));
  assert.ok(!/Alberta|Curtis|Pearson|Courrier international/i.test(offerText));
  console.info(JSON.stringify({ task: 'offer', result: 'PASS', sections: sections.length, words: offerText.split(/\s+/).length, sample: sections[0].body }));

  const scorecard = await runRecruitmentAI({ task: 'scorecard', brief, level: 'Opérationnel', globalThreshold: 60 }, env);
  const s = scorecard.output as ScorecardData;
  assert.ok(s.criteria.length >= 5 && s.criteria.length <= 7);
  assert.ok(s.criteria.every(item => !item.eliminatory && item.minimum === 0 && item.note === null && !item.comment));
  assert.ok(new Set(s.criteria.map(item => item.anchor2)).size === s.criteria.length);
  assert.ok(s.criteria.some(item => /Microsoft|Active Directory|diagnostic/i.test(item.mainQuestion + item.expectedEvidence)));
  assert.ok(!s.criteria.some(item => /PowerShell/i.test(item.criterion)));
  console.info(JSON.stringify({ task: 'scorecard', result: 'PASS', criteria: s.criteria.length, sample: s.criteria[0].mainQuestion, anchor2: s.criteria[0].anchor2 }));

  const sourceText = 'Nous recrutons un technicien support à Lille. La maîtrise de Microsoft 365 est indispensable. La connaissance de PowerShell est un plus. Le poste prévoit deux jours de télétravail par semaine. Aucun déplacement.';
  const imported = await runRecruitmentAI({ task: 'import', sourceText, sourceName: 'Offre fictive' }, env);
  const fields = (imported.output as { fields: Array<{ key: string; value: string; excerpt: string }> }).fields;
  assert.ok(fields.some(item => item.key === 'location' && /Lille/i.test(item.value)));
  assert.ok(fields.every(item => sourceText.includes(item.excerpt)));
  assert.ok(!fields.some(item => item.key === 'mustHave' && /PowerShell/i.test(item.value)));
  console.info(JSON.stringify({ task: 'import', result: 'PASS', fields: fields.length }));
}
