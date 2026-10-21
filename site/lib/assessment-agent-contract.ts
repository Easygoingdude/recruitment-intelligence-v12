import { z } from 'zod';
import { initialsSchema, type AgentTask, type AssessmentSession } from './assessment';

export const ASSESSMENT_HARNESS_VERSION='RI_ASSESSMENT_HARNESS_1_0';
export const MAX_AGENT_INPUT_CHARACTERS=24000;
const agentCriterion=z.object({id:z.string().min(1).max(100),criterion:z.string().max(300),definition:z.string().max(1000),anchors:z.array(z.string().max(800)).length(4),question:z.string().max(1500),transferQuestion:z.string().max(1500),evidence:z.string().max(3000),comment:z.string().max(1500),note:z.number().int().min(0).max(3).nullable(),coefficient:z.union([z.literal(1),z.literal(2),z.literal(3)]),minimum:z.number().int().min(0).max(3),eliminatory:z.boolean()}).strict();
export const assessmentAgentInputSchema=z.object({
 task:z.enum(['interview','evaluate','report']),candidateReference:initialsSchema,roleTitle:z.string().min(1).max(300),
 criteria:z.array(agentCriterion).min(1).max(8),privacyReviewed:z.literal(true),
 humanDecision:z.object({value:z.enum(['Poursuivre','À approfondir','Ne pas poursuivre','À décider']),justification:z.string().max(3000)}).strict().nullable(),
 modelPreference:z.enum(['auto','luna','sol']).default('auto'),
}).strict().superRefine((input,ctx)=>{
 if(new Set(input.criteria.map(c=>c.id)).size!==input.criteria.length)ctx.addIssue({code:'custom',message:'Critères dupliqués.'});
 if(input.task==='interview'&&input.criteria.length!==1)ctx.addIssue({code:'custom',message:'Sélectionnez un seul critère pour les relances.'});
 if(input.task!=='interview'&&!input.criteria.some(c=>c.evidence.trim()))ctx.addIssue({code:'custom',message:'Consignez des preuves avant une analyse ou un rapport IA.'});
 if(input.criteria.some(c=>c.note!==null&&!c.evidence.trim()))ctx.addIssue({code:'custom',message:'Une note humaine nécessite une preuve.'});
});
export type AssessmentAgentInput=z.infer<typeof assessmentAgentInputSchema>;

export function buildAgentInput(session:AssessmentSession,task:AgentTask,criterionId?:string,modelPreference:'auto'|'luna'|'sol'='auto'):AssessmentAgentInput{
 const selected=task==='interview'?session.scorecard.criteria.filter(c=>c.id===criterionId):session.scorecard.criteria;
 const parsed=assessmentAgentInputSchema.safeParse({task,candidateReference:session.reference,roleTitle:session.roleTitle||'Poste à préciser',privacyReviewed:true,modelPreference,
 criteria:selected.map(c=>({id:c.id,criterion:c.criterion,definition:c.definition,anchors:[c.anchor0,c.anchor1,c.anchor2,c.anchor3],question:c.mainQuestion,transferQuestion:c.transferQuestion??'',...session.entries[c.id],coefficient:c.coefficient,minimum:c.minimum,eliminatory:c.eliminatory})),humanDecision:task!=='interview'&&session.decision?{value:session.decision.value,justification:session.decision.justification}:null});
 if(!parsed.success)throw new Error('L’agent accepte jusqu’à 8 critères, 3 000 caractères de preuves et 1 500 caractères de réserves par critère. Consignez au moins une preuve pour M5 et M6. Les données complètes restent enregistrées.');
 return parsed.data;
}
export function agentFingerprint(input:AssessmentAgentInput){
 const value=JSON.stringify({version:ASSESSMENT_HARNESS_VERSION,...input});
 let a=2166136261,b=5381;for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i);}
 return `${(a>>>0).toString(16)}${(b>>>0).toString(16)}`;
}
