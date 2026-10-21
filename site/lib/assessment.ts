import {randomId} from './random-id';
import { z } from 'zod';
import { SCORECARD_LEVELS, type ScorecardData, type ScorecardCriterion } from './recruitment-engine';

export const ASSESSMENT_VERSION = 'RI_ASSESSMENT_1_0';
export const ASSESSMENT_STORAGE_KEY = 'recruitment-intelligence-v12-assessments';
export const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const interviewDate = (s:AssessmentSession) => s.interviewAt ?? s.createdAt;
export const interviewExpiry = (s:AssessmentSession) => Math.min(Math.min(Date.parse(interviewDate(s)),Date.parse(s.createdAt)) + RETENTION_MS,s.retainedUntil?Date.parse(s.retainedUntil):Infinity);
export const activeInterviews = (sessions:AssessmentSession[],now=Date.now()) => sessions.filter(s=>interviewExpiry(s)>now);
export const formatInterviewDate = (value:string) => new Date(value).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
export const initialsSchema = z.string().trim().regex(/^\p{Lu}\.\p{Lu}\.(?:-[A-Z0-9]{3,8})?$/u, 'Utilisez les initiales prénom.nom, par exemple J.D.');
// Accept common typing variants only at input; persisted references remain strict.
export function parseInitialsInput(value:string,field:'candidat'|'évaluateur'){
 const input=value.normalize('NFC').trim().toLocaleUpperCase('fr-FR');
 if(!input)throw new Error(`Renseignez les initiales ${field==='candidat'?'du candidat':'de l’évaluateur'} (exemple : J.D.).`);
 const match=/^(\p{Lu})[.\s]*(\p{Lu})\.?\s*(?:-([A-Z0-9]{3,8}))?$/u.exec(input);
 if(!match)throw new Error(`Initiales ${field==='candidat'?'du candidat':'de l’évaluateur'} : saisissez deux lettres, par exemple JD ou J.D., dans l’ordre prénom puis nom.`);
 return initialsSchema.parse(`${match[1]}.${match[2]}.${match[3]?`-${match[3]}`:''}`);
}
const text = z.string().max(6000);
const criterionSchema = z.object({
  id: z.string().min(1).max(100), criterion: text, type: z.enum(['Hard skill','Soft skill','Hybride']),
  definition: text, coefficient: z.union([z.literal(1),z.literal(2),z.literal(3)]),
  eliminatory: z.boolean(), minimum: z.union([z.literal(0),z.literal(1),z.literal(2),z.literal(3)]),
  mainQuestion: text, transferQuestion: text.optional(), followUps: text, expectedEvidence: text,
  anchor0: text, anchor1: text, anchor2: text, anchor3: text,
  dimension: z.enum(['Compétences métier','Comportements et apprentissage','Motivation professionnelle']).optional(),
  note: z.number().int().min(0).max(3).nullable(), comment: text,
});
export const frozenScorecardSchema = z.object({
  sourceBriefSnapshot: z.string().max(170000).optional(), profile: z.enum(['Standard','Jeune diplômé','Expérience transférable']).optional(),
  level: z.enum(SCORECARD_LEVELS), method: z.enum(['SAR','STAR','SOAR enrichi']), scale: z.literal('0–3'), duration: text,
  globalThreshold: z.number().min(0).max(100), criteria: z.array(criterionSchema).min(1).max(50),
  metadata: z.object({ schemaVersion:z.literal('1.0'), templateId:z.literal('SCORECARD_STANDARD'),templateVersion:z.literal('1.0'),rendererVersion:z.literal('1.0'),scorecardVersion:z.number().int().min(1),layoutContractId:z.literal('SCORECARD_STANDARD_1_0') }),
}).superRefine((card,ctx)=>{if(new Set(card.criteria.map(c=>c.id)).size!==card.criteria.length)ctx.addIssue({code:'custom',message:'Identifiants de critères dupliqués.'});});
export const agentDraftSchema = z.object({
  summary: z.string().max(3000),
  questions: z.array(z.object({criterionId:z.string(),question:z.string().max(600)}).strict()).max(6),
  findings: z.array(z.object({criterionId:z.string(),quote:z.string().min(1).max(600),analysis:z.string().max(900)}).strict()).max(8),
  limitations: z.array(z.string().max(400)).max(6),
}).strict();
export type AgentDraft = z.infer<typeof agentDraftSchema>;
export type AgentTask = 'interview'|'evaluate'|'report';
export const agentEnvelopeSchema = z.object({
  task:z.enum(['interview','evaluate','report']), model:z.string(), reasoningEffort:z.enum(['low','medium']),
  generatedAt:z.string(), inputFingerprint:z.string(), output:agentDraftSchema,
  usage:z.object({inputTokens:z.number().optional(),outputTokens:z.number().optional()}).optional(),
  harness:z.object({version:z.string(),modelCalls:z.literal(1),maxRetries:z.literal(0),inputCharacters:z.number(),maxOutputTokens:z.number(),redactions:z.number(),resultCache:z.literal('disabled'),promptCache:z.literal('disabled-private')}),
  sources:z.array(z.object({id:z.string(),version:z.string(),title:z.string()})),
});
export type AgentEnvelope=z.infer<typeof agentEnvelopeSchema>;
export const assessmentSchema=z.object({
 id:z.string().uuid(),reference:initialsSchema,evaluator:initialsSchema,createdAt:z.string().datetime(),updatedAt:z.string().datetime(),
 jobId:z.string().uuid().optional(),applicationId:z.string().uuid().optional(),appointmentId:z.string().uuid().optional(),
 followUpOutcome:z.object({value:z.enum(['Go','No Go']),at:z.string().datetime()}).optional(),
 interviewAt:z.string().datetime().optional(),
 retainedUntil:z.string().datetime().optional(),
 candidateCv:z.object({text:z.string().max(40000),importedAt:z.string().datetime(),reviewed:z.literal(true)}).optional(),
 roleTitle:z.string().max(300),scorecard:frozenScorecardSchema,
 entries:z.record(z.object({evidence:text,comment:text,note:z.number().int().min(0).max(3).nullable()})),
 completedAt:z.string().datetime().nullable(),decision:z.object({value:z.enum(['À décider','Poursuivre','À approfondir','Ne pas poursuivre']),justification:text,author:initialsSchema,date:z.string().datetime()}).nullable(),
 reportText:text,reportValidatedAt:z.string().datetime().nullable(),
 drafts:z.object({interview:agentEnvelopeSchema.optional(),evaluate:agentEnvelopeSchema.optional(),report:agentEnvelopeSchema.optional()}),
 audit:z.array(z.object({date:z.string().datetime(),actor:initialsSchema,event:z.string().max(300)})).max(1000),
}).superRefine((s,ctx)=>{
 const ids=s.scorecard.criteria.map(c=>c.id);
 if(Object.keys(s.entries).length!==ids.length||ids.some(id=>!s.entries[id]))ctx.addIssue({code:'custom',message:'Les preuves ne correspondent pas à la grille figée.'});
 if(s.scorecard.criteria.some(c=>c.note!==null||c.comment!==''))ctx.addIssue({code:'custom',message:'La grille figée ne doit contenir aucune évaluation candidat.'});
 if(ids.some(id=>s.entries[id]?.note!==null&&!s.entries[id]?.evidence.trim()))ctx.addIssue({code:'custom',message:'Toute note requiert une preuve.'});
});
export type AssessmentSession=z.infer<typeof assessmentSchema>;
export const backupSchema=z.object({version:z.literal(ASSESSMENT_VERSION),sessions:z.array(assessmentSchema).max(100)}).strict();

export function createAssessment(scorecard:ScorecardData,roleTitle:string,initials:string,evaluator:string,interviewAt=new Date().toISOString()):AssessmentSession{
 const candidate=parseInitialsInput(initials,'candidat'), actor=parseInitialsInput(evaluator,'évaluateur');
 const card=frozenScorecardSchema.parse(structuredClone(scorecard));
 card.criteria=card.criteria.map(c=>({...c,note:null,comment:''}));
 const now=new Date().toISOString();
 return assessmentSchema.parse({id:randomId(),reference:`${candidate.split('-')[0]}-${randomId().replaceAll('-','').slice(0,6).toUpperCase()}`,evaluator:actor,createdAt:now,updatedAt:now,interviewAt,roleTitle,scorecard:card,
 entries:Object.fromEntries(card.criteria.map(c=>[c.id,{evidence:'',comment:'',note:null}])),completedAt:null,decision:null,reportText:'',reportValidatedAt:null,drafts:{},audit:[{date:now,actor,event:'Grille validée et figée pour cet entretien'}]});
}

export function updateAssessment(session:AssessmentSession,id:string,patch:Partial<AssessmentSession['entries'][string]>):AssessmentSession{
 if(!session.entries[id])throw new Error('Critère inconnu.');
 const next=structuredClone(session);const now=new Date().toISOString();
 next.entries[id]={...next.entries[id],...patch};
 if(next.entries[id].note!==null && !next.entries[id].evidence.trim())throw new Error('Consignez une preuve avant d’attribuer une note, y compris 0.');
 next.updatedAt=now;next.completedAt=null;next.decision=null;next.reportValidatedAt=null;
 next.audit=[...next.audit,{date:now,actor:next.evaluator,event:`Évaluation modifiée : ${id}`}].slice(-1000);
 return assessmentSchema.parse(next);
}

export function assessmentTotals(session:AssessmentSession){
 const criteria=session.scorecard.criteria;
 const totalWeight=criteria.reduce((s,c)=>s+c.coefficient,0);
 const assessed=criteria.filter(c=>session.entries[c.id]?.note!==null && session.entries[c.id]?.note!==undefined);
 const assessedWeight=assessed.reduce((s,c)=>s+c.coefficient,0);
 const score=assessedWeight?100*assessed.reduce((s,c)=>s+c.coefficient*session.entries[c.id].note!,0)/(3*assessedWeight):null;
 const belowMinimum=criteria.filter(c=>{const note=session.entries[c.id]?.note;return c.eliminatory && typeof note==='number' && note<c.minimum;}).map(c=>c.id);
 const incomplete=assessed.length!==criteria.length;
 return {score,coverage:totalWeight?100*assessedWeight/totalWeight:0,assessed:assessed.length,total:criteria.length,belowMinimum,
 indication:incomplete?'À compléter':belowMinimum.length?'Minimum à examiner':score!>=session.scorecard.globalThreshold?'Seuil atteint':'Sous le seuil'};
}

export function recordDecision(session:AssessmentSession,value:NonNullable<AssessmentSession['decision']>['value'],justification:string){
 if(value==='À décider'||!justification.trim())throw new Error('Choisissez une décision et renseignez sa justification.');
 if(session.scorecard.criteria.some(c=>session.entries[c.id].note!==null&&!session.entries[c.id].evidence.trim()))throw new Error('Une note est dépourvue de preuve.');
 const now=new Date().toISOString();const totals=assessmentTotals(session);
 const next=structuredClone(session);next.updatedAt=now;next.decision={value,justification,author:next.evaluator,date:now};
 next.completedAt=totals.assessed===totals.total?now:null;next.reportValidatedAt=null;
 next.audit=[...next.audit,{date:now,actor:next.evaluator,event:`Décision humaine : ${value}${totals.assessed<totals.total?' ; évaluation incomplète':''}`}].slice(-1000);
 return assessmentSchema.parse(next);
}

export function scorecardSignature(session:AssessmentSession){return JSON.stringify({role:session.roleTitle,brief:session.scorecard.sourceBriefSnapshot,level:session.scorecard.level,threshold:session.scorecard.globalThreshold,criteria:session.scorecard.criteria});}
export function comparableSessions(session:AssessmentSession,all:AssessmentSession[]){return all.filter(s=>scorecardSignature(s)===scorecardSignature(session));}
export function assessmentReport(session:AssessmentSession){
 const t=assessmentTotals(session);
 return [
  {title:'Contexte et couverture',body:`Référence : ${session.reference}\nPoste : ${session.roleTitle}\nÉvaluateur : ${session.evaluator}\nEntretien : ${formatInterviewDate(interviewDate(session))}${session.interviewAt?'':' (date de création, à confirmer)'}\nGrille figée le ${session.createdAt}\nType : ${session.scorecard.level} ; version ${session.scorecard.metadata.scorecardVersion}\nScore indicatif : ${t.score===null?'Non évalué':t.score.toFixed(1)+' %'} ; couverture ${t.coverage.toFixed(0)} % (${t.assessed}/${t.total})\n${t.indication}`},
  ...session.scorecard.criteria.map(c=>({title:c.criterion,body:`Note humaine : ${session.entries[c.id].note??'NE'} / 3 ; coefficient ${c.coefficient}${c.eliminatory?` ; minimum ${c.minimum}`:''}\nPreuves : ${session.entries[c.id].evidence||'Non renseignées'}\nÉcarts et réserves : ${session.entries[c.id].comment||'Non renseignés'}`})),
  {title:'Décision humaine',body:session.decision?`${session.decision.value}\n${session.decision.justification}\nAuteur : ${session.decision.author} ; date : ${session.decision.date}`:'À décider. Aucune décision humaine enregistrée.'},
  {title:session.reportValidatedAt?'Synthèse validée':'Synthèse en brouillon',body:session.reportText||'Aucune synthèse rédigée.'},
 ];
}

export function assessedScorecard(session:AssessmentSession):ScorecardData{return {...session.scorecard,criteria:session.scorecard.criteria.map(c=>({...c,note:session.entries[c.id].note,comment:[session.entries[c.id].evidence,session.entries[c.id].comment].filter(Boolean).join('\n\n')}))};}
export function guideRows(session:AssessmentSession){return session.scorecard.criteria.map((c:ScorecardCriterion)=>({id:c.id,criterion:c.criterion,questions:[c.mainQuestion,c.transferQuestion].filter(Boolean),followUps:c.followUps,evidence:c.expectedEvidence,anchors:[c.anchor0,c.anchor1,c.anchor2,c.anchor3]}));}
