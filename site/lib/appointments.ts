import {randomId} from './random-id';
import {z} from 'zod';
import {initialsSchema,parseInitialsInput,RETENTION_MS,type AssessmentSession} from './assessment';
export const appointmentSchema=z.object({id:z.string().uuid(),jobId:z.string().uuid(),applicationId:z.string().uuid().optional(),reference:initialsSchema,interviewAt:z.string().datetime(),outcome:z.enum(['À décider','Go','No Go']),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),outcomeAt:z.string().datetime().nullable(),outcomeBy:z.string().max(200).nullable()}).strict();
export type Appointment=z.infer<typeof appointmentSchema>;
export const appointmentRecordSchema=z.object({appointment:appointmentSchema,revision:z.number().int().positive()});
export type AppointmentRecord=z.infer<typeof appointmentRecordSchema>;
export function createAppointment(jobId:string,initials:string,interviewAt:string){const prefix=parseInitialsInput(initials,'candidat').split('-')[0];const now=new Date().toISOString();return appointmentSchema.parse({id:randomId(),jobId,reference:`${prefix}-${randomId().replaceAll('-','').slice(0,6).toUpperCase()}`,interviewAt,outcome:'À décider',createdAt:now,updatedAt:now,outcomeAt:null,outcomeBy:null});}
export const appointmentExpiry=(a:Appointment)=>Date.parse(a.interviewAt)+RETENTION_MS;
export function parisDay(date:Date){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function upcomingInterviews(appointments:Appointment[],now=new Date()){
 const today=parisDay(now);const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+3);const last=parisDay(d);
 return appointments.filter(a=>{const day=parisDay(new Date(a.interviewAt));return day>=today&&day<=last;}).sort((a,b)=>a.interviewAt.localeCompare(b.interviewAt));
}
export function interviewsPerJob(jobId:string,appointments:Appointment[],sessions:AssessmentSession[]){const ids=new Set(appointments.filter(a=>a.jobId===jobId).map(a=>a.id));return ids.size+sessions.filter(s=>s.jobId===jobId&&(!s.appointmentId||!ids.has(s.appointmentId))).length;}
