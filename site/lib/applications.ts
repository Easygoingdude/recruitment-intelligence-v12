import {z} from 'zod';
import {randomId} from './random-id';
import {initialsSchema,parseInitialsInput,RETENTION_MS,type AssessmentSession} from './assessment';
import type {Appointment} from './appointments';
export const applicationStatuses=['En cours','Go','No Go','Poursuivre','À approfondir','Ne pas poursuivre','Embauché'] as const;
export const reopenReasons=['Nouvelle information','Erreur de saisie','Nouvel échange'] as const;
export const applicationSchema=z.object({id:z.string().uuid(),jobId:z.string().uuid(),reference:initialsSchema,status:z.enum(applicationStatuses),source:z.enum(['Suivi','M5','Candidature']),decisionAt:z.string().datetime().nullable(),reopenedAt:z.string().datetime().nullable(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),expiresAt:z.string().datetime(),mergedInto:z.string().uuid().nullable(),audit:z.array(z.object({at:z.string().datetime(),event:z.enum(['Réouverture','Regroupement','Statut']),reason:z.enum(reopenReasons).optional(),author:z.string().max(200)})).max(30)}).strict();
export type RecruitmentApplication=z.infer<typeof applicationSchema>;
export const applicationRecordSchema=z.object({application:applicationSchema,revision:z.number().int().positive()});
export type ApplicationRecord=z.infer<typeof applicationRecordSchema>;
export type ApplicationHistory={jobId:string;month:string;total:number;closed:number;inProgress:number};
export const isClosedApplication=(a:Pick<RecruitmentApplication,'status'>)=>['No Go','Ne pas poursuivre','Embauché'].includes(a.status);
export const isFinalApplication=(a:RecruitmentApplication)=>a.status==='Embauché'||(a.source==='M5'&&a.status==='Ne pas poursuivre');
export function newApplication(jobId:string,initials:string,id=randomId(),now=Date.now()):RecruitmentApplication{const prefix=parseInitialsInput(initials,'candidat').split('-')[0];return applicationSchema.parse({id,jobId,reference:`${prefix}-${randomId().replaceAll('-','').slice(0,6).toUpperCase()}`,status:'En cours',source:'Candidature',decisionAt:null,reopenedAt:null,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+RETENTION_MS).toISOString(),mergedInto:null,audit:[]});}
export function resolveApplication(records:RecruitmentApplication[],id:string|undefined){const map=new Map(records.map(a=>[a.id,a]));let current=id?map.get(id):undefined;const seen=new Set<string>();while(current?.mergedInto){if(seen.has(current.id))return undefined;seen.add(current.id);current=map.get(current.mergedInto);}return current;}
export function sourceApplicationId(s:Appointment|AssessmentSession){return s.applicationId??('outcome' in s?s.id:s.appointmentId??s.id);}
export function applicationSummary(records:RecruitmentApplication[],jobId?:string,now=Date.now()){return records.filter(a=>!a.mergedInto&&Date.parse(a.expiresAt)>now&&(!jobId||a.jobId===jobId)).reduce((t,a)=>({inProgress:t.inProgress+(isClosedApplication(a)?0:1),closed:t.closed+(isClosedApplication(a)?1:0)}),{inProgress:0,closed:0});}
