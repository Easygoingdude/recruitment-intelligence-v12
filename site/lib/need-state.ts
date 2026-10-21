import { emptyBrief, type BriefData, type ScorecardData, type JobLevel } from './recruitment-engine';
export type ImportedField = { key: keyof BriefData; value: string; excerpt: string };
export function applyImportedNeed(current: BriefData, provenance: Partial<Record<keyof BriefData,string>>, fields: ImportedField[], newNeed: boolean) {
 const accepted=fields.filter(item=>Object.hasOwn(emptyBrief,item.key) && (newNeed || provenance[item.key]!=='Validé'));
 const brief={...(newNeed?emptyBrief:current),...Object.fromEntries(accepted.map(item=>[item.key,item.value]))};
 return {brief,fields:accepted};
}
export function matchesNeed(snapshot: string | undefined, brief: BriefData) {
 if(!snapshot)return false;
 try {
   const parsed=JSON.parse(snapshot);
   if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))return false;
   return (Object.keys(emptyBrief) as (keyof BriefData)[]).every(key=>(parsed[key]??'')===brief[key]);
 }catch{return false;}
}

export function isScorecardCurrent(scorecard: ScorecardData | null, brief: BriefData, level: JobLevel, fallbackSnapshot?: string): boolean {
 return !!scorecard && scorecard.level===level && matchesNeed(scorecard.sourceBriefSnapshot??fallbackSnapshot,brief);
}

export function scorecardExportContext(scorecard:ScorecardData, brief:BriefData, level:JobLevel, threshold:number, fallbackSnapshot?:string) {
 const current=isScorecardCurrent(scorecard,brief,level,fallbackSnapshot);
 let sourceBrief:BriefData={...emptyBrief,roleTitle:'Grille non rattachée'};
 const snapshot=scorecard.sourceBriefSnapshot??fallbackSnapshot;
 if(snapshot){
  try{
   const parsed=JSON.parse(snapshot);
   if(parsed && typeof parsed==='object' && !Array.isArray(parsed)){
    for(const key of Object.keys(emptyBrief) as (keyof BriefData)[])if(typeof parsed[key]==='string')sourceBrief[key]=parsed[key];
   }
  }catch{/* Unknown provenance: never label an old grid with the new role. */}
 }
 return {brief:current?brief:sourceBrief,scorecard:{...scorecard,globalThreshold:current?threshold:scorecard.globalThreshold},archived:!current};
}
