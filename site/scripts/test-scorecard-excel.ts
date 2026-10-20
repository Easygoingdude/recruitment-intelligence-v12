import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { buildScorecardExcel } from '../lib/scorecard-excel';
import { emptyBrief, type ScorecardData, type ScorecardCriterion } from '../lib/recruitment-engine';

// Fictional job requirements only. No candidate data or model calls.
const labels = ['Diagnostic des incidents', 'Priorisation du support', 'Organisation de l’équipe', 'Documentation', 'Communication utilisateur', 'Amélioration continue'];
const questions = [
  'Décrivez un incident utilisateur que vous avez résolu. Quels contrôles avez-vous réalisés et dans quel ordre ?',
  'Deux incidents arrivent en même temps. Racontez comment vous avez choisi lequel traiter en premier.',
  'Pendant une absence dans l’équipe, comment avez-vous réparti les tickets et suivi leur résolution ?',
  'Donnez un exemple de procédure que vous avez rédigée. Comment avez-vous vérifié qu’elle était utile ?',
  'Racontez une situation où vous avez expliqué un incident à un utilisateur mécontent. Qu’avez-vous dit ?',
  'Décrivez une action qui a réduit les incidents récurrents. Comment avez-vous mesuré son effet ?',
];
const criteria: ScorecardCriterion[] = labels.map((criterion, i) => ({
  id: `fictional-${i}`, criterion, type: i === 4 ? 'Soft skill' : 'Hard skill',
  definition: `Évaluer la capacité à ${criterion.toLowerCase()} dans une situation vécue.`,
  coefficient: ([3, 3, 2, 2, 2, 1] as const)[i], eliminatory: i === 0, minimum: i === 0 ? 2 : 1,
  mainQuestion: questions[i], transferQuestion: `Décrivez une expérience dans un autre environnement mobilisant ${criterion.toLowerCase()}. Quelles actions seraient réutilisables pour le support utilisateur ?`, followUps: 'Quel était votre rôle personnel ? Qu’avez-vous fait ? Quel résultat avez-vous observé ?',
  expectedEvidence: 'Exemple situé, actions personnelles expliquées et résultat vérifiable.',
  anchor0: 'Aucun exemple ou aucune démarche démontrée.', anchor1: 'Exemple partiel, besoin d’aide important.',
  anchor2: 'Actions cohérentes et résultat expliqué en autonomie.', anchor3: 'Diagnostic argumenté, résultat mesuré et amélioration durable.',
  note: null, comment: '',
}));
const scorecard: ScorecardData = {level:'Manager',method:'SOAR enrichi',scale:'0–3',duration:'45–60 min',globalThreshold:60,criteria,
  metadata:{schemaVersion:'1.0',templateId:'SCORECARD_STANDARD',templateVersion:'1.0',rendererVersion:'1.0',scorecardVersion:1,layoutContractId:'SCORECARD_STANDARD_1_0'}};
const brief = {...emptyBrief,roleTitle:'Responsable support utilisateurs',location:'Exemple fictif'};
const template = new Uint8Array(await fs.readFile('public/templates/scorecard-reference-v1.xlsx'));
const original = await JSZip.loadAsync(template);
const normalize = (s: string) => s.replace(/x:/g, '');
for (const n of [1,6,8,50]) {
  const data = {...scorecard,criteria:Array.from({length:n},(_,i)=>({...criteria[i%6],id:`test-${i}`,criterion:`${labels[i%6]} (${i+1})`}))};
  const bytes = await buildScorecardExcel(template,data,brief);
  const zip = await JSZip.loadAsync(bytes);
  const main = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  const guide = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
  const book = await zip.file('xl/workbook.xml')!.async('string');
  assert.match(book,/name="Scorecard"/); assert.match(book,/name="Guide entretien"/);
  assert.match(main,new RegExp(`sqref="D12:D${11+n}"`));
  assert.match(main, /&quot;NE,0,1,2,3&quot;|"NE,0,1,2,3"/);
  assert.match(main,/<c r="B4"[^>]*\/>/);
  assert.match(main,/<c r="E4"[^>]*\/>/);
  assert.ok(main.includes('2. Compétence transférable'));
  assert.ok(guide.includes('2. Compétence transférable'));
  assert.ok(main.includes('autre environnement'));
  assert.match(main,/Preuves observées/); assert.match(guide,/Repères de notation/);
  assert.match(main,/SUM\(IF\(ISNUMBER\(D12\),B12,0\)/);
  assert.match(main,/Minimum à examiner/); assert.match(book,/fullCalcOnLoad/);
  for (let i=0;i<n;i++) {
    assert.ok(main.includes(`B${12+i}*D${12+i}`));
    assert.ok(guide.includes(`r="F${4+i}"`));
    assert.ok(guide.includes(`(${i+1})`));
  }
  for (const [file,content] of [['sheet1.xml',main],['sheet2.xml',guide]]) {
    const source = normalize(await original.file(`xl/worksheets/${file}`)!.async('string'));
    assert.equal(content.match(/<cols>[\s\S]*?<\/cols>/)?.[0], source.match(/<cols>[\s\S]*?<\/cols>/)?.[0]);
    assert.ok(!content.includes('t="shared"'));
  }
}
await assert.rejects(buildScorecardExcel(template,{...scorecard,criteria:[{...criteria[0],note:4}]},brief));
await assert.rejects(buildScorecardExcel(template,{...scorecard,criteria:[]},brief));
const literal = await JSZip.loadAsync(await buildScorecardExcel(template,{...scorecard,criteria:[{...criteria[0],comment:'=HYPERLINK("https://invalid.example")'}]},brief));
assert.match(await literal.file('xl/worksheets/sheet1.xml')!.async('string'),/t="inlineStr"><is><t[^>]*>=HYPERLINK/);
const out = process.env.EXCEL_QA_OUTPUT;
if(out) {
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(`${out}/Scorecard_Exemple_Export_Corrige.xlsx`,await buildScorecardExcel(template,scorecard,brief));
}
console.log('PASS: 1/6/8/50 criteria, two sheets, widths, independent formulas, NE validation, human fields, minimum checks, literal text, invalid inputs. No AI calls.');
