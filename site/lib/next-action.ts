import type {RecruitmentJob} from './jobs';
import type {AssessmentSession} from './assessment';
import {isScorecardCurrent} from './need-state';
export function nextJobAction(job:RecruitmentJob,sessions:AssessmentSession[]=[]):{label:string;module:'m1'|'m2'|'m3'|'m4'|'m5'|'m6'|'candidates';view?:'brief'|'offer';sessionId?:string}{
 const w=job.workspace;
 if(!w.brief.missions.trim())return{label:'Compléter le besoin',module:'m1',view:'brief'};
 const pending=sessions.filter(s=>s.jobId===job.id);
 const report=pending.find(s=>s.decision&&!s.reportValidatedAt);if(report)return{label:'Terminer le compte rendu',module:'m6',sessionId:report.id};
 const incomplete=pending.find(s=>!s.decision);if(incomplete)return{label:'Terminer une évaluation',module:'m5',sessionId:incomplete.id};
 if(!w.jobAd.length)return{label:'Préparer l’offre',module:'m1',view:'offer'};
 if(!w.scorecard||!isScorecardCurrent(w.scorecard,w.brief,w.level,w.aiRuns.scorecard?.briefSnapshot))return{label:'Préparer la scorecard',module:'m2'};
 if(!w.sourcingSelected.length)return{label:'Préparer le sourcing',module:'m3'};
 return{label:'Suivre les candidatures',module:'candidates'};
}
