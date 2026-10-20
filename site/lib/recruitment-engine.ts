import type { ScorecardProfile, ScorecardDimension } from './scorecard-profiles';
import { normaliseSearchTerms, suggestSearchTerms, renderSearchQuery, sourcingPlatformHelp, type SourcingPlatform } from './sourcing-queries';
import { buildSourcingFunnel, type FunnelOverrides, type SourcingFunnel } from './sourcing-funnel';

export type Priority = "indispensable" | "important" | "nice-to-have";
export type TensionLevel = "Faible" | "Modéré" | "Élevé";
export const SCORECARD_LEVELS = ["Opérationnel", "Manager", "Direction", "Jeune diplômé"] as const;
export type JobLevel = typeof SCORECARD_LEVELS[number];

export interface BriefData {
  roleTitle: string;
  recruitmentReason: string;
  consequences: string;
  alternatives: string;
  goals3: string;
  goals6: string;
  goals12: string;
  indicators: string;
  missions: string;
  priorities: string;
  allocation: string;
  tools: string;
  methods: string;
  interactions: string;
  management: string;
  autonomy: string;
  persona: string;
  mustHave: string;
  important: string;
  niceToHave: string;
  softSkills: string;
  difficultSituations: string;
  eliminatory: string;
  assets: string;
  constraints: string;
  salary: string;
  benefits: string;
  location: string;
  remote: string;
  schedule: string;
  mobility: string;
  team: string;
  recruitmentProcess: string;
}

export const emptyBrief: BriefData = {
  roleTitle: "",
  recruitmentReason: "",
  consequences: "",
  alternatives: "",
  goals3: "",
  goals6: "",
  goals12: "",
  indicators: "",
  missions: "",
  priorities: "",
  allocation: "",
  tools: "",
  methods: "",
  interactions: "",
  management: "",
  autonomy: "",
  persona: "",
  mustHave: "",
  important: "",
  niceToHave: "",
  softSkills: "",
  difficultSituations: "",
  eliminatory: "",
  assets: "",
  constraints: "",
  salary: "",
  benefits: "",
  location: "",
  remote: "",
  schedule: "",
  mobility: "",
  team: "",
  recruitmentProcess: "",
};

export interface CompletenessSection {
  id: string;
  label: string;
  complete: boolean;
  missing: string[];
}

export interface TensionFactor {
  id: string;
  label: string;
  detail: string;
  weight: number;
  recommendation: string;
}

export interface NeedAnalysis {
  completeness: number;
  sections: CompletenessSection[];
  tensionLevel: TensionLevel;
  tensionScore: number;
  tensionFactors: TensionFactor[];
  inconsistencies: string[];
  nextActions: string[];
}

export interface JobAdSection {
  id: string;
  title: string;
  body: string;
  source: string;
}

export interface QualityCheck {
  id: string;
  label: string;
  status: "Conforme" | "À compléter" | "Incohérence à corriger";
  evidence: string;
  suggestion: string;
}

export interface ScorecardCriterion {
  dimension?: ScorecardDimension;
  id: string;
  criterion: string;
  type: "Hard skill" | "Soft skill" | "Hybride";
  definition: string;
  coefficient: 1 | 2 | 3;
  eliminatory: boolean;
  minimum: 0 | 1 | 2 | 3;
  mainQuestion: string;
  transferQuestion?: string; // Second main question; optional for saved legacy scorecards.
  followUps: string;
  expectedEvidence: string;
  anchor0: string;
  anchor1: string;
  anchor2: string;
  anchor3: string;
  note: number | null;
  comment: string;
}

export interface ScorecardData {
  sourceBriefSnapshot?: string;
  profile?: ScorecardProfile;
  level: JobLevel;
  method: "SAR" | "STAR" | "SOAR enrichi";
  scale: "0–3";
  duration: string;
  globalThreshold: number;
  criteria: ScorecardCriterion[];
  metadata: {
    schemaVersion: "1.0";
    templateId: "SCORECARD_STANDARD";
    templateVersion: "1.0";
    rendererVersion: "1.0";
    scorecardVersion: number;
    layoutContractId: "SCORECARD_STANDARD_1_0";
  };
}

export interface SourcingCriterion {
  name: string;
  synonyms: string[];
  enabled: boolean;
  reason: string;
}

export interface SourcingStrategy {
  funnel: SourcingFunnel;
  selected: SourcingCriterion[];
  excluded: string[];
  queries: {
    large: string;
    balanced: string;
    targeted: string;
  };
  explanation: string[];
  queryAxes: Record<'large' | 'balanced' | 'targeted', string[]>;
  warnings: string[];
  platforms: Record<SourcingPlatform, { label: string; field: string; instructions: string; queries: Record<'large' | 'balanced' | 'targeted', string> }>;
}

export function splitItems(value: string): string[] {
  return value
    .split(/\n|;|•|\u2022/g)
    .map((item) => item.replace(/^[-–—]\s*/, "").trim())
    .filter(Boolean);
}

function isFilled(value: string): boolean {
  return value.trim().length >= 3;
}

function section(
  id: string,
  label: string,
  fields: Array<[string, string]>,
  mode: "all" | "some" = "all",
): CompletenessSection {
  const valid = fields.filter(([, value]) => isFilled(value));
  const complete = mode === "all" ? valid.length === fields.length : valid.length > 0;
  return {
    id,
    label,
    complete,
    missing: fields.filter(([, value]) => !isFilled(value)).map(([name]) => name),
  };
}

export function analyzeBrief(brief: BriefData): NeedAnalysis {
  const sections = [
    section("context", "Contexte et besoin", [
      ["intitulé du poste", brief.roleTitle],
      ["raison du recrutement", brief.recruitmentReason],
    ]),
    section("objectives", "Objectifs et succès", [
      ["objectif à 3, 6 ou 12 mois", `${brief.goals3}${brief.goals6}${brief.goals12}`],
    ]),
    section("indicators", "Indicateurs de performance", [["indicateurs observables", brief.indicators]]),
    section("missions", "Missions et priorités", [
      ["missions", brief.missions],
      ["priorités", brief.priorities],
    ]),
    section("environment", "Environnement de travail", [
      ["outils, méthodes ou interactions", `${brief.tools}${brief.methods}${brief.interactions}`],
      ["autonomie ou management", `${brief.autonomy}${brief.management}`],
    ]),
    section("persona", "Persona candidat", [["parcours ou environnements utiles", brief.persona]]),
    section("skills", "Compétences", [["compétences indispensables", brief.mustHave]]),
    section("soft", "Soft skills", [
      ["comportements attendus", brief.softSkills],
      ["situations difficiles", brief.difficultSituations],
    ], "some"),
    section("eliminatory", "Critères éliminatoires", [["critères ou mention Aucun", brief.eliminatory]]),
    section("package", "Attractivité et package", [
      ["atouts ou contreparties", `${brief.assets}${brief.benefits}`],
      ["conditions concrètes", `${brief.salary}${brief.location}${brief.remote}`],
    ]),
  ];

  const completeness = Math.round((sections.filter((item) => item.complete).length / sections.length) * 100);
  const factors: TensionFactor[] = [];
  const mustHaves = splitItems(brief.mustHave);
  const combinedRequirements = `${brief.mustHave} ${brief.persona} ${brief.eliminatory}`.toLowerCase();
  const workplace = `${brief.location} ${brief.remote} ${brief.mobility} ${brief.schedule}`.toLowerCase();
  const seniorSignals = `${brief.roleTitle} ${brief.persona} ${brief.autonomy}`.toLowerCase();

  if (mustHaves.length > 5) {
    factors.push({
      id: "must-have-volume",
      label: "Accumulation de prérequis",
      detail: `${mustHaves.length} compétences sont classées indispensables.`,
      weight: mustHaves.length > 8 ? 2 : 1,
      recommendation: "Reclasser chaque exigence en indispensable, importante, souhaitable ou à retirer.",
    });
  }
  if (/dipl[oô]me|grande école|école d.ingénieur|secteur.{0,20}(obligatoire|exigé)|expérience.{0,20}(identique|obligatoire)/i.test(combinedRequirements)) {
    factors.push({
      id: "prescriptive-background",
      label: "Parcours très prescriptif",
      detail: "Le diplôme, le secteur ou une expérience identique semblent présentés comme obligatoires.",
      weight: 1,
      recommendation: "Vérifier si une preuve de compétence équivalente pourrait remplacer ce parcours.",
    });
  }
  if (/5\s*j|cinq\s*jours|100\s*%|présentiel\s*(complet|obligatoire)|aucun\s*télétravail/.test(workplace)) {
    factors.push({
      id: "onsite-constraint",
      label: "Présence sur site contraignante",
      detail: "Le poste semble exiger une présence très élevée sur site.",
      weight: 1,
      recommendation: "Confirmer que cette contrainte est nécessaire et l’afficher explicitement dans l’offre.",
    });
  }
  if (/fréquent|hebdomadaire|plus de 50|international régulier/.test(workplace)) {
    factors.push({
      id: "mobility",
      label: "Mobilité importante",
      detail: "La fréquence des déplacements peut réduire le vivier mobilisable.",
      weight: 1,
      recommendation: "Préciser la fréquence, la durée et les destinations plutôt qu’une formule générale.",
    });
  }
  if (/senior|lead|responsable|manager|direction|expert/.test(seniorSignals) && !isFilled(brief.salary)) {
    factors.push({
      id: "package-unknown",
      label: "Package non renseigné",
      detail: "Le niveau de responsabilité paraît élevé mais la rémunération n’est pas documentée.",
      weight: 1,
      recommendation: "Valider une fourchette ou signaler explicitement que l’arbitrage reste ouvert.",
    });
  }
  if (mustHaves.length >= 4 && mustHaves.join(" ").match(/\b(AWS|Azure|GCP|SAP|Salesforce|Polarion|DOORS|Kubernetes|Cobol|AngularJS)\b/gi)?.length! >= 4) {
    factors.push({
      id: "rare-combination",
      label: "Combinaison technique étroite",
      detail: "Plusieurs environnements spécialisés sont demandés simultanément.",
      weight: 2,
      recommendation: "Distinguer la compétence réellement critique des technologies apprenables.",
    });
  }

  const inconsistencies: string[] = [];
  if (/junior|débutant/.test(seniorSignals) && /autonomie complète|pilotage global|stratégique/.test(seniorSignals)) {
    inconsistencies.push("Le niveau annoncé paraît junior alors que l’autonomie ou l’impact attendu semble élevé.");
  }
  if (isFilled(brief.niceToHave) && splitItems(brief.niceToHave).some((item) => combinedRequirements.includes(`${item.toLowerCase()} obligatoire`))) {
    inconsistencies.push("Une compétence souhaitable semble également formulée comme obligatoire.");
  }

  const tensionScore = Math.min(6, factors.reduce((sum, item) => sum + item.weight, 0));
  const tensionLevel: TensionLevel = tensionScore >= 4 ? "Élevé" : tensionScore >= 2 ? "Modéré" : "Faible";
  const nextActions = [
    ...sections.filter((item) => !item.complete).slice(0, 3).map((item) => `Compléter ${item.label.toLowerCase()}.`),
    ...factors.slice(0, 2).map((item) => item.recommendation),
  ];

  return { completeness, sections, tensionLevel, tensionScore, tensionFactors: factors, inconsistencies, nextActions };
}

function listText(value: string, limit?: number): string {
  const items = splitItems(value);
  const selected = typeof limit === "number" ? items.slice(0, limit) : items;
  return selected.length ? selected.map((item) => `• ${item}`).join("\n") : "[À compléter]";
}

export function buildJobAd(
  brief: BriefData,
  format: "Courte" | "Standard" | "Détaillée" = "Standard",
  tone: "Professionnel direct" | "Institutionnel" | "Dynamique" = "Professionnel direct",
): JobAdSection[] {
  const limit = format === "Courte" ? 3 : undefined;
  const objectives = [
    brief.goals3 && `À 3 mois : ${brief.goals3}`,
    brief.goals6 && `À 6 mois : ${brief.goals6}`,
    brief.goals12 && `À 12 mois : ${brief.goals12}`,
    brief.autonomy && `Autonomie attendue : ${brief.autonomy}`,
  ].filter(Boolean).join("\n");
  const conditions = [
    brief.salary && `Rémunération : ${brief.salary}`,
    brief.location && `Lieu : ${brief.location}`,
    brief.remote && `Télétravail : ${brief.remote}`,
    brief.team && `Équipe : ${brief.team}`,
    brief.schedule && `Horaires : ${brief.schedule}`,
    brief.mobility && `Déplacements : ${brief.mobility}`,
    brief.recruitmentProcess && `Étapes : ${brief.recruitmentProcess}`,
  ].filter(Boolean).join("\n");
  const realities = [brief.constraints, brief.difficultSituations].filter(Boolean).join("\n");

  return [
    {
      id: "why",
      title: "Pourquoi nous recrutons",
      body: [brief.recruitmentReason, brief.consequences].filter(Boolean).join("\n\n") || "[À compléter]",
      source: "Contexte et besoin",
    },
    {
      id: "problems",
      title: "Les problèmes que vous aurez à résoudre",
      body: listText(brief.priorities || brief.missions, limit),
      source: "Missions et priorités",
    },
    {
      id: "expectations",
      title: "Ce que nous attendrons de vous",
      body: objectives || "[À compléter]",
      source: "Objectifs à 3, 6 et 12 mois",
    },
    {
      id: "required",
      title: "Ce dont vous aurez réellement besoin",
      body: listText(brief.mustHave, limit),
      source: "Compétences indispensables",
    },
    {
      id: "plus",
      title: "Ce qui constitue un plus",
      body: listText([brief.important, brief.niceToHave].filter(Boolean).join("\n"), limit),
      source: "Compétences importantes et souhaitables",
    },
    {
      id: "realities",
      title: "Les réalités du poste",
      body: realities || "[À compléter]",
      source: "Contraintes et situations difficiles",
    },
    {
      id: "value",
      title: "Ce que le poste vous apporte",
      body: [brief.assets, brief.benefits].filter(Boolean).join("\n\n") || "[À compléter]",
      source: "Attractivité et avantages validés",
    },
    {
      id: "conditions",
      title: "Les conditions concrètes",
      body: conditions || "[À compléter]",
      source: `Conditions du brief · ${format} · ${tone}`,
    },
  ];
}

export function checkJobAd(brief: BriefData, sections: JobAdSection[]): QualityCheck[] {
  const byId = Object.fromEntries(sections.map((item) => [item.id, item.body]));
  const check = (
    id: string,
    label: string,
    complete: boolean,
    evidence: string,
    suggestion: string,
  ): QualityCheck => ({ id, label, status: complete ? "Conforme" : "À compléter", evidence, suggestion });

  const checks: QualityCheck[] = [
    check("context", "Contexte", isFilled(brief.recruitmentReason) && !byId.why?.includes("[À compléter]"), byId.why || "Absent", "Préciser la raison réelle du recrutement."),
    check("problems", "Problèmes à résoudre", isFilled(brief.priorities) && !byId.problems?.includes("[À compléter]"), byId.problems || "Absent", "Transformer les missions prioritaires en problèmes professionnels concrets."),
    check("results", "Résultats attendus", isFilled(`${brief.goals3}${brief.goals6}${brief.goals12}`), byId.expectations || "Absent", "Ajouter au moins un résultat attendu et le niveau d’autonomie."),
    check("requirements", "Indispensable et souhaitable", isFilled(brief.mustHave), `${byId.required || ""}\n${byId.plus || ""}`, "Séparer les compétences indispensables des compétences souhaitables."),
    check("constraints", "Contraintes", isFilled(`${brief.constraints}${brief.location}${brief.remote}${brief.mobility}`), byId.realities || "Absent", "Rendre visibles les contraintes validées du poste."),
    check("counterpart", "Contrepartie", isFilled(`${brief.assets}${brief.benefits}`), byId.value || "Absent", "Décrire des contreparties concrètes, sans promesse non étayée."),
    check("conditions", "Conditions concrètes", isFilled(`${brief.location}${brief.remote}${brief.salary}`), byId.conditions || "Absent", "Compléter le lieu, le télétravail et la rémunération ou assumer explicitement leur absence."),
  ];

  const mandatory = splitItems(brief.mustHave).map((item) => item.toLowerCase());
  const optional = splitItems(`${brief.important}\n${brief.niceToHave}`).map((item) => item.toLowerCase());
  const requiredBody = (byId.required || "").toLowerCase();
  const conflict = optional.find((item) => requiredBody.includes(item) && !mandatory.includes(item));
  if (conflict) {
    checks.push({
      id: "coherence",
      label: "Cohérence avec le brief",
      status: "Incohérence à corriger",
      evidence: `« ${conflict} » apparaît parmi les prérequis alors que le brief ne le classe pas indispensable.`,
      suggestion: "Replacer cette compétence dans la section des atouts ou la reclasser explicitement dans le brief.",
    });
  } else {
    checks.push({
      id: "coherence",
      label: "Cohérence avec le brief",
      status: "Conforme",
      evidence: "Aucun déplacement automatique d’une compétence souhaitable vers les prérequis n’a été détecté.",
      suggestion: "Conserver une validation humaine avant publication.",
    });
  }
  return checks;
}

const levelConfig: Record<JobLevel, { method: ScorecardData["method"]; duration: string; target: number }> = {
  "Jeune diplômé": { method: "SAR", duration: "45–60 min", target: 6 },
  Opérationnel: { method: "SAR", duration: "45–60 min", target: 6 },
  Manager: { method: "STAR", duration: "60–75 min", target: 6 },
  Direction: { method: "SOAR enrichi", duration: "Environ 90 min", target: 8 },
};

export function scorecardCriterionLimit(level: JobLevel): number {
  return levelConfig[level].target;
}

function criterionFromName(name: string, index: number, source: "hard" | "soft"): ScorecardCriterion {
  const clean = name.trim();
  const type = source === "soft" ? "Soft skill" : /communication|pilotage|management|coordination|leadership/i.test(clean) ? "Hybride" : "Hard skill";
  return {
    id: `criterion-${index + 1}`,
    criterion: clean,
    type,
    definition: `Capacité à mobiliser ${clean.toLowerCase()} dans les situations réelles du poste.`,
    coefficient: index < 2 ? 3 : index < 5 ? 2 : 1,
    eliminatory: false,
    minimum: 0,
    mainQuestion: `Parlez-moi d’une situation récente où vous avez dû démontrer ${clean.toLowerCase()}. Quel était le contexte et quel résultat avez-vous obtenu ?`,
    followUps: "Quel était précisément votre rôle ?\nQuelles actions avez-vous personnellement menées ?\nComment avez-vous mesuré le résultat ?\nQue feriez-vous différemment ?",
    expectedEvidence: `Exemple daté et contextualisé ; actions personnelles ; résultat observable ; recul critique en lien avec ${clean.toLowerCase()}.`,
    anchor0: "Aucun exemple pertinent ou réponse uniquement déclarative.",
    anchor1: "Exemple partiel, rôle personnel ou résultat peu clair.",
    anchor2: "Exemple précis avec actions personnelles et résultat observable.",
    anchor3: "Plusieurs preuves solides, maîtrise des arbitrages et capacité de transfert.",
    note: null,
    comment: "",
  };
}

export function buildScorecard(
  brief: BriefData,
  level: JobLevel = "Opérationnel",
  globalThreshold = 60,
  requestedCriteria: string[] = [],
): ScorecardData {
  const config = levelConfig[level];
  const hard = requestedCriteria.length ? requestedCriteria : [
    ...splitItems(brief.mustHave),
    ...splitItems(brief.important),
    ...splitItems(brief.missions).slice(0, 2),
  ];
  const soft = splitItems(brief.softSkills);
  const seen = new Set<string>();
  const uniqueHard = hard.filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const uniqueSoft = soft.filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const selected: Array<{ name: string; source: "hard" | "soft" }> = [
    ...uniqueHard.map((name) => ({ name, source: "hard" as const })),
    ...uniqueSoft.map((name) => ({ name, source: "soft" as const })),
  ].slice(0, config.target);
  if (!selected.length) {
    selected.push(
      { name: "Maîtrise du cœur de métier", source: "hard" },
      { name: "Résolution de problèmes", source: "soft" },
      { name: "Coopération", source: "soft" },
    );
  }
  return {
    level,
    method: config.method,
    scale: "0–3",
    duration: config.duration,
    globalThreshold: Math.max(0, Math.min(100, globalThreshold)),
    criteria: selected.map((item, index) => criterionFromName(item.name, index, item.source)),
    metadata: {
      schemaVersion: "1.0",
      templateId: "SCORECARD_STANDARD",
      templateVersion: "1.0",
      rendererVersion: "1.0",
      scorecardVersion: 1,
      layoutContractId: "SCORECARD_STANDARD_1_0",
    },
  };
}


export function buildSourcingStrategy(
  criteria: string[],
  selectedNames?: string[],
  customSynonyms: Record<string, string[]> = {},
  funnelOptions: FunnelOverrides = {},
): SourcingStrategy {
  const normalized = [...new Set(criteria.map((item) => item.trim()).filter(Boolean))];
  const selected = (selectedNames === undefined ? normalized.slice(0, 3) : selectedNames)
    .filter((name, index, values) => normalized.includes(name) && values.indexOf(name) === index)
    .slice(0, 3)
    .map((name, index) => ({
      name,
      synonyms: normaliseSearchTerms(Object.hasOwn(customSynonyms,name) ? customSynonyms[name] : suggestSearchTerms(name)),
      enabled: true,
      reason: `Axe de recherche ${index + 1}`,
    }));
  const excluded = normalized.filter((item) => !selected.some((chosen) => chosen.name === item));
  const seenGroups = new Set<string>();
  const duplicates: string[] = [];
  const enabled = selected.filter((item) => {
    if(!item.enabled || !item.synonyms.length) return false;
    const key=item.synonyms.map(term=>term.toLocaleLowerCase('fr')).sort().join('|');
    if(seenGroups.has(key)) {duplicates.push(item.name);return false;}
    seenGroups.add(key); return true;
  });
  const variants = {large:enabled.slice(0,1),balanced:enabled.slice(0,2),targeted:enabled.slice(0,3)};
  const warnings = selected.filter(item=>!item.synonyms.length).map(item=>`« ${item.name} » : saisir des termes présents dans un CV. Cet axe est absent des requêtes tant qu’il n’a pas de termes.`);
  warnings.push(...duplicates.map(name=>`« ${name} » reprend les mêmes termes qu’un autre axe : il n’est pas répété dans la requête.`));
  return {
    funnel: buildSourcingFunnel(enabled,funnelOptions),
    selected,
    excluded,
    queries: {
      large: renderSearchQuery(variants.large.map(item=>item.synonyms),'linkedin'),
      balanced: renderSearchQuery(variants.balanced.map(item=>item.synonyms),'linkedin'),
      targeted: renderSearchQuery(variants.targeted.map(item=>item.synonyms),'linkedin'),
    },
    queryAxes: {large:variants.large.map(item=>item.name),balanced:variants.balanced.map(item=>item.name),targeted:variants.targeted.map(item=>item.name)},
    warnings,
    platforms: Object.fromEntries(Object.entries(sourcingPlatformHelp).map(([key,info])=>[key,{...info,queries:Object.fromEntries(Object.entries(variants).map(([variant,axes])=>[variant,renderSearchQuery(axes.map(item=>item.synonyms),key as SourcingPlatform)]))}])) as SourcingStrategy['platforms'],
    explanation: [
      `La requête utilise ${enabled.length} critère${enabled.length > 1 ? "s" : ""} professionnel${enabled.length > 1 ? "s" : ""}, dans la limite V12 de trois.`,
      excluded.length ? `${excluded.length} critère${excluded.length > 1 ? "s restent" : " reste"} disponible${excluded.length > 1 ? "s" : ""} pour la qualification ou l’entretien.` : "Aucun critère supplémentaire n’a été injecté dans le booléen.",
      "La grille 3 × 3 élargit les termes, du profil précis aux savoir-faire transférables, sans retirer d’axe. Les axes non négociables peuvent être verrouillés. Des requêtes identiques sont signalées quand les alternatives manquent.",
      "Les termes proposés sont du vocabulaire de recherche à valider, pas des compétences équivalentes. Les critères comportementaux se vérifient en entretien. Aucun NOT, lieu, diplôme ou seuil d’expérience n’est ajouté automatiquement.",
    ],
  };
}

export function extractBriefHints(text: string): Partial<BriefData> {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstTitle = lines.find((line) => line.length >= 4 && line.length <= 90) || "";
  const findBlock = (patterns: RegExp[], max = 900) => {
    const index = lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));
    if (index < 0) return "";
    return lines.slice(index + 1, index + 7).join("\n").slice(0, max);
  };
  const compensationLine = lines.find((line) => /€|k€|rémunération|salaire/i.test(line)) || "";
  const locationLine = lines.find((line) => /localisation|lieu|basé|poste à|site de/i.test(line)) || "";
  const remoteLine = lines.find((line) => /télétravail|remote|hybride|présentiel/i.test(line)) || "";
  return {
    roleTitle: firstTitle,
    recruitmentReason: findBlock([/contexte/i, /pourquoi.*recrut/i]),
    missions: findBlock([/missions?/i, /responsabilités?/i, /vos activités/i]),
    priorities: findBlock([/enjeux?/i, /priorités?/i, /problèmes? à résoudre/i]),
    mustHave: findBlock([/profil/i, /compétences? requises?/i, /prérequis/i]),
    important: findBlock([/compétences? appréciées?/i, /atouts?/i, /un plus/i]),
    constraints: findBlock([/contraintes?/i, /réalités? du poste/i]),
    benefits: findBlock([/avantages?/i, /ce que nous offrons/i]),
    salary: compensationLine,
    location: locationLine,
    remote: remoteLine,
  };
}
