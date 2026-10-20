import type { ScorecardCriterion } from './recruitment-engine';

export const SCORECARD_QUESTION_RULES = `Questions d’entretien contextualisées :
Pour chaque critère, générer exactement deux questions distinctes, une principale et une alternative de preuve : mainQuestion évalue la compétence nécessaire à une activité du poste à partir d’un exemple concret ; transferQuestion demande une autre expérience mobilisant le même savoir-faire dans un autre outil, secteur ou contexte, et son application à cette activité cible. La deuxième question doit pouvoir être posée seule, même sans réponse à la première : nommer l’activité et le savoir-faire évalué, ne pas écrire seulement « dans votre exemple ». Accepter un stage, projet d’études, personnel ou associatif pour Jeune diplômé. La transférabilité est une deuxième voie de preuve, jamais une seconde compétence à noter ni une expérience obligatoire : une seule note par critère, sans double pénalisation.
Chaque question doit se suffire à elle-même, sans lecture du brief : nommer une activité, un incident, un livrable ou un arbitrage concret relié au critère ET aux faits du poste. Demander un exemple réellement vécu dans un environnement comparable ; le candidat décrit son propre contexte, il n’est pas supposé connaître l’organisation interne du futur employeur.
Éviter les formulations vagues « dans un autre contexte » ou « dans un autre environnement » dans le texte des questions : nommer une activité concrète. Deux phrases courtes au maximum : une situation de référence compréhensible, puis une demande centrée sur ses actions. Éviter les questions abstraites (« Comment pilotez-vous la qualité ? », « Décrivez votre leadership »), les mots vagues seuls (« complexe », « chargé », « efficace ») et « démontrez [compétence] ». Ne pas empiler contexte, actions, résultats et recul dans la question principale.
Ne pas inventer une panne, un outil, un effectif, un SLA ou un objectif du poste. Si un détail du brief manque, utiliser une activité effectivement connue et inviter le candidat à préciser les éléments de son exemple ; signaler dans warnings ce qui reste à cadrer. Aucun cas hypothétique flou ou piège théorique. Pour un profil débutant sans occasion passée, accepter un exercice concret clairement distingué d’une expérience vécue. Accepter un exemple de périmètre différent et faire préciser sa transférabilité.
followUps : trois ou quatre questions sur des lignes séparées, propres au critère : périmètre et difficulté de départ ; rôle personnel et étapes/décisions ; résultat observable et vérification ; éventuellement limite ou recul. Demander un seul élément à la fois. Ne pas répéter partout les mêmes relances STAR.
Exemples de niveau de précision, uniquement si le brief justifie l’activité :
Support : « Pensez à un incident utilisateur que vous n’avez pas résolu au premier diagnostic. Quels contrôles avez-vous réalisés avant de le résoudre ou de l’escalader ? » Relances : « Quel était le symptôme de départ ? », « Pourquoi avez-vous choisi ce niveau d’escalade ? », « Comment avez-vous confirmé la résolution avec l’utilisateur ? »
Développement : « Choisissez une modification que vous avez apportée à une application existante. Comment avez-vous repéré le code à modifier et limité les risques de régression ? »
Management : « Racontez une période où les demandes dépassaient la capacité disponible de votre équipe. Comment avez-vous décidé de la répartition du travail ? »
Contrôler silencieusement chaque question avant de répondre : la situation est-elle identifiable, la demande claire et la réponse possible sans connaître le futur employeur ? Corriger dans cette même génération, sans appel supplémentaire.`;

export function reviewScorecardQuestions(criteria: Pick<ScorecardCriterion, 'criterion' | 'mainQuestion' | 'followUps'>[]): string[] {
  const vague = /(?:démontrer|mobiliser)\s+(?:votre|vos|la|le|les)|comment\s+(?:gérez|pilotez|assurez|organisez|améliorez)[- ]vous\s+(?:la qualité|votre équipe|le support|la communication)\s*\?/i;
  return criteria.flatMap(item => {
    const warnings: string[] = [];
    if (vague.test(item.mainQuestion) || item.mainQuestion.trim().length < 45) warnings.push(`Question à contextualiser pour « ${item.criterion} » : préciser une activité ou une situation vécue et l’action à expliquer.`);
    if (item.followUps.split(/\n/).filter(line => line.trim()).length < 3) warnings.push(`Relances à compléter pour « ${item.criterion} » : préciser le périmètre, les actions personnelles et la vérification du résultat.`);
    return warnings;
  });
}

/** Both primary questions occupy the existing question column in Excel. */
export function scorecardPrimaryQuestions(item: Pick<ScorecardCriterion, 'mainQuestion' | 'transferQuestion'>): string {
  return item.transferQuestion?.trim()
    ? `1. Compétence nécessaire :\n${item.mainQuestion}\n\n2. Compétence transférable (question alternative si utile) :\n${item.transferQuestion}`
    : item.mainQuestion;
}
