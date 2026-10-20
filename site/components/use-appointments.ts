'use client';
import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {appointmentRecordSchema,createAppointment,appointmentExpiry,type AppointmentRecord,type Appointment} from '@/lib/appointments';
export function useAppointments(){
 const [,setClock]=useState(0);useEffect(()=>{const timer=window.setInterval(()=>setClock(n=>n+1),60000);return()=>window.clearInterval(timer);},[]);
 const [records,setRecords]=useState<AppointmentRecord[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);const locked=useRef(false),latest=useRef(records);latest.current=records;
 useEffect(()=>{let cancelled=false;void(async()=>{try{const response=await fetch('/api/appointments',{cache:'no-store'});const body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error||'Agenda indisponible.');const data=z.object({records:z.array(appointmentRecordSchema)}).parse(body);if(!cancelled){setRecords(data.records);setReady(true);}}catch(e){if(!cancelled)setError((e as Error).message);}})();return()=>{cancelled=true;};},[]);
 async function put(appointment:Appointment,expectedRevision:number){if(locked.current)throw new Error('Un entretien est déjà en cours d’enregistrement.');locked.current=true;setBusy(true);try{const response=await fetch('/api/appointments',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({appointment,expectedRevision})});const body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error||'Enregistrement impossible.');const record=appointmentRecordSchema.parse(body);setRecords(all=>[record,...all.filter(r=>r.appointment.id!==record.appointment.id)]);setError('');window.dispatchEvent(new Event('recruitment:data'));return record;}catch(e){setError((e as Error).message);throw e;}finally{locked.current=false;setBusy(false);}}
 const add=(jobId:string,initials:string,interviewAt:string,application?:{id:string;reference:string})=>put({...createAppointment(jobId,initials,interviewAt),...(application?{applicationId:application.id,reference:application.reference}:{})},0);
 function outcome(id:string,outcome:Appointment['outcome']){const record=latest.current.find(r=>r.appointment.id===id);if(!record)throw new Error('Entretien introuvable.');return put({...record.appointment,outcome},record.revision);}
 return{appointments:records.map(r=>r.appointment).filter(a=>appointmentExpiry(a)>Date.now()),ready,error,busy,add,outcome};
}
