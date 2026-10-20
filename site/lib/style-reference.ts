export const STYLE_PROFILE_VERSION = 'YUAN_EDITORIAL_1_0';
export const STYLE_REFERENCES = [
  {
    id: 'libfile_77c7a09a5100819195dd4111533e82ad',
    title: 'Reportage analytique sur l’Alberta · Curtis Gillespie · traduction Courrier international · 19 octobre 2026',
    usage: 'Style uniquement : contexte concret, détail vérifiable, progression du particulier vers les enjeux, articulation explicite des causes et des conséquences. Aucun fait ni jugement politique de cet article ne constitue un fait sur le recrutement.',
  },
  {
    id: 'libfile_7ad895e9292c81919c6c7a873b3694ae',
    title: 'Chronique sur la correction linguistique · Emma Pearson · traduction Courrier international · 17 octobre 2026',
    usage: 'Style uniquement : entrée accessible, scène précise, ton naturel, variations du rythme, nuance et chute sobre. Humour ou référence culturelle seulement si le contexte professionnel le justifie, jamais par automatisme.',
  },
];

// Synthèse originale des techniques observées dans les textes fournis. Les articles
// ne sont ni reproduits dans le bundle, ni utilisés comme sources métier.
export const STYLE_REFERENCE = `
Écrire un français naturel, précis et professionnel, avec une information principale rapidement identifiable.
Partir du contexte réel et d’enjeux concrets plutôt que d’un slogan ou d’une promesse d’employeur.
Relier les activités aux problèmes à résoudre et aux effets attendus, sans ajouter de nouveaux objectifs.
Privilégier les sujets identifiables, les verbes d’action et les situations observables.
Varier la longueur des phrases ; éviter la succession mécanique de listes ou de phrases bâties sur le même moule.
Construire des transitions qui expliquent les liens entre contexte, missions, contraintes et résultats.
Employer des détails spécifiques uniquement lorsqu’ils sont présents dans le brief.
Faire apparaître les nuances, limites, incertitudes et arbitrages sans dramatisation ni emphase.
Éviter les adjectifs promotionnels non étayés : passionnant, stimulant, innovant, dynamique, exceptionnel.
Ne pas utiliser d’émojis ni de tiret cadratin. Le ton doit rester factuel, fluide et non robotique.
Les proverbes, références et traits d’humour ne sont pas interdits, mais doivent avoir une utilité réelle et ne jamais être forcés.
Ne pas copier des formulations des articles et ne pas imiter un auteur mot pour mot.
`;

const STOP_WORDS = new Set([
  'avec', 'dans', 'pour', 'sans', 'sous', 'entre', 'mais', 'donc', 'dont', 'elle', 'elles', 'leur', 'leurs',
  'nous', 'vous', 'votre', 'vos', 'poste', 'profil', 'mission', 'missions', 'travail', 'faire', 'plus', 'tout',
  'tous', 'toute', 'cette', 'comme', 'ainsi', 'etre', 'avoir', 'sera', 'sont', 'une', 'des', 'les', 'aux',
]);

export type StyleExcerpt = { text: string; index: number; score: number; matchedTerms: string[] };

function normalise(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
}

function tokens(value: string) {
  return (normalise(value).match(/[a-z0-9]{3,}/g) ?? []).filter(term => !STOP_WORDS.has(term));
}

function chunkParagraph(part: string, size = 1200) {
  const chunks: string[] = [];
  let start = 0;
  while (start < part.length) {
    let end = Math.min(start + size, part.length);
    if (end < part.length) {
      const boundary = part.lastIndexOf(' ', end);
      if (boundary > start + Math.floor(size * 0.65)) end = boundary;
    }
    chunks.push(part.slice(start, end).trim());
    start = end;
    while (part[start] === ' ') start += 1;
  }
  return chunks.filter(Boolean);
}

export function retrieveStyleExcerpts(corpus: string, query: string, limit = 4, characterBudget = 4200): StyleExcerpt[] {
  const queryTerms = tokens(query);
  if (!corpus.trim() || !queryTerms.length) return [];
  const chunks = corpus.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean).flatMap(part => chunkParagraph(part));
  if (!chunks.length) return [];
  const tokenised = chunks.map(tokens);
  const documentFrequency = new Map<string, number>();
  for (const document of tokenised) {
    for (const term of new Set(document)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  const uniqueQueryTerms = [...new Set(queryTerms)];
  const ranked = chunks.map((text, index) => {
    const frequencies = new Map<string, number>();
    for (const term of tokenised[index]) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    const matchedTerms = uniqueQueryTerms.filter(term => frequencies.has(term));
    const score = matchedTerms.reduce((sum, term) => {
      const frequency = frequencies.get(term) ?? 0;
      const inverseFrequency = Math.log(1 + chunks.length / (1 + (documentFrequency.get(term) ?? 0)));
      return sum + (1 + Math.log(frequency)) * inverseFrequency;
    }, 0);
    return { text, index, score, matchedTerms };
  }).filter(item => item.score > 0).sort((left, right) => right.score - left.score || left.index - right.index);
  const selected: StyleExcerpt[] = [];
  let characters = 0;
  for (const item of ranked) {
    if (selected.length >= limit) break;
    if (selected.length && characters + item.text.length > characterBudget) continue;
    selected.push(item);
    characters += item.text.length;
  }
  return selected;
}

export function selectStyleExcerpts(corpus: string, query: string): string[] {
  return retrieveStyleExcerpts(corpus, query).map(item => item.text);
}
