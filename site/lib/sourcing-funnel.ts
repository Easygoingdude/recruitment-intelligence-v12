import { normaliseSearchTerms, renderSearchQuery, sourcingPlatformHelp, type SourcingPlatform } from './sourcing-queries';

export type FunnelLevel = 'precise' | 'adjacent' | 'transferable';
export type FunnelOverrides = Record<string,{adjacent?:string[];transferable?:string[];locked?:boolean;reason?:string;verify?:string}>;
export type FunnelDraft = Record<string,{adjacent?:string;transferable?:string;locked?:boolean;reason?:string;verify?:string}>;
export interface FunnelAxis {name:string;exact:string[];adjacent:string[];transferable:string[];locked:boolean;reason:string;verify:string;}
export interface FunnelSet {id:string;level:FunnelLevel;variant:number;groups:string[][];expandedAxes:string[];queries:Record<SourcingPlatform,string>;duplicateOf:Partial<Record<SourcingPlatform,string>>;}
export interface SourcingFunnel {version:'RI_SOURCING_FUNNEL_1';axes:FunnelAxis[];sets:FunnelSet[];warnings:string[];}

const bridges:Array<{match:RegExp;adjacent:string[];transferable:string[];reason:string;verify:string}>=[
  {match:/palo alto|panorama/i,adjacent:['Fortinet','FortiGate','Stormshield','Check Point'],transferable:['pare-feu','firewall','sécurité réseau','network security'],reason:'Administration de pare-feu et diagnostic réseau dans un autre environnement.',verify:'Vérifier politiques, routage, VPN et diagnostic ; maîtrise Palo Alto à démontrer ou à acquérir.'},
  {match:/polarion|codebeamer|\b(?:elm|jazz)\b/i,adjacent:['Polarion','Codebeamer','IBM ELM','Jama'],transferable:['gestion des exigences','requirements management','ALM'],reason:'Gestion des exigences, traçabilité et administration d’outils ALM.',verify:'Vérifier administration, workflows et accompagnement métier, puis l’écart sur l’outil cible.'},
  {match:/silog|\berp\b|\bpgi\b/i,adjacent:['Sage X3','Cegid','Divalto','Odoo'],transferable:['administration ERP','support applicatif','progiciel de gestion'],reason:'Administration, support et évolutions d’un progiciel métier.',verify:'Vérifier SQL, MCO, compréhension métier et capacité à apprendre l’ERP cible.'},
  {match:/angularjs|angular|react/i,adjacent:['Angular','React','Vue.js'],transferable:['JavaScript','TypeScript','développement frontend'],reason:'Développement d’interfaces web et maintenance de composants.',verify:'Vérifier JavaScript, architecture d’interface, tests et reprise de code existant ; framework cible non présumé maîtrisé.'},
  {match:/\.net|dotnet|c#|csharp/i,adjacent:['Java','Spring','Kotlin'],transferable:['développement backend','programmation orientée objet','maintenance applicative'],reason:'Conception backend et maintenance d’applications dans un autre langage.',verify:'Vérifier conception, diagnostic et tests ; estimer la montée en compétence C#/.NET. Verrouiller cet axe si cette maîtrise est exigée dès l’arrivée.'},
  {match:/\bsql\b|t-sql/i,adjacent:['PostgreSQL','SQL Server','Oracle','MySQL'],transferable:['bases de données relationnelles','requêtes SQL','modélisation de données'],reason:'Requêtage et compréhension des données relationnelles.',verify:'Vérifier requêtes concrètes, performance et intégration ; le nom d’un SGBD ne prouve pas la maîtrise de SQL.'},
  {match:/(?:responsable|manager|lead|chef).*(?:support|helpdesk)|support.*(?:manager|lead)/i,adjacent:['service desk manager','coordinateur support','responsable helpdesk'],transferable:['team leader','superviseur assistance','management de proximité'],reason:'Répartition du travail, accompagnement et pilotage d’une activité de service.',verify:'Vérifier l’encadrement effectif et le contexte IT ; ne pas assimiler management d’un service à expertise technique.'},
  {match:/support|helpdesk|service desk/i,adjacent:['assistance informatique','desktop support','technicien systèmes'],transferable:['diagnostic informatique','gestion des incidents','assistance utilisateurs'],reason:'Diagnostic, prise en charge des utilisateurs et suivi d’incidents.',verify:'Vérifier interventions personnelles, outils et périmètre ; ne pas inférer le niveau technique du seul intitulé.'},
  {match:/active directory|\bgpo\b/i,adjacent:['Entra ID','administration Windows'],transferable:['gestion des identités','gestion des accès','administration systèmes'],reason:'Identités, droits et administration de postes ou de systèmes.',verify:'Vérifier AD classique, GPO et opérations réellement exécutées ; Entra ID ne remplace pas automatiquement ces compétences.'},
  {match:/réseau|reseau|network/i,adjacent:['administrateur systèmes et réseaux','ingénieur télécom','network engineer'],transferable:['TCP/IP','routage','VLAN','VPN'],reason:'Fondamentaux de connectivité, routage et diagnostic.',verify:'Vérifier configurations et incidents réels ; les constructeurs ou niveaux d’autonomie ne sont pas déduits des mots-clés.'},
  {match:/itsm|itil/i,adjacent:['ServiceNow','GLPI','Jira Service Management','ManageEngine'],transferable:['gestion des incidents','gestion des problèmes','service management'],reason:'Traitement et traçabilité d’une activité de service.',verify:'Vérifier les processus effectivement pratiqués, sans présumer la maîtrise d’un outil ou une certification.'},
];

export function buildSourcingFunnel(selected:Array<{name:string;synonyms:string[]}>,overrides:FunnelOverrides={}):SourcingFunnel {
  const axes=selected.filter(a=>a.synonyms.length).slice(0,3).map(a=>{
    const bridge=bridges.find(b=>b.match.test(`${a.name} ${a.synonyms.join(' ')}`));
    const custom=overrides[a.name]??{};
    return {name:a.name,exact:normaliseSearchTerms(a.synonyms),adjacent:normaliseSearchTerms(custom.adjacent??bridge?.adjacent??[]),transferable:normaliseSearchTerms(custom.transferable??bridge?.transferable??[]),locked:custom.locked===true,reason:custom.reason??bridge?.reason??'Passerelle à documenter par le recruteur.',verify:custom.verify??bridge?.verify??'Vérifier le lien entre la compétence proposée, les activités du poste et les écarts de formation.'};
  });
  const warnings=axes.filter(a=>!a.locked&&(!a.adjacent.length||!a.transferable.length)).map(a=>`« ${a.name} » : compléter les passerelles manquantes. Aucune compétence voisine n’est inventée pour remplir la grille.`);
  if(axes.length<3) warnings.push('Moins de trois axes recherchables : les neuf positions peuvent contenir des requêtes identiques, signalées explicitement.');
  const seen:Partial<Record<SourcingPlatform,Map<string,string>>>={};
  const sets:FunnelSet[]=[];
  for(const level of ['precise','adjacent','transferable'] as const) for(let variant=1;variant<=3;variant++) {
    const groups=axes.map((axis,index)=>{
      if(axis.locked) return axis.exact;
      if(level==='precise') return variant===1 || (variant===2&&index>0) ? axis.exact.slice(0,1) : axis.exact;
      const adjacent=normaliseSearchTerms([...axis.exact,...axis.adjacent],24);
      if(level==='adjacent') return index<variant?adjacent:axis.exact;
      return index<variant?normaliseSearchTerms([...adjacent,...axis.transferable],24):adjacent;
    });
    const id=`${level==='precise'?'P':level==='adjacent'?'V':'T'}${variant}`;
    const queries={} as Record<SourcingPlatform,string>;
    const duplicateOf:Partial<Record<SourcingPlatform,string>>={};
    for(const platform of Object.keys(sourcingPlatformHelp) as SourcingPlatform[]) {
      // Keep Google strings compact without silently dropping a professional axis.
      const platformGroups=platform==='google-xray'||platform==='google-web'?groups.map((group,i)=>axes[i].locked?group:normaliseSearchTerms([
        ...axes[i].exact.filter(t=>group.includes(t)).slice(0,2),
        ...axes[i].adjacent.filter(t=>group.includes(t)&&!axes[i].exact.includes(t)).slice(0,1),
        ...axes[i].transferable.filter(t=>group.includes(t)&&!axes[i].exact.includes(t)&&!axes[i].adjacent.includes(t)).slice(0,1),
      ],24)):groups;
      queries[platform]=renderSearchQuery(platformGroups,platform);
      const prior=seen[platform]??=new Map();
      const duplicate=prior.get(queries[platform]);
      if(duplicate) duplicateOf[platform]=duplicate;
      else if(queries[platform]) prior.set(queries[platform],id);
    }
    sets.push({id,level,variant,groups,expandedAxes:axes.filter((a,i)=>groups[i].some(t=>!a.exact.includes(t))).map(a=>a.name),queries,duplicateOf});
  }
  return {version:'RI_SOURCING_FUNNEL_1',axes,sets,warnings};
}
