import type { AISourcingAxisInput, AISourcingPlan } from './ai-contract';
import type { BriefData } from './recruitment-engine';
import { normaliseSearchTerms } from './sourcing-queries';

export function requiresManagementAnchor(brief:BriefData):boolean {
 const title=brief.roleTitle.normalize('NFKC');
 return /(?:responsable|manager|chef|head|lead|directeur).*(?:support|helpdesk|service desk)|(?:support|helpdesk|service desk).*(?:manager|head|lead|responsable)/i.test(title)
   || /(?:encadr|manag|supervis|dirig)[\p{L}]*.{0,60}(?:équipe|equipe|collaborateurs|techniciens|team)/iu.test(brief.missions+' '+brief.team);
}
export function isResponsibilityTerm(term:string):boolean {
 return /\b(?:responsable|manager|head|lead|leader|chef|superviseur|supervisor|directeur|director)\b|(?:encadrement|management|pilotage|coordination) d[’']?(?:une |l[’']?)?équipe|team (?:management|supervision)/i.test(term);
}

export const SOURCING_AI_RULES=`Optimise une stratégie de sourcing à partir du travail réel décrit dans le brief, des axes choisis et, si présents, des résultats de recherche rapportés par le recruteur.
Retourne une proposition structurée, pas des booléens ni neuf répétitions : le code rendra neuf sets progressifs pour HelloWork, Apec, Monster, LinkedIn Recruiter et Google X-ray.
Conserve exactement les axes verrouillés et leurs termes. Pour les axes non verrouillés, conserve leurs noms et nombre, sauf si cela empêche de couvrir une responsabilité d’encadrement explicitement attendue : dans ce cas, remplace un axe technique non verrouillé par un axe de responsabilité et explique cet arbitrage dans warnings, sans dépasser trois axes. Sinon, propose un à trois axes professionnels réellement discriminants et justifiés par le brief. Ne transforme pas toute la scorecard en filtre.
Pour chaque axe : exactTerms = vocabulaire probable dans les CV, intitulés FR/EN et variantes lexicales fidèles ; adjacentTerms = outils ou environnements voisins ; transferableTerms = savoir-faire sous-jacents utiles aux missions, pas des qualités vagues. Deux à six termes courts par liste, dans l’ordre de pertinence. Les listes peuvent être vides si aucun terme défendable n’existe. Aucun opérateur ni phrase d’évaluation dans les termes. Écarte les termes génériques qui créent du bruit.
Explique en une phrase le lien de transfert (reason) et précise ce qu’il faudra vérifier : expérience réelle, niveau, écarts techniques et apprentissage nécessaire (verify). Ne traite jamais Fortinet comme une preuve de maîtrise Palo Alto, Entra ID comme AD, Java comme C# ni un intitulé comme une preuve de management.
Un axe locked conserve strictement ses exactTerms et ne peut pas être assoupli. Ne retire pas une contrainte non négociable du brief ; signale les arbitrages qui nécessitent l’accord du manager. Une pénurie supposée n’autorise pas à inventer des compétences équivalentes.
Fonde chaque axe sur un à trois extraits courts copiés exactement du champ cité du brief. requestedCriteria désigne les critères explicitement demandés. Les passerelles sont des hypothèses métier, pas des faits sur des candidats ou sur le marché actuel.
Le niveau de responsabilité est distinct des compétences techniques : pour un Responsable Support chargé d’encadrer une équipe, un bon technicien ne constitue pas à lui seul la cible. Réserve un des trois axes aux responsabilités d’encadrement et conserve-le dans TOUS les niveaux. exactTerms de cet axe : intitulés FR/EN de responsables ou d’encadrement du support (exemples seulement si justifiés : responsable support informatique, service desk manager, helpdesk manager, team lead support). Chaque terme de cet axe doit exprimer une responsabilité. N’y place jamais technicien support, helpdesk technician, desktop support, IT support ou support engineer seuls. Les deux autres axes décrivent le domaine support IT et le pilotage du service, sans imposer chaque outil d’exécution. Les intitulés restent des indices de recherche, pas une preuve de management. Un parcours de technicien devenu responsable reste recevable : ne produis pas NOT technicien.
Si l’entrée contient managementRequired=true, un axe de responsabilité explicite est obligatoire ; si trois axes sont verrouillés et ne le couvrent pas, signale l’incompatibilité plutôt que de les déverrouiller. Ce niveau sera protégé par le code dans les neuf requêtes. Les compétences transférables élargissent les contextes, les outils et les parcours sans supprimer l’encadrement attendu. Ne confonds pas support commercial ou SAV non IT avec support informatique : le domaine IT reste à qualifier.
Adapte le vocabulaire au contexte métier et au niveau du poste. Si le recruteur rapporte trop de bruit, propose des termes plus discriminants ; s’il rapporte peu de résultats, privilégie les passerelles défendables. Ne promets pas un volume ou un gain de performance sans recherche observée. Ne produis aucun nom de personne, lieu imposé, diplôme, exclusion ou seuil d’ancienneté absent du brief. Signale les informations manquantes dans warnings. Ne lance aucune recherche et ne prétends pas avoir mesuré les CVthèques.`;

export function validateSourcingPlan(plan:AISourcingPlan,brief:BriefData,requestedCriteria:string[],axes:AISourcingAxisInput[]):AISourcingPlan {
  if(!plan.axes.length || plan.axes.length>3 || new Set(plan.axes.map(a=>a.name)).size!==plan.axes.length) throw new Error('La stratégie doit proposer un à trois axes distincts.');
  const managementRequired=requiresManagementAnchor(brief);
  const retainedAxes=managementRequired?axes.filter(a=>a.locked):axes;
  if((!managementRequired && axes.length && plan.axes.length!==axes.length) || retainedAxes.some(a=>!plan.axes.some(p=>p.name===a.name))) throw new Error('Les axes choisis ne doivent pas être remplacés ou retirés.');
  const responsibilityAxis=managementRequired?plan.axes.find(axis=>{const input=axes.find(a=>a.name===axis.name);const terms=normaliseSearchTerms(input?.locked?input.exactTerms:axis.exactTerms);return terms.length>0 && terms.every(isResponsibilityTerm);}):undefined;
  if(managementRequired && !responsibilityAxis)throw new Error('Le besoin exige un encadrement : ajouter un axe de responsabilité explicite. Des termes de technicien seuls ne peuvent pas remplacer un Responsable Support.');
  return {...plan,axes:plan.axes.map(axis=>{
    if(!axis.name.trim() || !axis.reason.trim() || !axis.verify.trim() || !normaliseSearchTerms(axis.exactTerms).length) throw new Error('Chaque axe doit contenir un nom, des termes exacts, une justification et une vérification.');
    if(!axis.evidence.length || axis.evidence.some(item=>!item.excerpt.trim() || !(item.field==='requestedCriteria'?requestedCriteria.join('\n'):brief[item.field]).includes(item.excerpt))) throw new Error('Un axe ne possède pas de source vérifiable dans le brief ou les critères demandés.');
    const input=axes.find(a=>a.name===axis.name);
    if(axis===responsibilityAxis){
      const terms=normaliseSearchTerms(input?.locked?input.exactTerms:axis.exactTerms);
      if(!terms.every(isResponsibilityTerm))throw new Error('L’axe verrouillé ne garantit pas le niveau d’encadrement attendu.');
      return {...axis,exactTerms:terms,adjacentTerms:[],transferableTerms:[],locked:true};
    }
    return {...axis,exactTerms:normaliseSearchTerms(input?.locked?input.exactTerms:axis.exactTerms),adjacentTerms:normaliseSearchTerms(input?.locked?[]:axis.adjacentTerms),transferableTerms:normaliseSearchTerms(input?.locked?[]:axis.transferableTerms),locked:input?.locked===true};
  })};
}
