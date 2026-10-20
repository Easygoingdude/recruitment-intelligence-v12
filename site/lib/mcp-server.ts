import {
  SCORECARD_LEVELS,
  buildSourcingStrategy,
  emptyBrief,
  type BriefData,
  type JobLevel,
} from "./recruitment-engine";
import { runRecruitmentAI, type AIEnvironment } from "./recruitment-ai";
import type { AIEnvelope, AISourcingPlan } from "./ai-contract";
import type { JobAdSection, QualityCheck, ScorecardData } from "./recruitment-engine";
import type { FunnelOverrides } from './sourcing-funnel';
import { sourcingPlatformHelp, type SourcingPlatform } from './sourcing-queries';
import { runAssessmentAgent } from './assessment-ai';
import type { AgentTask } from './assessment';
import { purgeExpiredInterviews } from './interview-store';

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

const UI_RESOURCE_URI = "ui://recruitment-intelligence/workspace-v1";
const SERVER_NAME = "recruitment-intelligence";
const SERVER_VERSION = "1.6.0";
const PROTOCOL_VERSION = "2025-11-25";

const briefProperties = Object.fromEntries(
  Object.keys(emptyBrief).map((key) => [key, { type: "string" }]),
);

const briefSchema = {
  type: "object",
  description: "Brief de recrutement structuré. Les champs peuvent rester vides lorsque l’information n’est pas disponible.",
  properties: briefProperties,
  additionalProperties: false,
};

const modelPreferenceSchema = {
  type: "string",
  enum: ["auto", "luna", "sol"],
  default: "auto",
  description: "auto : Luna pour l’extraction et Sol pour les tâches complexes ; luna : économie ; sol : qualité.",
};

function tools(origin: string) {
  const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
  return [
    {
      name:'purge_expired_interviews',title:'Supprimer les entretiens expirés',
      description:'Supprime uniquement les entretiens dont la conservation de 14 jours a expiré. Ne lit et ne retourne aucun contenu candidat. Outil de maintenance sans appel IA pour la tâche quotidienne liée à ce Site privé.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false},
    },
    ...(['interview','evaluate','report'] as const).map((task,index)=>({
      name:['m4_assist_interview','m5_review_evidence','m6_draft_report'][index],
      title:['Préparer les relances de l’entretien','Relire les preuves sans noter','Préparer un compte rendu factuel'][index],
      description:`Agent ${task} avec RAG méthodologique versionné et Harness. Un seul appel, aucun cache candidat et aucune note ou décision automatique. ${task==='interview'?'Un critère maximum, Luna Low par défaut.':task==='evaluate'?'Huit critères maximum, Sol Medium par défaut.':'Huit critères maximum, Luna Low par défaut.'} contextJson est un objet JSON contenant candidateReference (initiales prénom.nom), roleTitle, criteria [{id,criterion,definition,anchors (4 textes),question,transferQuestion,evidence,comment,note (null ou 0 à 3 humain),coefficient (1 à 3),minimum (0 à 3),eliminatory}], humanDecision (null ou {value,justification}), modelPreference (auto/luna/sol). Retirez les noms et coordonnées avant transmission. La confirmation de confidentialité est requise. Les sessions sont sauvegardées dans l’interface, pas par cet outil sans état.`,
      inputSchema:{type:'object',properties:{contextJson:{type:'string',maxLength:80000},privacyReviewed:{type:'boolean',enum:[true]}},required:['contextJson','privacyReviewed'],additionalProperties:false},
      annotations:readOnlyAnnotations,
    })),
    {
      name: "open_recruitment_intelligence",
      title: "Recruitment Intelligence",
      description: "Ouvre les espaces Postes, Candidatures et Agenda. Une candidature peut regrouper plusieurs entretiens ; les décisions M5 sont protégées et la réouverture demande un motif. L’agenda couvre le jour à J+3, et chaque poste possède son dossier M1 à M6.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: readOnlyAnnotations,
      icons: [{ src: `${origin}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
      _meta: {
        ui: { resourceUri: UI_RESOURCE_URI, visibility: ["model", "app"] },
        "openai/ui": {
          entrypoints: [{ type: "global" }, { type: "thread" }],
        },
        "openai/toolInvocation/invoking": "Ouverture de l’espace de travail…",
        "openai/toolInvocation/invoked": "Espace de travail ouvert.",
      },
    },
    {
      name: "m1_analyze_need",
      title: "Analyser un besoin de recrutement",
      description: "Analyse le besoin avec le modèle IA : synthèse, lacunes, contradictions justifiées, arbitrages et questions de kick-off. Les hypothèses restent à valider.",
      inputSchema: {
        type: "object",
        properties: { brief: briefSchema, modelPreference: modelPreferenceSchema },
        required: ["brief"],
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations,
    },
    {
      name: "m1_generate_job_ad",
      title: "Générer une offre honnête et sélective",
      description: "Produit les huit sections de l’offre et un contrôle qualité fondé sur le brief validé. Toute information absente est signalée au lieu d’être supposée.",
      inputSchema: {
        type: "object",
        properties: {
          brief: briefSchema,
          format: { type: "string", enum: ["Courte", "Standard", "Détaillée"], default: "Standard" },
          tone: { type: "string", enum: ["Professionnel direct", "Institutionnel", "Dynamique"], default: "Professionnel direct" },
          styleCorpus: { type: "string", maxLength: 40000, description: "Corpus complémentaire utilisé uniquement comme référence de style, jamais comme faits sur le poste." },
          modelPreference: modelPreferenceSchema,
        },
        required: ["brief"],
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations,
    },
    {
      name: "m2_build_scorecard",
      title: "Construire une scorecard structurée",
      description: "Crée une scorecard sur l’échelle 0–3 : maximum 6 questions principales pour Jeune diplômé, Opérationnel et Manager, 8 pour Direction, une par critère. Chaque critère conserve une question alternative sur les compétences transférables, facultative, avec relances, preuves et ancrages. Le rendu suit SCORECARD_STANDARD v1.0.",
      inputSchema: {
        type: "object",
        properties: {
          brief: briefSchema,
          level: { type: "string", enum: [...SCORECARD_LEVELS], default: "Opérationnel" },
          globalThreshold: { type: "number", minimum: 0, maximum: 100, default: 60 },
          criteria: { type: "array", items: { type: "string" }, maxItems: 8 },
          modelPreference: modelPreferenceSchema,
        },
        required: ["brief"],
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations,
    },
    {
      name: "m3_optimize_sourcing",
      title: "Optimiser le sourcing avec l’IA",
      description: "Analyse le brief et les retours observés pour proposer des mots-clés et des passerelles justifiées, puis rend neuf sets précis, voisins et transférables. GPT-6.1 Sol en raisonnement modéré imposé pour cette optimisation. Les axes verrouillés restent intacts. Proposition à relire avant utilisation ; aucun volume de CVthèque mesuré.",
      inputSchema: {type:"object",properties:{brief:briefSchema,criteria:{type:"array",items:{type:"string"},maxItems:3},sourcingAxes:{type:"array",maxItems:3,items:{type:"object",properties:{name:{type:"string"},exactTerms:{type:"array",items:{type:"string"},maxItems:8},locked:{type:"boolean"}},required:["name","exactTerms","locked"],additionalProperties:false}},sourcingFeedback:{type:"string",maxLength:4000},modelPreference:modelPreferenceSchema,platform:{type:"string",enum:Object.keys(sourcingPlatformHelp),default:"linkedin"}},required:["brief"],additionalProperties:false},
      annotations: readOnlyAnnotations,
    },
    {
      name: "m3_build_sourcing_strategy",
      title: "Construire une stratégie de sourcing",
      description: "Fournit neuf sets en entonnoir inverse (3 précis, 3 voisins, 3 transférables), rendus pour HelloWork, Apec, Monster, LinkedIn Recruiter et Google X-ray. Trois axes maximum, passerelles explicables et verrouillage des non négociables. Les synonymes fournis remplacent les termes exacts proposés.",
      inputSchema: {
        type: "object",
        properties: {
          criteria: { type: "array", items: { type: "string" }, minItems: 1 },
          selectedCriteria: { type: "array", items: { type: "string" }, maxItems: 3 },
          synonyms: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
          funnelOptions: {type:'object',additionalProperties:{type:'object',properties:{adjacent:{type:'array',items:{type:'string'},maxItems:8},transferable:{type:'array',items:{type:'string'},maxItems:8},locked:{type:'boolean'}},additionalProperties:false}},
          platform: {type:'string',enum:Object.keys(sourcingPlatformHelp),default:'linkedin'},
        },
        required: ["criteria"],
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations,
    },
  ];
}

function mergeBrief(value: unknown): BriefData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...emptyBrief };
  const input = value as Record<string, unknown>;
  const result = { ...emptyBrief };
  (Object.keys(result) as Array<keyof BriefData>).forEach((key) => {
    if (typeof input[key] === "string") result[key] = input[key] as string;
  });
  return result;
}

function textResult(text: string, structuredContent: unknown) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

async function callTool(name: string, rawArguments: unknown, origin: string, env: AIEnvironment, cacheNamespace?: string) {
  if(name==='purge_expired_interviews'){
    if(!env.DB)throw new Error('Stockage indisponible.');
    const deleted=await purgeExpiredInterviews(env.DB);
    const remaining=await env.DB.prepare('SELECT COUNT(*) AS total FROM interviews WHERE expires_at <= ?').bind(Date.now()).first<{total:number}>();
    return textResult('Entretiens expirés supprimés.',{deleted,remainingExpired:remaining?.total??0,checkedAt:new Date().toISOString()});
  }
  const agentTasks:Record<string,AgentTask>={m4_assist_interview:'interview',m5_review_evidence:'evaluate',m6_draft_report:'report'};
  if(agentTasks[name]){
    const args=rawArguments as {contextJson?:unknown;privacyReviewed?:unknown};
    if(!args||typeof args.contextJson!=='string'||args.contextJson.length>80000||args.privacyReviewed!==true)throw new Error('Contexte JSON et relecture de confidentialité requis.');
    const payload=JSON.parse(args.contextJson);
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Objet de contexte requis.');
    const result=await runAssessmentAgent({...payload,task:agentTasks[name],privacyReviewed:true},env,cacheNamespace);
    return textResult('Proposition à relire. Aucune note ni décision modifiée.',result);
  }
  const args = rawArguments && typeof rawArguments === "object" && !Array.isArray(rawArguments)
    ? rawArguments as Record<string, unknown>
    : {};
  if (name === "open_recruitment_intelligence") {
    return textResult(
      "L’espace de travail Recruitment Intelligence est prêt. Il couvre le cadrage du besoin, la scorecard et le sourcing.",
      { url: origin, modules: ["M1 Need Builder", "M2 Scorecard Builder", "M3 Sourcing Assistant"] },
    );
  }
  if (name === "m1_analyze_need") {
    const brief = mergeBrief(args.brief);
    const modelPreference = (["auto", "luna", "sol"].includes(String(args.modelPreference)) ? args.modelPreference : "auto") as "auto" | "luna" | "sol";
    const ai = await runRecruitmentAI({ task: "analyze", brief, modelPreference }, env, { cacheNamespace });
    return textResult(
      "Analyse IA proposée : confrontez les constats et les questions aux faits du brief avant validation.",
      { brief, analysis: ai.output, ai: aiMetadata(ai) },
    );
  }
  if (name === "m1_generate_job_ad") {
    const brief = mergeBrief(args.brief);
    const format = (["Courte", "Standard", "Détaillée"].includes(String(args.format)) ? args.format : "Standard") as "Courte" | "Standard" | "Détaillée";
    const tone = (["Professionnel direct", "Institutionnel", "Dynamique"].includes(String(args.tone)) ? args.tone : "Professionnel direct") as "Professionnel direct" | "Institutionnel" | "Dynamique";
    const modelPreference = (["auto", "luna", "sol"].includes(String(args.modelPreference)) ? args.modelPreference : "auto") as "auto" | "luna" | "sol";
    const ai = await runRecruitmentAI({ task: "offer", brief, format, tone, styleCorpus: typeof args.styleCorpus === "string" ? args.styleCorpus : "", modelPreference }, env, { cacheNamespace });
    const { sections, qualityChecks } = ai.output as { sections: JobAdSection[]; qualityChecks: QualityCheck[] };
    return textResult(
      `Offre ${format.toLowerCase()} générée en huit sections, avec ${qualityChecks.filter((item) => item.status !== "Conforme").length} point(s) à vérifier.`,
      { format, tone, sections, qualityChecks, ai: aiMetadata(ai) },
    );
  }
  if (name === "m2_build_scorecard") {
    const brief = mergeBrief(args.brief);
    const level = ((SCORECARD_LEVELS as readonly string[]).includes(String(args.level)) ? args.level : "Opérationnel") as JobLevel;
    const threshold = typeof args.globalThreshold === "number" ? args.globalThreshold : 60;
    const criteria = Array.isArray(args.criteria) ? args.criteria.filter((item): item is string => typeof item === "string") : [];
    const modelPreference = (["auto", "luna", "sol"].includes(String(args.modelPreference)) ? args.modelPreference : "auto") as "auto" | "luna" | "sol";
    const ai = await runRecruitmentAI({ task: "scorecard", brief, level, globalThreshold: threshold, criteria, modelPreference }, env, { cacheNamespace });
    const scorecard = ai.output as ScorecardData;
    return textResult(
      `Scorecard ${scorecard.level.toLowerCase()} créée avec ${scorecard.criteria.length} critères sur l’échelle 0–3.`,
      { ...scorecard, ai: aiMetadata(ai) },
    );
  }
  if (name === "m3_optimize_sourcing") {
    const ai=await runRecruitmentAI({task:'sourcing',brief:mergeBrief(args.brief),criteria:args.criteria??[],sourcingAxes:args.sourcingAxes??[],sourcingFeedback:args.sourcingFeedback??'',modelPreference:'sol'},env,{cacheNamespace});
    const plan=ai.output as AISourcingPlan;
    const names=plan.axes.map(axis=>axis.name);
    const strategy=buildSourcingStrategy(names,names,Object.fromEntries(plan.axes.map(axis=>[axis.name,axis.exactTerms])),Object.fromEntries(plan.axes.map(axis=>[axis.name,{adjacent:axis.adjacentTerms,transferable:axis.transferableTerms,locked:axis.locked,reason:axis.reason,verify:axis.verify}])));
    const platform=typeof args.platform==='string' && Object.hasOwn(sourcingPlatformHelp,args.platform)?args.platform as SourcingPlatform:'linkedin';
    return textResult('Proposition IA à relire : neuf sets du ciblage précis aux compétences transférables, avec sources et écarts à vérifier.',{plan,platform,funnel:{...strategy.funnel,sets:strategy.funnel.sets.map(set=>({...set,queries:{[platform]:set.queries[platform]},duplicateOf:set.duplicateOf[platform]?{[platform]:set.duplicateOf[platform]}:{}}))},ai:aiMetadata(ai)});
  }
  if (name === "m3_build_sourcing_strategy") {
    const criteria = Array.isArray(args.criteria) ? args.criteria.filter((item): item is string => typeof item === "string") : [];
    if (!criteria.length) throw new Error("Le paramètre criteria doit contenir au moins un critère professionnel.");
    const selected = Array.isArray(args.selectedCriteria) ? args.selectedCriteria.filter((item): item is string => typeof item === "string") : [];
    const rawSynonyms = args.synonyms && typeof args.synonyms === "object" && !Array.isArray(args.synonyms) ? args.synonyms as Record<string, unknown> : {};
    const synonyms = Object.fromEntries(Object.entries(rawSynonyms).map(([key, value]) => [key, Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []]));
    const rawFunnel=args.funnelOptions && typeof args.funnelOptions==='object' && !Array.isArray(args.funnelOptions)?args.funnelOptions as Record<string,unknown>:{};
    const funnelOptions:FunnelOverrides={};
    for(const [key,value] of Object.entries(rawFunnel)) if(value && typeof value==='object' && !Array.isArray(value)) {
      const item=value as Record<string,unknown>;
      const terms=(value:unknown)=>Array.isArray(value)?value.filter((t):t is string=>typeof t==='string').slice(0,8):undefined;
      funnelOptions[key]={adjacent:terms(item.adjacent),transferable:terms(item.transferable),locked:item.locked===true};
    }
    const strategy = buildSourcingStrategy(criteria, Array.isArray(args.selectedCriteria) ? selected : undefined, synonyms, funnelOptions);
    const platform=typeof args.platform==='string' && Object.hasOwn(sourcingPlatformHelp,args.platform)?args.platform as SourcingPlatform:'linkedin';
    // Return one rendering per call instead of repeating the nine strings for every engine.
    const rendered={...strategy,platform,queries:strategy.platforms[platform].queries,platforms:{[platform]:strategy.platforms[platform]},
      funnel:{...strategy.funnel,sets:strategy.funnel.sets.map(set=>({...set,queries:{[platform]:set.queries[platform]},duplicateOf:set.duplicateOf[platform]?{[platform]:set.duplicateOf[platform]}:{}}))}};
    return textResult(
      `Stratégie créée avec ${strategy.selected.length} axe(s) et neuf sets, du ciblage précis aux compétences transférables.`,
      rendered,
    );
  }
  throw new Error(`Outil inconnu : ${name}`);
}

function aiMetadata({ output: _output, ...metadata }: AIEnvelope) { return metadata; }

function widgetHtml(origin: string) {
  const siteUrl = `${origin}/?embed=1`;
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Recruitment Intelligence</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f4f6f9;font-family:Inter,system-ui,sans-serif;color:#0f172a}
    .shell{position:relative;width:100%;height:100%}.frame{width:100%;height:100%;border:0;background:#f4f6f9}
    .fallback{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:#f4f6f9;z-index:-1}.card{max-width:520px;border:1px solid #e2e8f0;border-radius:18px;background:white;padding:28px;box-shadow:0 12px 40px rgba(15,23,42,.08)}
    h1{font-size:22px;margin:0 0 10px}p{font-size:14px;line-height:1.6;color:#64748b;margin:0 0 18px}a{display:inline-flex;border-radius:11px;background:#0f172a;color:white;padding:11px 16px;text-decoration:none;font-size:14px;font-weight:650}
  </style>
</head>
<body>
  <div class="shell">
    <div class="fallback"><div class="card"><h1>Recruitment Intelligence</h1><p>Du cadrage du besoin à l’entretien, l’évaluation et au compte rendu manager.</p><a href="${siteUrl}" target="_blank" rel="noreferrer">Ouvrir l’application</a></div></div>
    <iframe class="frame" title="Recruitment Intelligence" src="${siteUrl}" allow="clipboard-write"></iframe>
  </div>
  <script>
    if (window.openai && typeof window.openai.setOpenInAppUrl === "function") {
      window.openai.setOpenInAppUrl({ href: "${siteUrl}" });
    }
  </script>
</body>
</html>`;
}

function rpcSuccess(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

async function handleRpc(message: JsonRpcRequest, origin: string, env: AIEnvironment, cacheNamespace?: string) {
  const id = message.id ?? null;
  try {
    switch (message.method) {
      case "initialize": {
        const requested = message.params?.protocolVersion;
        return rpcSuccess(id, {
          protocolVersion: typeof requested === "string" ? requested : PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
          serverInfo: {
            name: SERVER_NAME,
            title: "Recruitment Intelligence",
            version: SERVER_VERSION,
            icons: [{ src: `${origin}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
          },
          instructions: "Utilisez M1 pour clarifier le besoin avant M2 et M3. Ne présentez jamais une suggestion comme une décision. Signalez les informations manquantes, les incertitudes et les paramètres internes.",
        });
      }
      case "ping":
        return rpcSuccess(id, {});
      case "tools/list":
        return rpcSuccess(id, { tools: tools(origin) });
      case "tools/call": {
        const name = message.params?.name;
        if (typeof name !== "string") return rpcError(id, -32602, "Le nom de l’outil est obligatoire.");
        const result = await callTool(name, message.params?.arguments, origin, env, cacheNamespace);
        return rpcSuccess(id, result);
      }
      case "resources/list":
        return rpcSuccess(id, {
          resources: [{
            uri: UI_RESOURCE_URI,
            name: "Recruitment Intelligence Workspace",
            title: "Recruitment Intelligence",
            description: "Interface graphique des modules M1 à M6.",
            mimeType: "text/html;profile=mcp-app",
          }],
        });
      case "resources/templates/list":
        return rpcSuccess(id, { resourceTemplates: [] });
      case "resources/read": {
        if (message.params?.uri !== UI_RESOURCE_URI) return rpcError(id, -32002, "Ressource introuvable.");
        return rpcSuccess(id, {
          contents: [{
            uri: UI_RESOURCE_URI,
            mimeType: "text/html;profile=mcp-app",
            text: widgetHtml(origin),
            _meta: {
              ui: {
                prefersBorder: false,
                domain: origin,
                csp: {
                  connectDomains: [origin],
                  resourceDomains: [origin],
                  frameDomains: [origin],
                },
              },
              "openai/ui": {
                preferredDisplayMode: "fullscreen",
                availableDisplayModes: ["fullscreen", "inline"],
              },
            },
          }],
        });
      }
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      default:
        return rpcError(id, -32601, `Méthode non prise en charge : ${message.method}`);
    }
  } catch (error) {
    return rpcError(id, -32602, error instanceof Error ? error.message : "Paramètres invalides.");
  }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization, mcp-protocol-version, mcp-session-id",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

export async function handleMcpRequest(request: Request, env: AIEnvironment): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, mcp-protocol-version, mcp-session-id", "access-control-allow-methods": "POST, OPTIONS" } });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, "Corps JSON invalide."), 400);
  }
  const origin = new URL(request.url).origin;
  const messages = Array.isArray(payload) ? payload : [payload];
  const userId = request.headers.get("oai-authenticated-user-id") || undefined;
  if (messages.some(item => item?.method === "tools/call" && !['open_recruitment_intelligence','purge_expired_interviews'].includes(item?.params?.name)) && !userId) {
    return jsonResponse({ error: "Connectez-vous avec ChatGPT pour utiliser les outils métier." }, 401);
  }
  if (messages.filter(item => item?.method === "tools/call").length > 1) return jsonResponse({ error: "Une génération à la fois." }, 429);
  if (Array.isArray(payload)) {
    const responses = (await Promise.all(payload.map((item) => item && typeof item === "object" ? handleRpc(item as JsonRpcRequest, origin, env, userId) : rpcError(null, -32600, "Requête invalide.")))).filter(Boolean);
    return responses.length ? jsonResponse(responses) : new Response(null, { status: 202 });
  }
  if (!payload || typeof payload !== "object") return jsonResponse(rpcError(null, -32600, "Requête invalide."), 400);
  const message = payload as JsonRpcRequest;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return jsonResponse(rpcError(message.id ?? null, -32600, "Requête JSON-RPC invalide."), 400);
  const response = await handleRpc(message, origin, env, userId);
  return response ? jsonResponse(response) : new Response(null, { status: 202 });
}
