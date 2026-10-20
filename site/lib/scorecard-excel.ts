import JSZip from 'jszip';
import { scorecardPrimaryQuestions } from './scorecard-questions';
import type { BriefData, ScorecardData } from './recruitment-engine';

export const EXCEL_TEMPLATE_ID = 'RI_EXCEL_REFERENCE_1_0';
export const EXCEL_TEMPLATE_URL = '/templates/scorecard-reference-v1.xlsx';

const scoreHeaders = ['Critère', 'Poids', 'Questions principales', 'Note / 3', 'Score pondéré', 'Preuves observées', 'Écarts / points à vérifier'];
const guideHeaders = ['Critère', 'Type', 'Questions à poser', 'Ce qu’il faut évaluer', 'Durée (min)', 'Repères de notation (0 à 3)'];
const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

function unprefix(value: string) {
  const prefix = value.match(/<(\w+):(?:worksheet|workbook)\b/)?.[1];
  return prefix ? value.replace(new RegExp(`<(/?)${prefix}:`, 'g'), '<$1').replace(`xmlns:${prefix}=`, 'xmlns=') : value;
}

function stylesOf(value: string) {
  const styles: Record<string, string> = {};
  for (const match of value.matchAll(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const address = match[1].match(/\br="([A-Z]+\d+)"/)?.[1];
    if (address) styles[address] = match[1].match(/\bs="(\d+)"/)?.[1] ?? '0';
  }
  return styles;
}

function cell(address: string, value: string | number | null, style = '0', formula?: string) {
  const attrs = `r="${address}" s="${style}"`;
  if (formula) return `<c ${attrs}><f>${xml(formula)}</f></c>`;
  if (value === null || value === '') return `<c ${attrs}/>`;
  if (typeof value === 'number') return `<c ${attrs}><v>${value}</v></c>`;
  // User-authored text is always an inline string, never an Excel formula.
  return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function row(index: number, cells: string[], height?: number) {
  return `<row r="${index}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells.join('')}</row>`;
}

function replaceElement(document: string, name: string, content: string) {
  const full = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>|<${name}\\b[^>]*\\/>`);
  if (full.test(document)) return document.replace(full, content);
  return document.replace('</worksheet>', `${content}</worksheet>`);
}

function finishSheet(document: string, rows: string[], merges: string[], lastCell: string, validation = '') {
  let result = replaceElement(document, 'sheetData', `<sheetData>${rows.join('')}</sheetData>`);
  result = replaceElement(result, 'mergeCells', `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`);
  result = result.replace(/<dimension\b[^>]*\/>/, `<dimension ref="A1:${lastCell}"/>`);
  result = replaceElement(result, 'dataValidations', validation);
  // Native print settings remain part of the renderer, not model output.
  result = result.replace(/<pageSetup\b[^>]*\/>/g, '');
  result = result.replace('</worksheet>', '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>');
  return result;
}

function durationPerCriterion(scorecard: ScorecardData) {
  const times = (scorecard.duration.match(/\d+/g) ?? ['60']).map(Number);
  const total = Math.max(...times) - 10;
  const base = Math.max(1, Math.floor(total / scorecard.criteria.length));
  const remainder = Math.max(0, total - base * scorecard.criteria.length);
  return scorecard.criteria.map((_, i) => base + (i < remainder ? 1 : 0));
}

export async function buildScorecardExcel(template: Uint8Array, scorecard: ScorecardData, brief: BriefData): Promise<Uint8Array> {
  const criteria = scorecard.criteria;
  if (!criteria.length || criteria.length > 50) throw new Error('La scorecard doit contenir entre 1 et 50 critères pour être exportée.');
  if (criteria.some(item => ![1, 2, 3].includes(item.coefficient) || (item.note !== null && (!Number.isInteger(item.note) || item.note < 0 || item.note > 3)))) throw new Error('Vérifiez les coefficients et les notes de la scorecard.');
  if (!Number.isFinite(scorecard.globalThreshold) || scorecard.globalThreshold < 0 || scorecard.globalThreshold > 100) throw new Error('Le seuil de la scorecard doit être compris entre 0 et 100 %.');
  const archive = await JSZip.loadAsync(template);
  const sheet1 = archive.file('xl/worksheets/sheet1.xml');
  const sheet2 = archive.file('xl/worksheets/sheet2.xml');
  const workbook = archive.file('xl/workbook.xml');
  if (!sheet1 || !sheet2 || !workbook) throw new Error('Le modèle Excel de référence est indisponible.');
  const source = unprefix(await sheet1.async('string'));
  const sourceGuide = unprefix(await sheet2.async('string'));
  const s = stylesOf(source), g = stylesOf(sourceGuide);
  const sc = (address: string, value: string | number | null, from = address, formula?: string) => cell(address, value, s[from], formula);
  const gc = (address: string, value: string | number | null, from = address, formula?: string) => cell(address, value, g[from], formula);
  const end = 11 + criteria.length;
  const summary = end + 2;
  const noteRange = `D12:D${end}`;
  const weightRange = `B12:B${end}`;
  const scoreRange = `E12:E${end}`;
  const assessedWeight = `SUM(${criteria.map((_,i) => `IF(ISNUMBER(D${12+i}),B${12+i},0)`).join(',')})`;
  const underMinimum = criteria.flatMap((item, i) => item.eliminatory && item.minimum > 0 ? [`AND(ISNUMBER(D${12+i}),D${12+i}<${item.minimum})`] : []);
  const thresholdResult = 'IF(E6>=B6,"GO",IF(E6>=B7,"À approfondir","NO GO"))';
  const finalResult = underMinimum.length ? `IF(OR(${underMinimum.join(',')}),"Minimum à examiner",${thresholdResult})` : thresholdResult;
  const context = [brief.location, scorecard.level, scorecard.method, scorecard.duration].filter(Boolean).join(' · ');
  const rows = [
    row(1, [sc('A1', brief.roleTitle || 'Scorecard')], 32),
    row(2, [sc('A2', context)], 25),
    row(4, [sc('A4', 'Candidat'), sc('B4', null), sc('D4', 'Date'), sc('E4', null)], 28),
    row(6, [sc('A6', 'Seuil GO'), sc('B6', scorecard.globalThreshold / 100), sc('D6', 'Score indicatif'), sc('E6', null, 'E6', `IF(COUNT(${noteRange})=0,"",SUM(${scoreRange})/(3*${assessedWeight}))`)]),
    row(7, [sc('A7', 'À approfondir dès'), sc('B7', Math.max(0, scorecard.globalThreshold - 10) / 100), sc('D7', 'Indication'), sc('E7', null, 'E7', `IF(COUNT(${noteRange})<ROWS(${noteRange}),"À compléter",${finalResult})`)]),
    row(8, [sc('A8', 'Non évalués'), sc('B8', null, 'B8', `ROWS(${noteRange})-COUNT(${noteRange})`), sc('D8', 'Couverture'), sc('E8', null, 'E8', `IF(SUM(${weightRange})=0,"",${assessedWeight}/SUM(${weightRange}))`)]),
    row(9, [sc('A9', 'NE : non évalué. 0 : non démontré. 1 : partiel. 2 : niveau attendu. 3 : maîtrise avec recul.')], 30),
    row(11, scoreHeaders.map((value, i) => sc(`${String.fromCharCode(65+i)}11`, value)), 36),
  ];
  criteria.forEach((item, i) => {
    const r = 12+i;
    rows.push(row(r, [sc(`A${r}`, item.criterion, 'A12'), sc(`B${r}`, item.coefficient, 'B12'), sc(`C${r}`, scorecardPrimaryQuestions(item), 'C12'), sc(`D${r}`, item.note, 'D12'), sc(`E${r}`, null, 'E12', `IF(ISNUMBER(D${r}),B${r}*D${r},"")`), sc(`F${r}`, item.comment, 'F12'), sc(`G${r}`, null, 'G12')], Math.min(409, Math.max(158, 20 * Math.ceil(scorecardPrimaryQuestions(item).length / 55)))));
  });
  rows.push(row(summary, [sc(`A${summary}`, 'Synthèse', 'A19')], 25));
  ['Points forts', 'Points à approfondir', 'Décision / prochaine étape'].forEach((title, i) => {
    const r = summary+1+i;
    rows.push(row(r, [sc(`A${r}`, title, 'A20'), sc(`B${r}`, null, 'B20')], 62));
  });
  rows.push(row(summary+5, [sc(`A${summary+5}`, `La synthèse et la décision sont humaines. Candidat : saisir uniquement une référence pseudonymisée. ${EXCEL_TEMPLATE_ID}`, 'A24')], 34));
  const merges = ['A1:G1','A2:G2','B4:C4','E7:G7','A9:G9',`A${summary}:G${summary}`, ...[1,2,3].map(i => `B${summary+i}:G${summary+i}`), `A${summary+5}:G${summary+5}`];
  const validations = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="stop" errorTitle="Note non valide" error="Choisissez NE ou une note entière de 0 à 3." sqref="${noteRange}"><formula1>"NE,0,1,2,3"</formula1></dataValidation></dataValidations>`;
  archive.file('xl/worksheets/sheet1.xml', finishSheet(source, rows, merges, `G${summary+5}`, validations));

  const guideEnd = 3+criteria.length;
  const foot = guideEnd+2;
  const minutes = durationPerCriterion(scorecard);
  const guideRows = [row(1, [gc('A1', `Guide d’évaluation - ${brief.roleTitle || 'Recrutement'}`)], 32), row(3, guideHeaders.map((value, i) => gc(`${String.fromCharCode(65+i)}3`, value)), 36)];
  criteria.forEach((item, i) => {
    const r = 4+i;
    const question = [scorecardPrimaryQuestions(item), item.followUps ? `Relances ${scorecard.method} et QQOQCCP :\n${item.followUps}` : ''].filter(Boolean).join('\n\n');
    const rule = item.eliminatory ? `Règle à examiner humainement : critère éliminatoire, minimum ${item.minimum}/3.` : `Critère non éliminatoire. Minimum configuré : ${item.minimum}/3.`;
    const evidence = [item.definition, item.expectedEvidence ? `Preuves recherchées :\n${item.expectedEvidence}` : '', rule].filter(Boolean).join('\n\n');
    const anchors = [0,1,2,3].map(level => `${level} = ${item[`anchor${level}` as 'anchor0' | 'anchor1' | 'anchor2' | 'anchor3']}`).join('\n');
    const longest = Math.max(question.length/55, evidence.length/54, anchors.length/76, item.criterion.length/30);
    const height = Math.min(409, Math.max(150, Math.ceil(longest)*16+70));
    guideRows.push(row(r, [gc(`A${r}`, item.criterion, 'A4'), gc(`B${r}`, [item.type,item.dimension].filter(Boolean).join(' · '), 'B4'), gc(`C${r}`, question, 'C4'), gc(`D${r}`, evidence, 'D4'), gc(`E${r}`, minutes[i], 'E4'), gc(`F${r}`, anchors, 'F4')], height));
  });
  guideRows.push(row(foot, [gc(`A${foot}`, null, 'A11', `"Entretien : "&SUM(E4:E${guideEnd})&" min de questions + 10 min de présentation et de clôture. Durées indicatives modifiables."`)], 28));
  const footerEntries = [
    ['Preuves', `Type ${scorecard.level}. Méthode ${scorecard.method}. Recueillir contexte, actions et résultats, y compris projets et autres environnements. Distinguer expérience vécue et exercice. Une preuve transférable peut atteindre 2 ou 3 ; vérifier séparément les écarts indispensables.`],
    ['Notation', 'NE ou vide : non évalué et exclu du score. 0 : note évaluée et incluse. La couverture pondérée apparaît séparément. L’indication reste À compléter tant que des critères ne sont pas notés.'],
  ];
  footerEntries.forEach(([title, content], i) => guideRows.push(row(foot+1+i, [gc(`A${foot+1+i}`, title, 'A12'), gc(`B${foot+1+i}`, content, 'B12')], title==='Preuves'?80:45)));
  // Link threshold guidance to the editable Scorecard controls so it cannot diverge.
  guideRows.push(row(foot+3, [gc(`A${foot+3}`, 'Calcul', 'A14'), gc(`B${foot+3}`, null, 'B14', `"Score = somme des notes × poids / (3 × poids évalués). GO à "&TEXT('Scorecard'!B6,"0%")&" ; à approfondir à "&TEXT('Scorecard'!B7,"0%")&". Examiner les minima avant la décision humaine."`)], 45));
  const guideMerges = ['A1:F1', `A${foot}:F${foot}`, ...[1,2,3].map(i => `B${foot+i}:F${foot+i}`)];
  archive.file('xl/worksheets/sheet2.xml', finishSheet(sourceGuide, guideRows, guideMerges, `F${foot+3}`));
  let bookXml = unprefix(await workbook.async('string'));
  bookXml = bookXml.replace(/<calcPr\b[^>]*(?:\/>|>[\s\S]*?<\/calcPr>)/g, '');
  bookXml = bookXml.replace('</workbook>', '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
  archive.file('xl/workbook.xml', bookXml);
  return archive.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
