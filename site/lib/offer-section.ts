import type {JobAdSection} from './recruitment-engine';
/** Apply only the reviewed section, preserving every other edit byte for byte. */
export function applyOfferSection(sections:JobAdSection[],proposal:JobAdSection,basisBody:string){
 const original=sections.find(s=>s.id===proposal.id);if(!original)throw new Error('La section proposée ne correspond pas à cette offre.');
 if(original.body!==basisBody)throw new Error('Cette section a été modifiée depuis la proposition. Conservez vos corrections ou relancez la reformulation.');
 return sections.map(s=>s.id===proposal.id?{...s,body:proposal.body,source:proposal.source}:s);
}
