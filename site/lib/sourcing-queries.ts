export type QueryVariant = 'large' | 'balanced' | 'targeted';
export type SourcingPlatform = 'linkedin' | 'hellowork' | 'apec' | 'monster' | 'google-xray' | 'google-web' | 'jobboard-boolean' | 'jobboard-simple';

// Related search vocabulary, never evidence of proficiency or mandatory requirements.
const vocabulary: Array<[RegExp, string[]]> = [
  [/(?:responsable|manager|lead|chef).*(?:support|helpdesk)|support.*(?:manager|lead)/i,['responsable support','support manager','helpdesk manager','team lead support']],
  [/technicien.*support|support.*technician/i,['technicien support','support technician','helpdesk technician']],
  [/palo\s*alto|panorama/i,['Palo Alto','Panorama']],
  [/polarion/i,['Polarion','Siemens Polarion']], [/codebeamer/i,['Codebeamer']],
  [/\b(?:jazz|elm|ewm)\b/i,['IBM ELM','IBM Jazz','EWM']],
  [/\b(?:silog)\b/i,['Silog']], [/\b(?:erp)\b/i,['ERP','PGI']],
  [/angularjs/i,['AngularJS']], [/angular/i,['Angular']], [/react/i,['React','ReactJS']],
  [/\.net|dotnet|c#/i,['.NET','C#','ASP.NET']], [/python/i,['Python']],
  [/javascript|typescript/i,['JavaScript','TypeScript']],
  [/\bsql\b/i,['SQL','T-SQL']],
  [/active directory|\bad\b|\bgpo\b/i,['Active Directory','GPO']],
  [/exchange/i,['Exchange']], [/microsoft 365|office 365|m365/i,['Microsoft 365','Office 365','M365']],
  [/intune/i,['Intune']], [/itil/i,['ITIL']], [/itsm/i,['ITSM']],
  [/réseaux|reseaux|network/i,['réseau','network']],
  [/support|helpdesk|service desk/i,['support informatique','IT support','helpdesk','service desk']],
];
const abstract = /communication|posture|autonomie|coopération|leadership|priorisation|diagnostic|qualité|suivi|organisation|encadrement|amélioration|résolution/i;

export function normaliseSearchTerms(values: string[],limit=8): string[] {
  return [...new Map(values.map(v=>v.normalize('NFKC').replace(/[“”«»"\\*\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim()).filter(v=>v && v.length<=80).map(v=>[v.toLocaleLowerCase('fr'),v])).values()].slice(0,limit);
}

export function suggestSearchTerms(name: string): string[] {
  const known=vocabulary.find(([pattern])=>pattern.test(name));
  if(known) return known[1];
  // A short literal title/technology is searchable; a behavioural sentence is not.
  return !abstract.test(name) && name.trim().split(/\s+/).length<=4 && !/[;?\n]|\b(?:et|ou|AND|OR|NOT)\b/i.test(name)
    ? normaliseSearchTerms([name]) : [];
}

export const quoteSearchTerm=(value: string)=>`"${value}"`;
export const searchGroup=(values: string[], or='OR')=>values.length===1?quoteSearchTerm(values[0]):`(${values.map(quoteSearchTerm).join(` ${or} `)})`;

export function renderSearchQuery(groups: string[][], platform: SourcingPlatform) {
  const usable=groups.filter(g=>g.length);
  if(!usable.length) return '';
  if(platform==='jobboard-simple') return usable.map(g=>g[0]).join(' ');
  if(platform==='google-xray' || platform==='google-web') return [platform==='google-xray'?'site:linkedin.com/in/':'',...usable.map(g=>searchGroup(g))].filter(Boolean).join(' ');
  if(platform==='hellowork' || platform==='apec') return usable.map(g=>searchGroup(g,'OU')).join(' ET ');
  return usable.map(group=>searchGroup(group)).join(' AND ');
}

export const sourcingPlatformHelp: Record<SourcingPlatform,{label:string;field:string;instructions:string;source?:string}>={
  linkedin:{label:'LinkedIn Recruiter',field:'Mots-clés (Keywords)',instructions:'Coller dans Mots-clés. Renseigner la localisation, les intitulés actuels ou passés et les entreprises dans leurs filtres dédiés. AND / OR en majuscules, guillemets droits et parenthèses. Aucune exclusion automatique.',source:'https://www.linkedin.com/help/recruiter/answer/a415295'},
  hellowork:{label:'HelloWork CVthèque',field:'Recherche booléenne',instructions:'Utiliser le mode booléen : ET entre axes, OU entre alternatives. Localisation et disponibilité dans les filtres natifs. Tester progressivement les neuf requêtes.',source:'https://www.helloworkplace.fr/recherche-booleenne-cvtheque/'},
  apec:{label:'Apec Candidapec',field:'Recherche par mots-clés',instructions:'ET, OU, parenthèses et guillemets. La recherche porte sur le profil et le CV attaché. Conserver les filtres métier, mobilité et disponibilité séparés.',source:'https://www.apec.fr/faq.html?question=comment-effectuer-une-recherche-complexe-par-mots-cles'},
  monster:{label:'Monster, mode booléen',field:'Boolean Search / mots-clés',instructions:'Activer le mode Boolean Search quand il est proposé par votre abonnement, puis coller la requête AND / OR. Ne pas coller ce booléen dans un champ de recherche sémantique.',source:'https://hiring.monster.com/help-center/additional-resources/candidate-search/searching-with-boolean/'},
  'google-xray':{label:'Google X-ray, profils LinkedIn publics',field:'Recherche Google',instructions:'Cible site:linkedin.com/in/. Rendu compact : jusqu’à deux termes exacts, un voisin et un savoir-faire transférable par axe, dans l’ordre affiché. Les axes verrouillés conservent tous leurs termes. Guillemets, OR et intersection par juxtaposition. Seules les pages publiques indexées sont accessibles ; ni accès à Recruiter, ni recherche exhaustive des profils.',source:'https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site'},
  'google-web':{label:'Google, web public élargi',field:'Recherche Google',instructions:'Même rendu compact que X-ray, sans restriction à LinkedIn : jusqu’à deux termes exacts, un voisin et un transférable par axe non verrouillé. Les résultats peuvent inclure des pages hors cible. Ajouter un site: pertinent manuellement si nécessaire. Aucune collecte automatique de profils.',source:'https://support.google.com/websearch/answer/2466433'},
  'jobboard-boolean':{label:'Jobboard avec recherche booléenne',field:'Recherche avancée / mots-clés',instructions:'Utiliser uniquement si l’aide de la CVthèque confirme AND / OR, les guillemets et les parenthèses. Les syntaxes varient selon le jobboard ; ce mode ne garantit pas une compatibilité universelle.'},
  'jobboard-simple':{label:'Jobboard sans booléen',field:'Recherche par mots-clés',instructions:'Version sans opérateurs : un terme par axe. Tester également les alternatives affichées séparément. Le comportement de combinaison des mots dépend du moteur ; utiliser ses filtres natifs.'},
};
