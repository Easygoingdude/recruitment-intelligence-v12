import type { ScorecardCriterion } from './recruitment-engine';
export const SCORECARD_PROFILES=['Standard','Jeune diplômé','Expérience transférable'] as const; // Legacy API values accepted, never offered as a separate choice.
export type ScorecardProfile=typeof SCORECARD_PROFILES[number];
export const SCORECARD_DIMENSIONS=['Compétences métier','Comportements et apprentissage','Motivation professionnelle'] as const;
export type ScorecardDimension=typeof SCORECARD_DIMENSIONS[number];

export function scorecardProfileRules(profile:ScorecardProfile):string {
  return `Profil de préparation : ${profile}. Ce choix concerne la grille du poste, jamais l’âge déduit d’un candidat. Les critères et ancrages sont fixés avant les entretiens et communs aux personnes comparées.
Pour chaque critère, la question principale doit autoriser explicitement un exemple issu d’un autre outil, secteur ou contexte, avec une formule naturelle adaptée à l’activité. Ne suppose pas une expérience du même environnement. Renseigne transferQuestion : la deuxième question principale, autonome et contextualisée, sur une expérience dans un autre environnement mobilisant le même savoir-faire pour cette activité cible. Ne pas la réduire à une relance sur la première réponse. Cette deuxième question sera intégrée directement aux questions, pour TOUS les types de scorecard, sans mode particulier à activer.
Pour chaque critère, renseigne dimension, transferableEvidence (une preuve recevable dans un autre environnement) et learningCheck (une vérification concrète de l’écart restant, sans supposer son acquisition). Une phrase courte pour chacun de ces deux champs.
Évaluer les actions, la difficulté et l’autonomie pertinentes pour la mission, pas le nombre d’années, la marque de l’outil, le prestige de l’école ou la similarité du secteur. Un exemple transférable peut atteindre 2 ou 3 s’il démontre le même niveau de compétence. Ne plafonne pas sa note par principe. Pour une expertise précise indispensable explicitement requise, sépare le savoir-faire sous-jacent de la maîtrise de cet outil et propose une vérification distincte ; ne considère pas des technologies voisines comme équivalentes.
Absence d’occasion de démontrer = NE, pas 0. Réponse non démontrée après une question adaptée et une vérification = 0 possible. Un exercice ou une mise en situation est une preuve d’exercice, pas une expérience professionnelle à inventer. Ne note jamais automatiquement un candidat.
Comportements : uniquement actions observables liées au travail, pas diagnostic de personnalité, intuition, aisance orale ou affinité. Motivation : compréhension réaliste des missions et contraintes, intérêt étayé par des démarches concrètes, attentes et apprentissages ; jamais enthousiasme de façade, vie privée, origine ou situation familiale.
${profile==='Jeune diplômé'?`Privilégie les dimensions Comportements et apprentissage et Motivation professionnelle : ensemble elles doivent représenter plus de la moitié du total des coefficients. Inclure au moins un critère de chaque dimension et un socle métier. Propose notamment apprentissage après retour, résolution d’un problème, coopération et motivation pour les activités réelles, seulement si reliés aux missions. Questions accessibles à partir de projets d’études, stages, alternance, projets personnels ou associatifs ; n’exige pas de carrière passée. Ancrage 2 calibré au niveau d’entrée et à l’accompagnement réellement prévu. Ne supprime pas un prérequis indispensable ; si le poste exige une autonomie immédiate incompatible avec ce profil, signale l’arbitrage dans warnings. Une lacune d’information reste à cadrer, pas un accompagnement inventé.`:`Rends explicites les correspondances entre les activités de l’exemple et les missions cibles ; distingue les preuves et les limites du transfert. Aucun bonus ni malus automatique lié au parcours.`}`;
}

export function scorecardWeights(criteria:ScorecardCriterion[]) {
  return SCORECARD_DIMENSIONS.map(dimension=>({dimension,weight:criteria.filter(c=>(c.dimension??(c.type==='Hard skill'?'Compétences métier':'Comportements et apprentissage'))===dimension).reduce((sum,c)=>sum+c.coefficient,0)}));
}

export function reviewScorecardProfile(criteria:ScorecardCriterion[],profile:ScorecardProfile):string[]{
  if(profile!=='Jeune diplômé')return [];
  const weight=(dimension:ScorecardDimension)=>scorecardWeights(criteria).find(item=>item.dimension===dimension)!.weight;
  const behaviour=weight('Comportements et apprentissage'),motivation=weight('Motivation professionnelle'),technical=weight('Compétences métier');
  const warnings:string[]=[];
  if(!behaviour || !motivation || !technical)warnings.push('Profil Jeune diplômé : compléter les trois dimensions, dont comportements/apprentissage et motivation professionnelle.');
  if(behaviour+motivation<=technical)warnings.push('Profil Jeune diplômé : revoir la pondération ; comportements, apprentissage et motivation doivent représenter plus de la moitié du poids.');
  return warnings;
}
