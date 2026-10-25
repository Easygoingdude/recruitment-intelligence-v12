import type {JobAdSection} from './recruitment-engine';

export function countOfferWords(sections:Pick<JobAdSection,'title'|'body'>[]):number {
 const content=sections.map(section=>section.title+' '+section.body).join(' ').trim();
 return content ? content.split(/\s+/u).filter(Boolean).length : 0;
}
export function isConciseOfferValid(sections:Pick<JobAdSection,'title'|'body'>[]):boolean {
 return countOfferWords(sections)<500;
}
