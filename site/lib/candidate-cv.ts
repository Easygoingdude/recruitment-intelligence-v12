import { candidateInitials, prepareCandidateForModel } from './candidate-privacy';

export function pseudonymiseCv(text:string,candidateName:string,reference:string){
 if(candidateInitials(candidateName)!==reference.split('-')[0])throw new Error('Le nom saisi ne correspond pas aux initiales de cet entretien.');
 if(!text.trim())throw new Error('Aucun texte détecté. Utilisez un CV avec du texte sélectionnable.');
 if(text.length>40000)throw new Error('Le CV dépasse 40 000 caractères.');
 return prepareCandidateForModel({content:text,candidateName,candidateReference:reference}).content;
}
export async function extractCvText(file:File){
 if(file.size>10*1024*1024)throw new Error('Le CV dépasse 10 Mo.');
 const extension=file.name.split('.').pop()?.toLowerCase();
 if(extension==='txt')return file.text();
 if(extension==='docx'){const module=await import('mammoth');return (await (module.default??module).extractRawText({arrayBuffer:await file.arrayBuffer()})).value;}
 if(extension==='pdf'){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});const pdf=await task.promise;
  try{if(pdf.numPages>20)throw new Error('Le CV dépasse 20 pages.');const pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();pages.push(content.items.map(item=>'str' in item?item.str:'').join(' '));}return pages.join('\n');}finally{await task.destroy?.();}
 }
 throw new Error('Utilisez un PDF, DOCX ou TXT.');
}
