import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { JobAdSection } from './recruitment-engine';

export async function buildOfferPdf(title: string, sections: JobAdSection[], regular: Uint8Array, bold: Uint8Array): Promise<Uint8Array> {
 if(!sections.length || !sections.some(s=>s.body.trim()))throw new Error('Générez une offre avant de l’exporter.');
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(regular,{subset:true});const heading=await doc.embedFont(bold,{subset:true});
 doc.setTitle(title||'Offre d’emploi');doc.setLanguage('fr-FR');doc.setCreator('Recruitment Intelligence');
 const width=595.28,height=841.89,margin=48,bottom=54,maxWidth=width-2*margin;
 let page=doc.addPage([width,height]);let y=height-margin;
 const next=()=>{page=doc.addPage([width,height]);y=height-margin;};
 const lines=(text:string,f:PDFFont,size:number)=>{
  const result:string[]=[];
  for(const paragraph of text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n')){
   if(!paragraph.trim()){result.push('');continue;}
   let line='';
   for(const word of paragraph.trim().split(/\s+/)){
    if(line && f.widthOfTextAtSize(line+' '+word,size)>maxWidth){result.push(line);line='';}
    if(f.widthOfTextAtSize(word,size)>maxWidth){
     if(line){result.push(line);line='';}
     for(const char of word){if(line && f.widthOfTextAtSize(line+char,size)>maxWidth){result.push(line);line='';}line+=char;}
    }else line+=(line?' ':'')+word;
   }
   if(line)result.push(line);
  }
  return result;
 };
 const draw=(text:string,f:PDFFont,size:number,leading:number)=>{
  for(const line of lines(text,f,size)){
   if(y-leading<bottom)next();
   if(line)page.drawText(line,{x:margin,y:y-size,font:f,size,color:rgb(.12,.16,.22)});
   y-=leading;
  }
 };
 draw(title||'Offre d’emploi',heading,21,28);y-=14;
 for(const section of sections){
  if(!section.body.trim())continue;
  const headingLines=lines(section.title,heading,12.5).length;
  const sectionHeight=headingLines*18+7+lines(section.body,font,10.5).length*16+17;
  // Keep short sections together; long sections flow across pages.
  if((sectionHeight<(height-margin-bottom)/2 && y-sectionHeight<bottom) || y-(headingLines*18+34)<bottom)next();
  draw(section.title,heading,12.5,18);y-=7;
  draw(section.body,font,10.5,16);y-=17;
 }
 const pages=doc.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:width-margin-35,y:28,font,size:8,color:rgb(.4,.45,.5)}));
 return doc.save();
}
