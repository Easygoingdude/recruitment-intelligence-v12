"use client";

import {applyOfferSection} from '@/lib/offer-section';
import {workspaceSchema,type RecruitmentJob,type WorkspaceSnapshot} from '@/lib/jobs';
import { applyImportedNeed, matchesNeed, isScorecardCurrent, scorecardExportContext } from '@/lib/need-state';
import { SCORECARD_DIMENSIONS, reviewScorecardProfile, scorecardWeights } from '@/lib/scorecard-profiles';
import { suggestSearchTerms } from '@/lib/sourcing-queries';
import { SourcingFunnelView } from '@/components/sourcing-funnel-view';
import { ScorecardCriteriaList } from '@/components/scorecard-criteria-list';
import { moveCriterion } from '@/lib/scorecard-order';
import { scorecardCriterionLimit } from '@/lib/recruitment-engine';
import { SourcingAIPanel } from '@/components/sourcing-ai-panel';
import { AssessmentWorkspace } from '@/components/assessment-workspace';
import type { FunnelDraft } from '@/lib/sourcing-funnel';

import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Copy,
  Download,
  FileSearch,
  FileText,
  LayoutDashboard,
  Menu,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  SCORECARD_LEVELS,
  analyzeBrief,
  buildScorecard,
  buildSourcingStrategy,
  checkJobAd,
  emptyBrief,
  splitItems,
  type BriefData,
  type JobAdSection,
  type JobLevel,
  type QualityCheck,
  type ScorecardCriterion,
  type ScorecardData,
} from "@/lib/recruitment-engine";
import type { AIAnalysis, AIEnvelope, AIModelPreference, AIRequest, AITask, AISourcingPlan } from "@/lib/ai-contract";
import {
  AI_PROMPT_VERSION,
  AI_RESULT_CACHE_VERSION,
  BROWSER_RESULT_CACHE_TTL_MS,
  MAX_BROWSER_RESULT_CACHE_ENTRIES,
  createAIResultCacheKey,
} from "@/lib/ai-cache";

export type ModuleId = "dashboard" | "candidates" | "agenda" | "m1" | "m2" | "m3" | "m4" | "m5" | "m6";
type M1View = "brief" | "analysis" | "offer";
type Provenance = "Extrait de l’offre" | "Renseigné au kick-off" | "Validé" | "À compléter";
type AIRun = Omit<AIEnvelope, "output"> & { accepted: boolean; briefSnapshot: string };

const STORAGE_KEY = "recruitment-intelligence-v12";
const RESULT_CACHE_STORAGE_KEY = "recruitment-intelligence-v12-ai-results";

type BrowserResultCacheEntry = { expiresAt: number; envelope: AIEnvelope };
type BrowserResultCacheStore = { version: string; entries: Record<string, BrowserResultCacheEntry> };

function readBrowserResultCache(key: string): BrowserResultCacheEntry | null {
  try {
    const raw = localStorage.getItem(RESULT_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrowserResultCacheStore;
    if (parsed.version !== AI_RESULT_CACHE_VERSION || !parsed.entries) return null;
    const now = Date.now();
    const validEntries = Object.fromEntries(Object.entries(parsed.entries).filter(([, entry]) => entry.expiresAt > now));
    if (Object.keys(validEntries).length !== Object.keys(parsed.entries).length) {
      localStorage.setItem(RESULT_CACHE_STORAGE_KEY, JSON.stringify({ version: AI_RESULT_CACHE_VERSION, entries: validEntries }));
    }
    return validEntries[key] ?? null;
  } catch {
    localStorage.removeItem(RESULT_CACHE_STORAGE_KEY);
    return null;
  }
}

function writeBrowserResultCache(key: string, envelope: AIEnvelope) {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(RESULT_CACHE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as BrowserResultCacheStore : null;
    const current = parsed?.version === AI_RESULT_CACHE_VERSION && parsed.entries ? parsed.entries : {};
    const entries = Object.fromEntries(Object.entries(current).filter(([, entry]) => entry.expiresAt > now));
    entries[key] = { expiresAt: now + BROWSER_RESULT_CACHE_TTL_MS, envelope };
    const limited = Object.fromEntries(Object.entries(entries).sort(([, left], [, right]) => right.expiresAt - left.expiresAt).slice(0, MAX_BROWSER_RESULT_CACHE_ENTRIES));
    localStorage.setItem(RESULT_CACHE_STORAGE_KEY, JSON.stringify({ version: AI_RESULT_CACHE_VERSION, entries: limited }));
  } catch {
    // Le cache est une optimisation : un quota navigateur ne doit jamais bloquer le dossier.
  }
}

const briefSteps: Array<{
  title: string;
  description: string;
  fields: Array<{
    key: keyof BriefData;
    label: string;
    placeholder: string;
    rows?: number;
    hint?: string;
  }>;
}> = [
  {
    title: "Contexte et besoin",
    description: "Clarifier la raison réelle du recrutement avant de définir le profil.",
    fields: [
      { key: "roleTitle", label: "Intitulé du poste", placeholder: "Ex. Responsable Support Utilisateurs", rows: 1 },
      { key: "recruitmentReason", label: "Pourquoi recrutons-nous ?", placeholder: "Création, remplacement, transformation, surcharge…" },
      { key: "consequences", label: "Que se passe-t-il si nous ne recrutons pas ?", placeholder: "Impacts opérationnels, risques, délais…" },
      { key: "alternatives", label: "Quelles alternatives ont été envisagées ?", placeholder: "Réorganisation, prestation, mobilité interne…" },
    ],
  },
  {
    title: "Objectifs et succès",
    description: "Décrire les résultats attendus, pas seulement les activités.",
    fields: [
      { key: "goals3", label: "Résultats attendus à 3 mois", placeholder: "Ce qui doit être compris, pris en main ou stabilisé…" },
      { key: "goals6", label: "Résultats attendus à 6 mois", placeholder: "Résultats intermédiaires observables…" },
      { key: "goals12", label: "Résultats attendus à 12 mois", placeholder: "Impact durable et niveau d’autonomie attendu…" },
    ],
  },
  {
    title: "Indicateurs de performance",
    description: "Définir comment la réussite sera observée et mesurée.",
    fields: [
      { key: "indicators", label: "Indicateurs et preuves observables", placeholder: "Un indicateur par ligne : délai, qualité, adoption, disponibilité…", rows: 7 },
    ],
  },
  {
    title: "Missions et priorités",
    description: "Distinguer le cœur du poste des activités secondaires.",
    fields: [
      { key: "missions", label: "3 à 5 missions principales", placeholder: "Une mission par ligne", rows: 7 },
      { key: "priorities", label: "Projets ou problèmes prioritaires", placeholder: "Ce que la personne devra résoudre en premier", rows: 6 },
      { key: "allocation", label: "Répartition indicative", placeholder: "Ex. 50 % pilotage, 30 % management, 20 % amélioration continue" },
    ],
  },
  {
    title: "Environnement de travail",
    description: "Documenter les conditions concrètes d’exercice du poste.",
    fields: [
      { key: "tools", label: "Outils et technologies", placeholder: "Un environnement par ligne" },
      { key: "methods", label: "Méthodes et processus", placeholder: "ITIL, Agile, cycle en V, rituels…" },
      { key: "interactions", label: "Interactions clés", placeholder: "Équipes, clients internes, direction, partenaires…" },
      { key: "management", label: "Management", placeholder: "Rattachement, équipe encadrée, pratiques managériales…" },
      { key: "autonomy", label: "Autonomie et marge de décision", placeholder: "Décisions attendues, validations nécessaires…" },
      { key: "location", label: "Localisation", placeholder: "Site principal et périmètre géographique", rows: 1 },
      { key: "remote", label: "Télétravail et présence", placeholder: "Ex. 2 jours de télétravail après intégration", rows: 1 },
      { key: "mobility", label: "Déplacements", placeholder: "Fréquence, durée et destinations", rows: 1 },
    ],
  },
  {
    title: "Persona candidat",
    description: "Identifier des signaux utiles sans enfermer la recherche dans un parcours unique.",
    fields: [
      { key: "persona", label: "Parcours et environnements pertinents", placeholder: "Expériences transférables, contextes comparables, niveau de responsabilité…", rows: 8 },
    ],
  },
  {
    title: "Compétences",
    description: "Classer strictement ce qui est nécessaire, utile ou apprenable.",
    fields: [
      { key: "mustHave", label: "Indispensable", placeholder: "Une compétence réellement indispensable par ligne", rows: 6 },
      { key: "important", label: "Important", placeholder: "Compétences utiles à la réussite, sans être éliminatoires", rows: 5 },
      { key: "niceToHave", label: "Nice-to-have", placeholder: "Atouts complémentaires ou compétences apprenables", rows: 5 },
    ],
  },
  {
    title: "Soft skills",
    description: "Partir de situations professionnelles et de comportements observables.",
    fields: [
      { key: "difficultSituations", label: "Situations difficiles du poste", placeholder: "Arbitrage, désaccord, urgence, changement, ambiguïté…", rows: 6 },
      { key: "softSkills", label: "Comportements attendus", placeholder: "Un comportement observable par ligne", rows: 6 },
    ],
  },
  {
    title: "Critères éliminatoires",
    description: "Limiter cette catégorie aux impossibilités réelles.",
    fields: [
      { key: "eliminatory", label: "Éléments réellement disqualifiants", placeholder: "Écrire « Aucun » si aucun critère n’est réellement éliminatoire", rows: 7 },
    ],
  },
  {
    title: "Attractivité et package",
    description: "Rendre visibles les contreparties, les contraintes et les conditions concrètes.",
    fields: [
      { key: "assets", label: "Ce que le poste apporte", placeholder: "Périmètre, apprentissage, impact, ressources…" },
      { key: "constraints", label: "Contraintes et réalités du poste", placeholder: "Complexité, horaires, maturité, changements, astreintes…" },
      { key: "salary", label: "Rémunération", placeholder: "Fourchette, variable, statut…", rows: 1 },
      { key: "benefits", label: "Avantages validés", placeholder: "Uniquement les éléments confirmés" },
      { key: "schedule", label: "Horaires et organisation", placeholder: "Horaires, astreintes, flexibilité…", rows: 1 },
      { key: "team", label: "Équipe", placeholder: "Taille, organisation et principaux interlocuteurs", rows: 1 },
      { key: "recruitmentProcess", label: "Étapes du recrutement", placeholder: "Ex. entretien RH, manager, cas pratique", rows: 1 },
    ],
  },
];

const moduleNav: Array<{ id: ModuleId; label: string; short: string; icon: typeof LayoutDashboard }> = [
  { id:'dashboard',short:'',label:'Postes',icon:LayoutDashboard },
  { id: 'candidates', short:'', label:'Candidatures', icon:ClipboardCheck },
  { id: 'agenda', short:'', label:'Agenda', icon:FileText },
  { id: "m1", label: "Besoin et offre", short: "M1", icon: FileSearch },
  { id: "m2", label: "Scorecard", short: "M2", icon: ClipboardCheck },
  { id: "m3", label: "Sourcing", short: "M3", icon: Search },
  { id: "m4", label: "Entretien", short: "M4", icon: FileText },
  { id: "m5", label: "Evaluation et décision", short: "M5", icon: CheckCircle2 },
  { id: "m6", label: "Compte rendu", short: "M6", icon: Download },
];

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "accent" }) {
  const tones = {
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    accent: "border-indigo-200 bg-indigo-50 text-indigo-700",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] ${className}`}>{children}</section>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  provenance,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  provenance?: Provenance;
  hint?: string;
}) {
  const isSingle = rows === 1;
  return (
    <label className="block">
      <span className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        {provenance && <Badge tone={provenance === "Extrait de l’offre" ? "accent" : provenance === "Validé" ? "success" : "neutral"}>{provenance}</Badge>}
      </span>
      {isSingle ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="field-control h-11"
        />
      ) : (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="field-control resize-y"
        />
      )}
      {hint && <span className="mt-1.5 block text-xs leading-5 text-slate-500">{hint}</span>}
    </label>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
      <Circle className="mb-4 h-9 w-9 text-slate-300" strokeWidth={1.5} />
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function copyText(text: string) {
  return navigator.clipboard.writeText(text);
}

function safeFileName(value: string) {
  return (value || "recrutement").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export type WorkspaceControls={busy:boolean;flush:()=>Promise<void>;navigate:(module:ModuleId,view?:M1View)=>void};
export default function RecruitmentIntelligenceApp({job,dashboard,onSave,registerControls,jobSelector,newPost,interviews,appointments,requestedAppointmentId,candidateDashboard,agendaDashboard,applicationStore,initialModule='m1',initialView='brief',storageError}:{storageError?:string;candidateDashboard:ReactNode;agendaDashboard:ReactNode;applicationStore:ReturnType<typeof import('./use-applications').useApplications>;initialModule?:ModuleId;initialView?:'brief'|'offer';job:RecruitmentJob|null;dashboard:ReactNode;onSave:(snapshot:WorkspaceSnapshot)=>Promise<void>;registerControls:(controls:WorkspaceControls)=>void;jobSelector:ReactNode;newPost:()=>void;interviews:ReturnType<typeof import('./use-interview-storage').useInterviewStorage>;appointments:import('@/lib/appointments').Appointment[];requestedAppointmentId?:string}) {
  const [activeModule, setActiveModule] = useState<ModuleId>(job?(requestedAppointmentId&&initialModule==='m1'?'m4':initialModule):'dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [brief, setBrief] = useState<BriefData>(emptyBrief);
  const [provenance, setProvenance] = useState<Partial<Record<keyof BriefData, Provenance>>>({});
  const [briefStep, setBriefStep] = useState(0);
  const [m1View, setM1View] = useState<M1View>(initialView);
  const [entryMode, setEntryMode] = useState<"create" | "import">("create");
  const [importAsNew, setImportAsNew] = useState(true);
  const [needNotice, setNeedNotice] = useState("");
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [jobFormat, setJobFormat] = useState<"Courte" | "Standard" | "Détaillée">("Standard");
  const [jobTone, setJobTone] = useState<"Professionnel direct" | "Institutionnel" | "Dynamique">("Professionnel direct");
  const [jobAd, setJobAd] = useState<JobAdSection[]>([]);
  const [qualityChecks, setQualityChecks] = useState<QualityCheck[]>([]);
  const [level, setLevel] = useState<JobLevel>("Opérationnel");
  const [threshold, setThreshold] = useState(60);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [activeCriterion, setActiveCriterion] = useState<string>("");
  const [sourcingSelected, setSourcingSelected] = useState<string[]>([]);
  const [synonyms, setSynonyms] = useState<Record<string, string>>({});
  const [funnelDraft,setFunnelDraft] = useState<FunnelDraft>({});
  const [sourcingFeedback,setSourcingFeedback]=useState('');
  const [sourcingProposal,setSourcingProposal]=useState<{plan:AISourcingPlan;basis:string}|null>(null);
  const [savedAt, setSavedAt] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [styleCorpus, setStyleCorpus] = useState("");
  const [modelPreference, setModelPreference] = useState<AIModelPreference>("auto");
  const [aiBusy, setAiBusy] = useState<AITask | null>(null);
  const [aiError, setAiError] = useState("");
  const [scorecardConfirm,setScorecardConfirm]=useState(false);
  const [scorecardStatus,setScorecardStatus]=useState("");
  const [offerPdfDownload,setOfferPdfDownload]=useState<{url:string;name:string}|null>(null);
  useEffect(()=>()=>{if(offerPdfDownload)URL.revokeObjectURL(offerPdfDownload.url);},[offerPdfDownload]);
  useEffect(()=>{setOfferPdfDownload(null);},[jobAd]);
  const [sectionProposal,setSectionProposal]=useState<{section:JobAdSection;basisBody:string;briefSnapshot:string}|null>(null);
  const [offerPdfBusy,setOfferPdfBusy]=useState(false);
  const [offerPdfError,setOfferPdfError]=useState("");
  const [excelDownload,setExcelDownload]=useState<{url:string;name:string;roleTitle:string;archived:boolean}|null>(null);
  useEffect(()=>()=>{if(excelDownload)URL.revokeObjectURL(excelDownload.url);},[excelDownload]);
  useEffect(()=>{setExcelDownload(null);},[scorecard,brief,level,threshold]);
  const [exportBusy, setExportBusy] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiRuns, setAiRuns] = useState<Partial<Record<AITask, AIRun>>>({});
  const [importEvidence, setImportEvidence] = useState<Partial<Record<keyof BriefData, string>>>({});
  const aiRequestActive = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const scorecardStale = !!scorecard && !isScorecardCurrent(scorecard,brief,level,aiRuns.scorecard?.briefSnapshot);

  const analysis = useMemo(() => analyzeBrief(brief), [brief]);
  const availableCriteria = useMemo(() => {
    const values = [
      ...sourcingSelected,
      brief.roleTitle,
      ...brief.tools.split(/[,;\n]/).map(item => item.trim()).filter(Boolean),
      ...(scorecard?.criteria.map((item) => item.criterion) ?? []),
      ...splitItems(brief.mustHave),
      ...splitItems(brief.important),
      ...splitItems(brief.softSkills),
    ];
    return values.filter((item, index) => item && values.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index);
  }, [brief, scorecard, sourcingSelected]);
  const sourcing = useMemo(
    () => buildSourcingStrategy(
      availableCriteria,
      sourcingSelected,
      Object.fromEntries(Object.entries(synonyms).map(([key, value]) => [key, splitItems(value)])),
      Object.fromEntries(Object.entries(funnelDraft).map(([key,value])=>[key,{adjacent:value.adjacent===undefined?undefined:splitItems(value.adjacent),transferable:value.transferable===undefined?undefined:splitItems(value.transferable),locked:value.locked,reason:value.reason,verify:value.verify}])),
    ),
    [availableCriteria, sourcingSelected, synonyms, funnelDraft],
  );

  const saveHandler=useRef(onSave);saveHandler.current=onSave;
  const assessmentControls=useRef<{busy:boolean;flush:()=>Promise<void>}>({busy:false,flush:async()=>{}});
  const lastSaved=useRef(''),saveQueue=useRef<Promise<void>>(Promise.resolve());
  const snapshot={brief,provenance,jobAd,qualityChecks,scorecard,level,threshold,sourcingSelected,synonyms,funnelDraft,sourcingFeedback,sourcingProposal,styleCorpus,modelPreference,aiAnalysis,aiRuns,importEvidence,jobFormat,jobTone};
  const snapshotJson=JSON.stringify(snapshot);const latestSnapshot=useRef(snapshotJson);latestSnapshot.current=snapshotJson;
  useEffect(()=>{
    const data=job?.workspace??workspaceSchema.parse({});
        if (data.brief) setBrief({ ...emptyBrief, ...data.brief });
        if (data.provenance) setProvenance(data.provenance);
        const restoredBrief={...emptyBrief,...data.brief};
        const currentOffer=matchesNeed(data.aiRuns?.offer?.briefSnapshot,restoredBrief);
        if (data.jobAd && currentOffer) setJobAd(data.jobAd);
        if (data.qualityChecks && currentOffer) setQualityChecks(data.qualityChecks);
        if (data.jobAd?.length && !currentOffer) setNeedNotice("L’ancienne offre ne correspond pas au brief actuel. Générez une nouvelle offre.");
        if (data.scorecard) setScorecard(data.scorecard);
        if(SCORECARD_LEVELS.includes(data.level))setLevel(data.level);
        if (typeof data.threshold === "number") setThreshold(data.threshold);
        if (data.sourcingSelected) setSourcingSelected(data.sourcingSelected);
        if (data.synonyms) setSynonyms(data.synonyms);
        if (data.funnelDraft) setFunnelDraft(data.funnelDraft);
        if(typeof data.sourcingFeedback==='string') setSourcingFeedback(data.sourcingFeedback);
        if(data.sourcingProposal) setSourcingProposal(data.sourcingProposal);
        if (typeof data.styleCorpus === "string") setStyleCorpus(data.styleCorpus);
        if (["auto", "luna", "sol"].includes(data.modelPreference)) setModelPreference(data.modelPreference);
        if (data.aiAnalysis && matchesNeed(data.aiRuns?.analyze?.briefSnapshot,restoredBrief)) setAiAnalysis(data.aiAnalysis);
        if (data.aiRuns) setAiRuns(data.aiRuns);
        if (data.importEvidence) setImportEvidence(data.importEvidence);
        setJobFormat(data.jobFormat);setJobTone(data.jobTone);

    lastSaved.current=JSON.stringify(data);setLoaded(true);
    // A keyed workspace restores only its own initial snapshot.
  },[]);
  async function flushWorkspace(){
    if(!job||!loaded)return;
    const submitted=latestSnapshot.current;
    const work=saveQueue.current.catch(()=>undefined).then(async()=>{
      if(submitted===lastSaved.current)return;
      await saveHandler.current(workspaceSchema.parse(JSON.parse(submitted)));
      lastSaved.current=submitted;setSavedAt(new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}));
    });saveQueue.current=work;return work;
  }
  useEffect(()=>{if(!job||!loaded)return;setSavedAt(snapshotJson===lastSaved.current?'À jour':'');const timer=window.setTimeout(()=>{void flushWorkspace().catch(e=>setAiError(e instanceof Error?e.message:'Enregistrement impossible.'));},500);return()=>window.clearTimeout(timer);},[snapshotJson,loaded,job?.id]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(job&&latestSnapshot.current!==lastSaved.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[job?.id]);
  registerControls({busy:!!aiBusy||importBusy||exportBusy||offerPdfBusy||assessmentControls.current.busy,flush:async()=>{if(aiRequestActive.current||assessmentControls.current.busy)throw new Error('Attendez la fin du traitement avant de changer de poste.');await flushWorkspace();await assessmentControls.current.flush();},navigate:(module,view)=>{if(view)setM1View(view);navigate(module);}});

  useEffect(() => {
    if (scorecard?.criteria.length && !activeCriterion) setActiveCriterion(scorecard.criteria[0].id);
  }, [activeCriterion, scorecard]);

  const navigationActive=useRef(false);
  const navigate = async (module: ModuleId) => {
    if(navigationActive.current)return;
    if(aiRequestActive.current||assessmentControls.current.busy){setAiError('Attendez la fin du traitement avant de changer d’écran.');return;}
    navigationActive.current=true;
    try{await flushWorkspace();await assessmentControls.current.flush();}catch(e){setAiError((e as Error).message);return;}finally{navigationActive.current=false;}
    if(!job&&!['dashboard','candidates','agenda'].includes(module)){setActiveModule('dashboard');return;}
    setActiveModule(module);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const invalidateNeedOutputs = (newNeed=false) => {
    setJobAd([]); setQualityChecks([]); setAiAnalysis(null); setAiError("");
    setScorecardConfirm(false);setScorecardStatus("");setOfferPdfError("");setOfferPdfDownload(null);
    setAiRuns(current=>newNeed?{}:{...current,analyze:undefined,offer:undefined});
    setNeedNotice("Le besoin a changé. Relancez l’analyse et la génération de l’offre à partir du brief actualisé.");
    if(newNeed){
      setScorecard(null);setActiveCriterion("");setSourcingSelected([]);setSynonyms({});
      setFunnelDraft({});setSourcingFeedback('');setSourcingProposal(null);
    }
  };

  const startNewNeed = () => newPost();

  const updateBrief = (key: keyof BriefData, value: string) => {
    if(brief[key]!==value)invalidateNeedOutputs();
    setBrief((current) => ({ ...current, [key]: value }));
    setProvenance((current) => ({ ...current, [key]: value.trim() ? "Renseigné au kick-off" : "À compléter" }));
    setImportEvidence((current) => ({ ...current, [key]: undefined }));
  };

  const requestAI = async <T,>(input: AIRequest, options: { refresh?: boolean } = {}): Promise<AIEnvelope<T> | null> => {
    if (aiRequestActive.current) return null;
    aiRequestActive.current = true;
    setAiBusy(input.task);
    setAiError("");
    try {
      const payload: AIRequest = {
        ...input,
        modelPreference: input.task === 'sourcing' ? 'sol' : modelPreference,
        resultCacheMode: options.refresh ? "refresh" : "prefer",
        ...(input.task === "offer" ? { styleCorpus } : {}),
      };
      const cacheKey = await createAIResultCacheKey(payload, "browser");
      if (cacheKey && !options.refresh) {
        const cached = readBrowserResultCache(cacheKey);
        if (cached) {
          const result = structuredClone(cached.envelope) as AIEnvelope<T>;
          result.cache = { hit: true, layer: "browser", keyVersion: AI_RESULT_CACHE_VERSION, reusedAt: new Date().toISOString(), expiresAt: new Date(cached.expiresAt).toISOString() };
          if (result.optimization) result.optimization.harness.modelCalls = 0;
          const { output: _output, ...metadata } = result;
          setAiRuns(current => ({ ...current, [input.task]: { ...metadata, accepted: false, briefSnapshot: JSON.stringify(brief) } }));
          return result;
        }
      }
      const response = await fetch("/api/ai", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(115000),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) throw new Error("La session a expiré ou le serveur est indisponible. Ouvrez l’application dans un nouvel onglet et reconnectez-vous, puis réessayez.");
      const result = await response.json() as AIEnvelope<T> & { error?: string };
      if (!response.ok) throw new Error(result.error || "La génération a échoué. Vos données sont conservées.");
      if (result.status !== "AI_PROPOSED" || !result.output) throw new Error("Réponse IA non exploitable. Vos données sont conservées.");
      if (cacheKey) writeBrowserResultCache(cacheKey, result);
      const { output: _output, ...metadata } = result as AIEnvelope<T>;
      setAiRuns(current => ({ ...current, [input.task]: { ...metadata, accepted: false, briefSnapshot: JSON.stringify(brief) } }));
      return result as AIEnvelope<T>;
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "La génération IA a échoué. Vos données sont conservées.");
      return null;
    } finally {
      aiRequestActive.current = false;
      setAiBusy(null);
    }
  };

  const analyzeWithAI = async () => {
    const result = await requestAI<AIAnalysis>({ task: "analyze", brief });
    if (result) { setAiAnalysis(result.output); setM1View("analysis"); }
  };

  const validateCurrentStep = () => {
    const keys = briefSteps[briefStep].fields.map((field) => field.key);
    setProvenance((current) => {
      const next = { ...current };
      keys.forEach((key) => {
        next[key] = brief[key].trim() ? "Validé" : "À compléter";
      });
      return next;
    });
  };

  const applyImport = async () => {
    if (!importText.trim()) {
      setImportError("Ajoutez un document ou collez le texte de l’offre avant l’extraction.");
      return;
    }
    if (Object.values(brief).some(value => value.trim()) && !window.confirm(importAsNew ? "Importer un nouveau besoin ? Le brief précédent, y compris les champs validés, l’offre, la scorecard et le sourcing seront remplacés après une extraction réussie. Exportez les éléments à conserver avant de continuer." : "Mettre à jour ce besoin ? Les champs validés seront conservés ; l’analyse et l’offre devront être régénérées.")) return;
    const result = await requestAI<{ fields: Array<{ key: keyof BriefData; value: string; excerpt: string }> }>({ task: "import", sourceText: importText, sourceName: importName || "Texte collé" });
    if (!result) return;
    const imported=applyImportedNeed(brief,provenance,result.output.fields,importAsNew);
    if(!imported.fields.length){setImportError("Aucun champ exploitable à appliquer. Le dossier actuel est conservé.");return;}
    const fields=imported.fields;
    invalidateNeedOutputs(importAsNew);
    setBrief(imported.brief);
    setImportEvidence(current => ({ ...(importAsNew?{}:current), ...Object.fromEntries(fields.map(item => [item.key, item.excerpt])) }));
    setProvenance((current) => {
      const next = { ...(importAsNew?{}:current) };
      fields.forEach(item => { next[item.key] = "Extrait de l’offre"; });
      return next;
    });
    setEntryMode("create");
    setBriefStep(0);
    setImportError("");
  };

  const readFile = async (file: File) => {
    setImportBusy(true);
    setImportError("");
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error("Le document dépasse 15 Mo. Utilisez une version allégée ou collez le texte utile.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      let text = "";
      if (extension === "txt" || extension === "md") {
        text = await file.text();
      } else if (extension === "docx") {
        const mammothModule = await import("mammoth");
        const mammoth = mammothModule.default ?? mammothModule;
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        text = result.value;
      } else if (extension === "pdf") {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const pages: string[] = [];
        for (let index = 1; index <= pdf.numPages; index += 1) {
          const page = await pdf.getPage(index);
          const content = await page.getTextContent();
          pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        }
        text = pages.join("\n");
      } else {
        throw new Error("Format non pris en charge. Utilisez PDF, DOCX, TXT ou Markdown.");
      }
      setImportName(file.name);
      setImportText(text);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Le document n’a pas pu être lu.");
    } finally {
      setImportBusy(false);
    }
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
  };

  const generateOffer = async () => {
    if (jobAd.length && !window.confirm("Remplacer l’offre actuelle, y compris vos modifications, par une nouvelle proposition IA ?")) return;
    const result = await requestAI<{ sections: JobAdSection[]; qualityChecks: QualityCheck[] }>({ task: "offer", brief, format: jobFormat, tone: jobTone }, { refresh: jobAd.length > 0 });
    if (!result) return;
    setNeedNotice("");
    setJobAd(result.output.sections);
    setQualityChecks(result.output.qualityChecks);
    setM1View("offer");
  };

  const regenerateSection=async(id:string)=>{
    const section=jobAd.find(s=>s.id===id);if(!section)return;
    const result=await requestAI<{sections:JobAdSection[]}>({task:'offer',brief,format:jobFormat,tone:jobTone,sectionId:id as NonNullable<AIRequest['sectionId']>,sourceText:section.body});
    if(result?.output.sections.length===1&&result.output.sections[0].id===id)setSectionProposal({section:result.output.sections[0],basisBody:section.body,briefSnapshot:JSON.stringify(brief)});
  };
  const acceptSection=()=>{if(!sectionProposal)return;try{if(sectionProposal.briefSnapshot!==JSON.stringify(brief))throw new Error('Le besoin a changé depuis la proposition.');const next=applyOfferSection(jobAd,sectionProposal.section,sectionProposal.basisBody);setJobAd(next);setQualityChecks(checkJobAd(brief,next));setSectionProposal(null);}catch(e){setAiError((e as Error).message);}};
  const exportOfferPdf = async () => {
    if(!jobAd.length || offerPdfBusy)return;
    setOfferPdfBusy(true);setOfferPdfError("");
    try{
      if(!matchesNeed(aiRuns.offer?.briefSnapshot,brief))throw new Error("Le besoin a changé : régénérez l’offre avant l’export PDF.");
      const {buildOfferPdf}=await import('@/lib/offer-pdf');
      const responses=await Promise.all(['/fonts/DejaVuSans.ttf','/fonts/DejaVuSans-Bold.ttf'].map(url=>fetch(url,{credentials:'same-origin'})));
      if(responses.some(response=>!response.ok))throw new Error("Impossible de charger les polices du PDF. Réessayez après rechargement.");
      const fonts=await Promise.all(responses.map(async response=>new Uint8Array(await response.arrayBuffer())));
      const bytes=await buildOfferPdf(brief.roleTitle,jobAd,fonts[0],fonts[1]);
      const url=URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer],{type:'application/pdf'}));
      const name=`Offre_${safeFileName(brief.roleTitle)}.pdf`;
      setOfferPdfDownload({url,name});
      const link=document.createElement('a');link.href=url;link.download=name;
      document.body.appendChild(link);link.click();link.remove();
    }catch(error){setOfferPdfError(error instanceof Error?error.message:'L’export PDF a échoué.');}
    finally{setOfferPdfBusy(false);}
  };

  const refreshQuality = () => setQualityChecks(checkJobAd(brief, jobAd));

  const sourcingBasis=JSON.stringify({promptVersion:AI_PROMPT_VERSION,model:'gpt-6.1-sol',reasoning:'medium',brief,sourcingSelected,synonyms,funnelDraft,sourcingFeedback});
  const optimizeSourcing=async()=>{
    const basis=sourcingBasis;
    const result=await requestAI<AISourcingPlan>({task:'sourcing',modelPreference:'sol',brief,criteria:sourcingSelected,sourcingFeedback,sourcingAxes:sourcing.selected.map(axis=>({name:axis.name,exactTerms:axis.synonyms,locked:funnelDraft[axis.name]?.locked===true}))});
    if(result) setSourcingProposal({plan:result.output,basis});
  };
  const applySourcingProposal=()=>{
    if(!sourcingProposal || sourcingProposal.basis!==sourcingBasis) return;
    const plan=sourcingProposal.plan;
    setSourcingSelected(plan.axes.map(axis=>axis.name));
    setSynonyms(current=>({...current,...Object.fromEntries(plan.axes.map(axis=>[axis.name,axis.exactTerms.join('\n')]))}));
    setFunnelDraft(current=>({...current,...Object.fromEntries(plan.axes.map(axis=>[axis.name,{adjacent:axis.adjacentTerms.join('\n'),transferable:axis.transferableTerms.join('\n'),locked:axis.locked,reason:axis.reason,verify:axis.verify}]))}));
    setAiRuns(current=>current.sourcing?{...current,sourcing:{...current.sourcing,accepted:true}}:current);
    setSourcingProposal(null);
  };

  const generateScorecard = () => {
    setAiError("");
    if(scorecard){setScorecardConfirm(true);return;}
    void executeScorecardGeneration();
  };
  const executeScorecardGeneration = async () => {
    setScorecardConfirm(false);setScorecardStatus("");
    const result = await requestAI<ScorecardData>({ task: "scorecard", brief, level, globalThreshold: threshold }, { refresh: !!scorecard });
    if (!result) return;
    if(!Array.isArray(result.output?.criteria) || !result.output.criteria.length){setAiError("La réponse reçue ne contient pas de critères affichables. Votre grille précédente est conservée.");return;}
    const generated = {...result.output,sourceBriefSnapshot:JSON.stringify(brief)};
    setScorecard(generated);
    setScorecardStatus(`Scorecard générée pour « ${brief.roleTitle || 'le besoin actuel'} » : ${generated.criteria.length} critères, deux questions principales par critère.`);
    window.requestAnimationFrame(()=>document.getElementById('scorecard-criteria')?.scrollIntoView({behavior:'smooth',block:'start'}));
    setActiveCriterion(generated.criteria[0]?.id || "");
    setSourcingSelected((current) => current.length ? current : [...new Set([brief.roleTitle, ...splitItems(brief.mustHave), ...brief.tools.split(/[,;\n]/).map(item=>item.trim()), ...generated.criteria.map(item=>item.criterion)])].filter(name=>name && suggestSearchTerms(name).length).slice(0,3));
  };

  const updateCriterion = <K extends keyof ScorecardCriterion>(id: string, key: K, value: ScorecardCriterion[K]) => {
    setScorecard((current) => current ? {
      ...current,
      criteria: current.criteria.map((criterion) => criterion.id === id ? { ...criterion, [key]: value } : criterion),
    } : current);
  };

  const addCriterion = () => {
    if (!scorecard) return;
    const seed = buildScorecard(brief, level, threshold, [`Nouveau critère ${scorecard.criteria.length + 1}`]).criteria[0];
    const criterion = { ...seed, id: `criterion-${Date.now()}` };
    setScorecard({ ...scorecard, criteria: [...scorecard.criteria, criterion] });
    setActiveCriterion(criterion.id);
  };

  const deleteCriterion = (id: string) => {
    setScorecard((current) => {
      if (!current) return current;
      const criteria = current.criteria.filter((item) => item.id !== id);
      setActiveCriterion(criteria[0]?.id || "");
      return { ...current, criteria };
    });
  };

  const exportScorecard = async () => {
    if (!scorecard || exportBusy) return;
    const context=scorecardExportContext(scorecard,brief,level,threshold,aiRuns.scorecard?.briefSnapshot);
    setExportBusy(true);
    setAiError("");
    try {
      const { buildScorecardExcel, EXCEL_TEMPLATE_URL } = await import("@/lib/scorecard-excel");
      const response = await fetch(EXCEL_TEMPLATE_URL, { credentials: "same-origin" });
      const template = new Uint8Array(await response.arrayBuffer());
      if (!response.ok || template[0] !== 0x50 || template[1] !== 0x4b) throw new Error("Le modèle Excel n’a pas pu être chargé. Rechargez l’application puis relancez l’export.");
      const bytes = await buildScorecardExcel(template, context.scorecard, context.brief);
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Scorecard_${safeFileName(context.brief.roleTitle)}${context.archived?'_archive':''}.xlsx`;
      setExcelDownload({url,name:link.download,roleTitle:context.brief.roleTitle,archived:context.archived});
      document.body.appendChild(link);
      link.click();
      link.remove();

    } catch (error) {
      setAiError(error instanceof Error ? error.message : "L’export Excel a échoué. Vos données sont conservées.");
    } finally {
      setExportBusy(false);
    }
  };

  const resetAll = () => {
    if (!job||!window.confirm("Réinitialiser le brief, l’offre et la scorecard de ce poste uniquement ?")) return;
    setBrief({...emptyBrief,roleTitle:job.title});
    setProvenance({});
    setJobAd([]);
    setQualityChecks([]);
    setScorecard(null);
    setSourcingSelected([]);
    setSynonyms({});
    setFunnelDraft({});
    setSourcingFeedback('');setSourcingProposal(null);
    setBriefStep(0);
    setActiveModule("dashboard");
    setStyleCorpus("");
    setModelPreference("auto");
    setAiRuns({});
    setAiAnalysis(null);
    setImportEvidence({});
    setAiError("");
  };

  const activeScoreCriterion = scorecard?.criteria.find((item) => item.id === activeCriterion) ?? null;
  const visibleTask: AITask | null = activeModule === 'm3'?'sourcing':activeModule === "m2" ? "scorecard" : activeModule === "m1" ? (entryMode === "import" && m1View === "brief" ? "import" : m1View === "offer" ? "offer" : "analyze") : null;
  const visibleRun = visibleTask ? aiRuns[visibleTask] : undefined;

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileMenu(true)} aria-label="Ouvrir la navigation">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">RI</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold tracking-tight text-slate-950">Recruitment Intelligence</div>
              <div className="truncate text-[11px] font-medium text-slate-500">Espace recrutement</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:block">{!job?"Espace privé":savedAt?`Enregistré · ${savedAt}`:"Enregistrement…"}</span>
            <Badge tone="success"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />Privé</Badge>
            <button onClick={resetAll} disabled={!!aiBusy||!job} className="icon-button" title="Réinitialiser ce poste" aria-label="Réinitialiser ce poste">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {mobileMenu && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden" onClick={() => setMobileMenu(false)}>
          <aside className="h-full w-[290px] bg-slate-950 p-5 text-white" onClick={(event) => event.stopPropagation()}>
            <div className="mb-7 flex items-center justify-between">
              <span className="text-sm font-semibold">Navigation</span>
              <button onClick={() => setMobileMenu(false)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Fermer"><X className="h-5 w-5" /></button>
            </div>
            <Navigation active={activeModule} onNavigate={navigate} dark />
          </aside>
        </div>
      )}

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] border-r border-slate-200 bg-white px-4 py-6 lg:block">
          <Navigation active={activeModule} onNavigate={navigate} />
          <div className="absolute bottom-5 left-4 right-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><ShieldCheck className="h-4 w-4 text-emerald-600" />Décision humaine</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Validation par le recruteur.</p>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {!['dashboard','candidates','agenda'].includes(activeModule)&&jobSelector}
          {storageError&&<p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{storageError} <button className="underline" onClick={()=>window.location.reload()}>Recharger</button></p>}
          {interviews.error&&!['m4','m5','m6'].includes(activeModule)&&<p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{interviews.error} <button className="underline" onClick={interviews.retrySave}>Réessayer</button></p>}
          {applicationStore.error&&<p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{applicationStore.error} <button className="underline" onClick={()=>void applicationStore.refresh(true).catch(()=>{})}>Actualiser le suivi</button></p>}
          {job&&!['dashboard','candidates','agenda'].includes(activeModule)&&<div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{job.title}<span className="ml-3 text-xs font-normal text-slate-500">{job.status}</span></p><button className="secondary-button" disabled={!!aiBusy} onClick={()=>navigate('dashboard')}>Tous les postes</button></div>}
          <div hidden={['dashboard','candidates','agenda','m4','m5','m6'].includes(activeModule)}>
          <Panel className="mb-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <details className="min-w-0 flex-1">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">Réglages IA et style</summary>
                <div className="mt-4 space-y-4">
                  <label className="block text-xs font-semibold">Modèle<select value={activeModule === "m3" ? "sol" : modelPreference} onChange={event => setModelPreference(event.target.value as AIModelPreference)} disabled={!!aiBusy || activeModule === "m3"} className="field-control mt-2 h-10 max-w-sm"><option value="auto">Automatique : Luna / Sol</option><option value="luna">Économie : Luna</option><option value="sol">Qualité : Sol</option></select></label>
                  <p className="text-xs leading-5 text-slate-500">Luna pour l’extraction ; Sol en raisonnement modéré pour les analyses. Le sourcing utilise toujours Sol. Les propositions restent à relire.</p>
                  <label className="block text-xs font-semibold">Exemples de style<textarea value={styleCorpus} disabled={!!aiBusy} onChange={event => setStyleCorpus(event.target.value)} maxLength={40000} rows={4} className="field-control mt-2 resize-y" placeholder="Textes de référence pour le style, sans données confidentielles." /></label>
                  <p className="text-xs text-slate-500">{styleCorpus.length.toLocaleString("fr-FR")} / 40 000 caractères. Ces textes guident le style, pas les faits du poste.</p>
                </div>
              </details>
              {activeModule === "m1" && <button onClick={analyzeWithAI} disabled={!!aiBusy} className="secondary-button">{aiBusy === "analyze" ? "Analyse en cours…" : "Analyser le besoin"}</button>}
            </div>
            {aiBusy && <p role="status" className="mt-4 text-sm font-semibold text-indigo-700">{aiBusy === "sourcing" ? "Optimisation du sourcing" : aiBusy === "import" ? "Extraction IA" : aiBusy === "scorecard" ? "Construction de la scorecard" : aiBusy === "offer" ? "Reformulation de l’offre" : "Analyse du besoin"} en cours. Cela peut prendre jusqu’à deux minutes.</p>}
            {aiError && <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-800">{aiError} <a className="underline" href="/?embed=0" target="_blank" rel="noreferrer">Ouvrir l’application</a></div>}
            {visibleRun && <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={visibleRun.accepted ? "success" : "accent"}>{visibleRun.accepted ? "Relecture humaine confirmée" : "Proposition IA à relire"}</Badge>{visibleRun.cache?.hit && <Badge tone="success">Résultat réutilisé</Badge>}</div>
              <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Détails et sources</summary><span className="text-xs text-slate-500">{visibleRun.model} · raisonnement {visibleRun.reasoningEffort === "low" ? "faible" : "modéré"} · {new Date(visibleRun.generatedAt).toLocaleString("fr-FR")} · {visibleRun.promptVersion}</span>
              {visibleRun.cache?.hit && <p className="mt-2 text-xs font-semibold text-emerald-800">Cache {visibleRun.cache.layer === "browser" ? "du navigateur" : "du serveur"} : aucun nouvel appel au modèle pour cette réutilisation.</p>}
              {visibleRun.usage && <p className="mt-2 text-xs text-slate-500">Tokens de la génération initiale : {visibleRun.usage.inputTokens ?? "n.c."} entrée, {visibleRun.usage.outputTokens ?? "n.c."} sortie{visibleRun.usage.cachedInputTokens ? `, ${visibleRun.usage.cachedInputTokens} relus depuis le cache de prompt` : ""}{visibleRun.usage.cachedWriteTokens ? `, ${visibleRun.usage.cachedWriteTokens} ajoutés au cache de prompt` : ""}.</p>}
              {visibleRun.optimization && <p className="mt-2 text-xs text-slate-500">RAG sélectif : {visibleRun.optimization.rag.selectedExcerpts} passage(s), {visibleRun.optimization.rag.selectedCharacters.toLocaleString("fr-FR")} caractères. Harness : {visibleRun.optimization.harness.modelCalls} appel(s), aucune nouvelle tentative automatique.</p>}
              <p className="mt-2 text-xs text-slate-500">Protection : {visibleRun.privacy.mode === "candidate-pseudonymised" ? `candidat ${visibleRun.privacy.candidateReference ?? "pseudonymisé"}` : "coordonnées directes minimisées"}{visibleRun.privacy.redactions ? `, ${visibleRun.privacy.redactions} élément(s) retiré(s)` : ""}.</p>
              {visibleRun.briefSnapshot !== JSON.stringify(brief) && visibleTask !== "import" && <p className="mt-2 text-xs font-semibold text-amber-800">Le brief a changé depuis cette génération. Vérifiez les écarts ou relancez l’IA.</p>}
              {visibleRun.warnings.map((warning, index) => <p key={index} className="mt-2 text-xs leading-5 text-amber-900">{warning}</p>)}
              {visibleRun.sourceRefs.map(source => <p key={source.id} className="mt-2 text-xs leading-5 text-slate-500">Référence : {source.title}. {source.usage}</p>)}
              </details>
              {visibleTask==='scorecard' && scorecard && <button className="secondary-button mt-3" onClick={()=>document.getElementById('scorecard-criteria')?.scrollIntoView({behavior:'smooth',block:'start'})}>Afficher la scorecard générée</button>}
              {!visibleRun.accepted && visibleTask && visibleTask !== "sourcing" && visibleTask !== "import" && <button disabled={!!aiBusy || visibleRun.briefSnapshot !== JSON.stringify(brief)} onClick={() => setAiRuns(current => ({ ...current, [visibleTask]: { ...visibleRun, accepted: true } }))} className="secondary-button mt-3">Confirmer ma relecture</button>}
            </div>}
          </Panel>
          </div>
          <fieldset disabled={!!aiBusy} className="m-0 min-w-0 border-0 p-0" aria-busy={!!aiBusy}>
          {activeModule === 'dashboard' && dashboard}
          {activeModule === 'candidates' && candidateDashboard}
          {activeModule === 'agenda' && agendaDashboard}
          {activeModule === "m1" && (
            <M1Module
              brief={brief}
              startNewNeed={startNewNeed}
              needNotice={needNotice}
              importAsNew={importAsNew}
              setImportAsNew={setImportAsNew}
              provenance={provenance}
              importEvidence={importEvidence}
              step={briefStep}
              setStep={setBriefStep}
              view={m1View}
              setView={setM1View}
              entryMode={entryMode}
              setEntryMode={setEntryMode}
              importText={importText}
              setImportText={setImportText}
              importName={importName}
              importBusy={importBusy}
              importError={importError}
              fileRef={fileRef}
              handleFile={handleFile}
              applyImport={applyImport}
              updateBrief={updateBrief}
              validateCurrentStep={validateCurrentStep}
              analysis={analysis}
              aiAnalysis={aiAnalysis}
              jobFormat={jobFormat}
              setJobFormat={setJobFormat}
              jobTone={jobTone}
              setJobTone={setJobTone}
              regenerateSection={regenerateSection} sectionProposal={sectionProposal} acceptSection={acceptSection} dismissSection={()=>setSectionProposal(null)}
              jobAd={jobAd}
              setJobAd={setJobAd}
              qualityChecks={qualityChecks}
              generateOffer={generateOffer}
              exportOfferPdf={exportOfferPdf}
              offerPdfBusy={offerPdfBusy}
              offerPdfError={offerPdfError}
              offerPdfDownload={offerPdfDownload}
              refreshQuality={refreshQuality}
              onContinue={() => navigate("m2")}
            />
          )}
          {activeModule === "m2" && (
            <M2Module
              level={level}
              setLevel={setLevel}
              threshold={threshold}
              setThreshold={setThreshold}
              scorecard={scorecard}
              scorecardStale={scorecardStale}
              generateScorecard={generateScorecard}
              scorecardConfirm={scorecardConfirm}
              confirmGeneration={()=>void executeScorecardGeneration()}
              cancelGeneration={()=>setScorecardConfirm(false)}
              generationBusy={aiBusy==='scorecard'}
              generationError={aiError}
              generationStatus={scorecardStatus}
              activeCriterion={activeCriterion}
              setActiveCriterion={setActiveCriterion}
              criterion={activeScoreCriterion}
              updateCriterion={updateCriterion}
              addCriterion={addCriterion}
              deleteCriterion={deleteCriterion}
              moveCriterion={(sourceId,targetId)=>setScorecard(current=>current?{...current,criteria:moveCriterion(current.criteria,sourceId,targetId)}:current)}
              exportScorecard={exportScorecard}
              exportBusy={exportBusy}
              excelDownload={excelDownload}
              onContinue={() => navigate("m3")}
            />
          )}
          {activeModule === "m3" && (
            <M3Module
              criteria={availableCriteria}
              selected={sourcingSelected}
              setSelected={setSourcingSelected}
              synonyms={synonyms}
              setSynonyms={setSynonyms}
              sourcing={sourcing}
              funnelDraft={funnelDraft}
              setFunnelDraft={setFunnelDraft}
              sourcingFeedback={sourcingFeedback}
              setSourcingFeedback={setSourcingFeedback}
              sourcingProposal={sourcingProposal?.plan??null}
              sourcingStale={!!sourcingProposal&&sourcingProposal.basis!==sourcingBasis}
              optimizeSourcing={optimizeSourcing}
              applySourcingProposal={applySourcingProposal}
              dismissSourcingProposal={()=>setSourcingProposal(null)}
              sourcingBusy={aiBusy==='sourcing'}
            />
          )}
          <div hidden={!['m4','m5','m6'].includes(activeModule)}><AssessmentWorkspace applicationStore={applicationStore} storage={interviews} appointments={appointments} requestedAppointmentId={requestedAppointmentId} jobId={job?.id} onControls={controls=>{assessmentControls.current=controls;}} mode={activeModule==='m5'?'m5':activeModule==='m6'?'m6':'m4'} scorecard={scorecard?{...scorecard,globalThreshold:threshold}:null} roleTitle={brief.roleTitle} scorecardStale={scorecardStale} onScorecard={()=>navigate('m2')}/></div>
          </fieldset>
        </main>
      </div>
    </div>
  );
}

function Navigation({ active, onNavigate, dark = false }: { active: ModuleId; onNavigate: (id: ModuleId) => void; dark?: boolean }) {
  return (
    <nav className="space-y-2" aria-label="Navigation principale">
      {moduleNav.map((item) => {
        const Icon = item.icon;
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected ? (dark ? "bg-white text-slate-950" : "bg-slate-950 text-white") : (dark ? "text-slate-300 hover:bg-white/10 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}`}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{item.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function PageHeader({ eyebrow, title, text, actions }: { eyebrow: string; title: string; text: string; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

function Dashboard({
  analysis,
  scorecard,
  sourcingCount,
  onNavigate,
  roleTitle,
}: {
  analysis: ReturnType<typeof analyzeBrief>;
  scorecard: ScorecardData | null;
  sourcingCount: number;
  onNavigate: (id: ModuleId) => void;
  roleTitle: string;
}) {
  const cards = [
    {
      id: "m1" as const,
      number: "01",
      title: "Cadrer le besoin",
      text: "Brief guidé, import, complétude, tension, offre honnête et contrôle qualité.",
      metric: `${analysis.completeness} %`,
      metricLabel: "complétude",
      icon: FileSearch,
    },
    {
      id: "m2" as const,
      number: "02",
      title: "Structurer l’évaluation",
      text: "Critères liés au poste, questions simples, preuves et ancrages de notation 0–3.",
      metric: `${scorecard?.criteria.length ?? 0}`,
      metricLabel: "critères",
      icon: ClipboardCheck,
    },
    {
      id: "m3" as const,
      number: "03",
      title: "Préparer le sourcing",
      text: "Trois critères professionnels maximum, synonymes et variantes booléennes explicables.",
      metric: `${sourcingCount}/3`,
      metricLabel: "axes actifs",
      icon: Search,
    },
    {id:'m4' as const,number:'04',title:'Conduire l’entretien',text:'Grille figée, deux questions par critère et preuves observées.',metric:'M4',metricLabel:'entretien',icon:FileText},
    {id:'m5' as const,number:'05',title:'Évaluer et décider',text:'Notes humaines, couverture et décision justifiée.',metric:'M5',metricLabel:'évaluation',icon:CheckCircle2},
    {id:'m6' as const,number:'06',title:'Restituer les preuves',text:'Compte rendu, comparaison de grilles identiques et exports.',metric:'M6',metricLabel:'rapport',icon:Download},
  ];
  return (
    <div>
      <PageHeader
        eyebrow="Espace de travail"
        title={roleTitle ? `Recrutement ${roleTitle}` : "Construire un recrutement cohérent de bout en bout"}
        text="Choisissez une étape pour poursuivre le recrutement."
        actions={<button className="primary-button" onClick={() => onNavigate("m1")}>Commencer le cadrage <ArrowRight className="h-4 w-4" /></button>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Complétude du brief" value={`${analysis.completeness} %`} tone="indigo" />
        <Metric label="Tension estimée" value={analysis.tensionLevel} tone={analysis.tensionLevel === "Élevé" ? "rose" : analysis.tensionLevel === "Modéré" ? "amber" : "emerald"} />
        <Metric label="Scorecard" value={scorecard ? `${scorecard.criteria.length} critères` : "À générer"} tone="slate" />
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Panel key={card.id} className="group overflow-hidden p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon className="h-5 w-5" /></div>
                <span className="text-xs font-bold tracking-[0.18em] text-slate-400">M{card.number}</span>
              </div>
              <h2 className="mt-6 text-lg font-bold text-slate-950">{card.title}</h2>
              <p className="mt-2 min-h-20 text-sm leading-6 text-slate-600">{card.text}</p>
              <div className="mt-6 flex items-end justify-between border-t border-slate-100 pt-5">
                <div><div className="text-2xl font-bold text-slate-950">{card.metric}</div><div className="text-xs text-slate-500">{card.metricLabel}</div></div>
                <button onClick={() => onNavigate(card.id)} className="secondary-button">Ouvrir <ChevronRight className="h-4 w-4" /></button>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-6 p-5"><p className="text-xs font-semibold text-slate-500">Prochaine étape</p><p className="mt-2 text-sm">{analysis.nextActions[0] ?? "Préparer la scorecard et le sourcing."}</p></Panel>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "indigo" | "emerald" | "amber" | "rose" | "slate" }) {
  const tones = { indigo: "bg-indigo-600", emerald: "bg-emerald-600", amber: "bg-amber-500", rose: "bg-rose-600", slate: "bg-slate-700" };
  return (
    <Panel className="flex items-center gap-4 p-5">
      <span className={`h-10 w-1 rounded-full ${tones[tone]}`} />
      <div><div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</div><div className="mt-1 text-xl font-bold text-slate-950">{value}</div></div>
    </Panel>
  );
}

type OfferSectionControls={regenerateSection:(id:string)=>void;sectionProposal:{section:JobAdSection;basisBody:string;briefSnapshot:string}|null;acceptSection:()=>void;dismissSection:()=>void};
type M1Props = OfferSectionControls & {
  brief: BriefData;
  provenance: Partial<Record<keyof BriefData, Provenance>>;
  importEvidence: Partial<Record<keyof BriefData, string>>;
  step: number;
  setStep: (value: number) => void;
  view: M1View;
  setView: (value: M1View) => void;
  startNewNeed: () => void;
  needNotice: string;
  importAsNew: boolean;
  setImportAsNew: (value:boolean) => void;
  entryMode: "create" | "import";
  setEntryMode: (value: "create" | "import") => void;
  importText: string;
  setImportText: (value: string) => void;
  importName: string;
  importBusy: boolean;
  importError: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  handleFile: (event: ChangeEvent<HTMLInputElement>) => void;
  applyImport: () => void;
  updateBrief: (key: keyof BriefData, value: string) => void;
  validateCurrentStep: () => void;
  analysis: ReturnType<typeof analyzeBrief>;
  aiAnalysis: AIAnalysis | null;
  jobFormat: "Courte" | "Standard" | "Détaillée";
  setJobFormat: (value: "Courte" | "Standard" | "Détaillée") => void;
  jobTone: "Professionnel direct" | "Institutionnel" | "Dynamique";
  setJobTone: (value: "Professionnel direct" | "Institutionnel" | "Dynamique") => void;
  jobAd: JobAdSection[];
  setJobAd: React.Dispatch<React.SetStateAction<JobAdSection[]>>;
  qualityChecks: QualityCheck[];
  generateOffer: () => void;
  exportOfferPdf: () => void;
  offerPdfBusy: boolean;
  offerPdfError: string;
  offerPdfDownload: {url:string;name:string}|null;
  refreshQuality: () => void;
  onContinue: () => void;
};

function M1Module(props: M1Props) {
  const current = briefSteps[props.step];
  const [completeForm,setCompleteForm]=useState(false),[onlyMissing,setOnlyMissing]=useState(false);
  const essentials=briefSteps.flatMap(s=>s.fields).filter(f=>['roleTitle','recruitmentReason','missions','mustHave','goals6','location','management','salary'].includes(f.key));
  return (
    <div>
      <PageHeader
        eyebrow="Module 1"
        title="Besoin et offre"
        text="Définir le besoin et préparer l’offre."
      />
      <div className="mb-4 flex flex-wrap items-center gap-4"><button type="button" className="secondary-button" onClick={props.startNewNeed}>Nouveau besoin</button>{props.needNotice && <p role="status" className="text-sm text-amber-800">{props.needNotice}</p>}</div>
      <div className="mb-6 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-1.5">
        {(["brief", "analysis", "offer"] as const).map((view, index) => (
          <button key={view} onClick={() => props.setView(view)} className={`segmented-button ${props.view === view ? "segmented-button-active" : ""}`}>
            <span className="mr-2 text-[10px] font-bold opacity-60">{index + 1}</span>{view === "brief" ? "Cadrage" : view === "analysis" ? "Analyse" : "Offre et qualité"}
          </button>
        ))}
      </div>

      {props.view==='brief'&&props.entryMode==='create'&&!completeForm&&<Panel className="mb-6 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Les essentiels du poste</h2><button className="secondary-button" onClick={()=>props.setEntryMode('import')}>Importer une offre</button></div><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyMissing} onChange={e=>setOnlyMissing(e.target.checked)}/>Afficher seulement les champs à compléter</label><div className="mt-5 grid gap-5 sm:grid-cols-2">{essentials.filter(f=>!onlyMissing||!props.brief[f.key].trim()).map(f=><Field key={f.key} label={f.label} value={props.brief[f.key]} onChange={v=>props.updateBrief(f.key,v)} placeholder={f.placeholder} rows={f.key==='missions'||f.key==='mustHave'?4:2} provenance={props.provenance[f.key]??(props.brief[f.key]?'Renseigné au kick-off':'À compléter')}/>)}</div>{onlyMissing&&essentials.every(f=>props.brief[f.key].trim())&&<p className="mt-4 text-sm text-emerald-800">Les champs essentiels sont renseignés. Relisez-les avant de générer.</p>}<div className="mt-6 flex flex-wrap gap-3"><button className="secondary-button" onClick={()=>setCompleteForm(true)}>Compléter le dossier détaillé</button><button className="primary-button" onClick={()=>props.setView('analysis')}>Vérifier le besoin</button></div></Panel>}
      {props.view==='brief'&&props.entryMode==='create'&&completeForm&&<button className="secondary-button mb-4" onClick={()=>setCompleteForm(false)}>Revenir aux essentiels</button>}
      {props.view === "brief" && (completeForm||props.entryMode==='import') && (
        <div className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Panel className="p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Mode d’entrée</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => props.setEntryMode("create")} className={`choice-button ${props.entryMode === "create" ? "choice-button-active" : ""}`}>Créer</button>
                <button onClick={() => props.setEntryMode("import")} className={`choice-button ${props.entryMode === "import" ? "choice-button-active" : ""}`}>Importer</button>
              </div>
            </Panel>
            <Panel className="hidden max-h-[calc(100vh-13rem)] overflow-auto p-3 xl:block">
              <p className="px-2 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">10 sections</p>
              {briefSteps.map((item, index) => {
                const completed = item.fields.some((field) => props.brief[field.key].trim());
                return (
                  <button key={item.title} onClick={() => props.setStep(index)} className={`step-button ${props.step === index ? "step-button-active" : ""}`}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{completed ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                    <span className="truncate">{item.title}</span>
                  </button>
                );
              })}
            </Panel>
          </div>

          {props.entryMode === "import" ? (
            <Panel className="p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Upload className="h-5 w-5" /></div>
                <div><h2 className="text-lg font-bold">Importer une offre existante</h2><p className="mt-1 text-sm leading-6 text-slate-600">Importez une offre pour préremplir le brief.</p></div>
              </div>
              <label className="mt-5 block text-sm font-semibold">Destination de l’import<select className="field-control mt-2" value={props.importAsNew?'new':'update'} onChange={event=>props.setImportAsNew(event.target.value==='new')}><option value="new">Nouveau besoin : remplacer le dossier courant</option><option value="update">Mettre à jour le besoin courant : conserver les champs validés</option></select></label>
              <input ref={props.fileRef} onChange={props.handleFile} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" />
              <button onClick={() => props.fileRef.current?.click()} className="mt-6 flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40">
                <FileText className="h-8 w-8 text-slate-400" />
                <span className="mt-3 text-sm font-semibold text-slate-800">{props.importBusy ? "Lecture du document…" : props.importName || "Choisir un PDF, DOCX ou TXT"}</span>
                <span className="mt-1 text-xs text-slate-500">PDF, Word ou texte</span>
              </button>
              <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400"><span className="h-px flex-1 bg-slate-200" />ou coller le texte<span className="h-px flex-1 bg-slate-200" /></div>
              <textarea value={props.importText} onChange={(event) => props.setImportText(event.target.value)} rows={12} placeholder="Collez ici le contenu de l’offre…" className="field-control resize-y" />
              {props.importError && <p className="mt-3 flex items-center gap-2 text-sm text-rose-700"><AlertTriangle className="h-4 w-4" />{props.importError}</p>}
              <div className="mt-6 flex justify-end"><button onClick={props.applyImport} className="primary-button" disabled={props.importBusy}>Extraire et préremplir <ArrowRight className="h-4 w-4" /></button></div>
            </Panel>
          ) : (
            <Panel className="overflow-hidden">
              <div className="border-b border-slate-200 px-6 py-5 sm:px-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-600">Section {props.step + 1} sur 10</p><h2 className="mt-1 text-xl font-bold">{current.title}</h2></div>
                  <Badge tone={props.analysis.sections[props.step]?.complete ? "success" : "warning"}>{props.analysis.sections[props.step]?.complete ? "Section complète" : "À compléter"}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{current.description}</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${((props.step + 1) / 10) * 100}%` }} /></div>
              </div>
              <div className="grid gap-6 p-6 sm:p-8">
                {current.fields.map((field) => (
                  <Field key={field.key} label={field.label} value={props.brief[field.key]} onChange={(value) => props.updateBrief(field.key, value)} placeholder={field.placeholder} rows={field.rows} hint={props.importEvidence[field.key] ? `Extrait source : « ${props.importEvidence[field.key]} » ${field.hint || ""}` : field.hint} provenance={props.provenance[field.key] ?? (props.brief[field.key] ? "Renseigné au kick-off" : "À compléter")} />
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:px-8">
                <button onClick={() => props.setStep(Math.max(0, props.step - 1))} disabled={props.step === 0} className="secondary-button"><ChevronLeft className="h-4 w-4" />Précédent</button>
                <div className="flex gap-2">
                  <button onClick={props.validateCurrentStep} className="secondary-button">Valider la section</button>
                  {props.step < 9 ? (
                    <button onClick={() => { props.validateCurrentStep(); props.setStep(props.step + 1); }} className="primary-button">Suivant <ChevronRight className="h-4 w-4" /></button>
                  ) : (
                    <button onClick={() => { props.validateCurrentStep(); props.setView("analysis"); }} className="primary-button">Analyser le besoin <ArrowRight className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}

      {props.view === "analysis" && (
        <>
          {props.aiAnalysis ? <AIAnalysisView analysis={props.aiAnalysis} /> : <Panel className="mb-6 p-6"><p className="text-sm leading-6 text-slate-600">Cliquez sur « Analyser le besoin » pour préparer le cadrage.</p></Panel>}
          <NeedAnalysisView analysis={props.analysis} onBack={() => props.setView("brief")} onGenerate={props.generateOffer} />
        </>
      )}

      {props.view === "offer" && (
        <OfferView
          regenerateSection={props.regenerateSection} sectionProposal={props.sectionProposal} acceptSection={props.acceptSection} dismissSection={props.dismissSection}
          format={props.jobFormat}
          setFormat={props.setJobFormat}
          tone={props.jobTone}
          setTone={props.setJobTone}
          sections={props.jobAd}
          setSections={props.setJobAd}
          checks={props.qualityChecks}
          generate={props.generateOffer}
          exportPdf={props.exportOfferPdf}
          pdfBusy={props.offerPdfBusy}
          pdfError={props.offerPdfError}
          pdfDownload={props.offerPdfDownload}
          refreshQuality={props.refreshQuality}
          onContinue={props.onContinue}
        />
      )}
    </div>
  );
}

function AIAnalysisView({ analysis }: { analysis: AIAnalysis }) {
  return <Panel className="mb-6 p-6 sm:p-8">
    <h2 className="text-lg font-bold">Analyse qualitative proposée par l’IA</h2>
    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{analysis.synthesis}</p>
    {analysis.strengths.length > 0 && <div className="mt-5"><h3 className="text-sm font-bold">Points d’appui</h3>{analysis.strengths.map((item, index) => <p key={index} className="mt-2 text-sm leading-6 text-slate-600">{item}</p>)}</div>}
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      {analysis.missingInformation.length > 0 && <div className="rounded-xl bg-amber-50 p-5"><h3 className="text-sm font-bold text-amber-900">Informations manquantes</h3>{analysis.missingInformation.map((item, index) => <div key={index} className="mt-4 text-sm leading-6"><p className="font-semibold">{item.question}</p><p className="text-slate-600">{item.reason}</p><span className="text-xs text-slate-500">Champ : {item.field}</span></div>)}</div>}
      {analysis.contradictions.length > 0 && <div className="rounded-xl bg-rose-50 p-5"><h3 className="text-sm font-bold text-rose-900">Contradictions à vérifier</h3>{analysis.contradictions.map((item, index) => <div key={index} className="mt-4 text-sm leading-6"><p className="font-semibold">{item.finding}</p><p className="text-slate-600">Faits : {item.evidence}</p><p className="mt-1">{item.question}</p></div>)}</div>}
    </div>
    {analysis.arbitrations.length > 0 && <div className="mt-6"><h3 className="text-sm font-bold">Arbitrages proposés, à décider avec le manager</h3>{analysis.arbitrations.map((item, index) => <div key={index} className="mt-3 rounded-xl border border-slate-200 p-4 text-sm leading-6"><p className="font-semibold">{item.requirement}</p><p>{item.recommendation}</p><p className="mt-1 text-slate-500">{item.justification}</p></div>)}</div>}
    {analysis.followUpQuestions.length > 0 && <div className="mt-6 rounded-xl bg-slate-50 p-5"><h3 className="text-sm font-bold">Questions de kick-off</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">{analysis.followUpQuestions.map((item, index) => <li key={index}>{item}</li>)}</ol></div>}
  </Panel>;
}

function NeedAnalysisView({ analysis, onBack, onGenerate }: { analysis: ReturnType<typeof analyzeBrief>; onBack: () => void; onGenerate: () => void }) {
  const tensionTone = analysis.tensionLevel === "Élevé" ? "danger" : analysis.tensionLevel === "Modéré" ? "warning" : "success";
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.05fr]">
      <Panel className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Complétude</p><div className="mt-1 text-4xl font-bold tracking-tight">{analysis.completeness} %</div></div>
          <div className="grid h-16 w-16 place-items-center rounded-full bg-indigo-50 text-indigo-700"><Target className="h-7 w-7" /></div>
        </div>
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${analysis.completeness}%` }} /></div>
        <div className="mt-6 space-y-2">
          {analysis.sections.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
              <div className="flex items-center gap-3">{item.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}<span className="text-sm font-medium text-slate-700">{item.label}</span></div>
              <span className="text-xs text-slate-400">{item.complete ? "Complet" : `${item.missing.length} manque${item.missing.length > 1 ? "s" : ""}`}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Alertes de cadrage, contrôle par règles</p><h2 className="mt-1 text-2xl font-bold">{analysis.tensionLevel}</h2></div><Badge tone={tensionTone}>{analysis.tensionScore}/6</Badge></div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Indicateur interne, sans données externes. Il ne mesure pas la rareté réelle du profil ni le marché salarial.</p>
          {analysis.tensionFactors.length ? (
            <div className="mt-6 space-y-4">
              {analysis.tensionFactors.map((factor) => (
                <div key={factor.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><h3 className="text-sm font-semibold text-slate-900">{factor.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{factor.detail}</p><p className="mt-2 text-xs font-medium leading-5 text-amber-800">Arbitrage : {factor.recommendation}</p></div></div>
                </div>
              ))}
            </div>
          ) : <p className="mt-5 text-sm leading-6 text-slate-600">Aucun facteur de tension majeur n’est détecté avec les informations actuellement renseignées.</p>}
        </Panel>
        {analysis.inconsistencies.length > 0 && (
          <Panel className="border-rose-200 p-6"><h3 className="text-sm font-bold text-rose-800">Incohérences à vérifier</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">{analysis.inconsistencies.map((item) => <li key={item} className="flex gap-2"><span>—</span>{item}</li>)}</ul></Panel>
        )}
        <div className="flex flex-wrap justify-between gap-3"><button onClick={onBack} className="secondary-button"><ChevronLeft className="h-4 w-4" />Revenir au brief</button><button onClick={onGenerate} className="primary-button"><Sparkles className="h-4 w-4" />Générer l’offre</button></div>
      </div>
    </div>
  );
}

function OfferView({
  regenerateSection,sectionProposal,acceptSection,dismissSection,
  exportPdf, pdfBusy, pdfError, pdfDownload,
  format,
  setFormat,
  tone,
  setTone,
  sections,
  setSections,
  checks,
  generate,
  refreshQuality,
  onContinue,
}: OfferSectionControls & {
  exportPdf: () => void;
  pdfBusy: boolean;
  pdfError: string;
  pdfDownload: {url:string;name:string}|null;
  format: "Courte" | "Standard" | "Détaillée";
  setFormat: (value: "Courte" | "Standard" | "Détaillée") => void;
  tone: "Professionnel direct" | "Institutionnel" | "Dynamique";
  setTone: (value: "Professionnel direct" | "Institutionnel" | "Dynamique") => void;
  sections: JobAdSection[];
  setSections: React.Dispatch<React.SetStateAction<JobAdSection[]>>;
  checks: QualityCheck[];
  generate: () => void;
  refreshQuality: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <Panel className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <label><span className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Format</span><select value={format} onChange={(event) => setFormat(event.target.value as typeof format)} className="field-control h-11"><option>Courte</option><option>Standard</option><option>Détaillée</option></select></label>
          <label><span className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Ton</span><select value={tone} onChange={(event) => setTone(event.target.value as typeof tone)} className="field-control h-11"><option>Professionnel direct</option><option>Institutionnel</option><option>Dynamique</option></select></label>
        </div>
        {sections.length>0 && <button type="button" onClick={exportPdf} disabled={pdfBusy} className="secondary-button"><Download className="h-4 w-4" />{pdfBusy?'Création du PDF…':'Télécharger PDF'}</button>}
        <button onClick={generate} className="primary-button"><Sparkles className="h-4 w-4" />{sections.length ? "Régénérer" : "Générer l’offre"}</button>
      </Panel>
      {pdfDownload && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">PDF prêt. <a className="font-semibold underline" href={pdfDownload.url} download={pdfDownload.name}>Télécharger le PDF de l’offre</a></p>}
      {sectionProposal&&<Panel className="border-indigo-200 p-5"><h2 className="font-bold">Proposition pour {sectionProposal.section.title}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{sectionProposal.section.body}</p><div className="mt-4 flex flex-wrap gap-3"><button className="primary-button" onClick={acceptSection}>Appliquer à cette section</button><button className="secondary-button" onClick={dismissSection}>Conserver mon texte</button></div><p className="mt-3 text-xs text-slate-500">Les autres sections et vos corrections sont conservées.</p></Panel>}
      {pdfError && <p role="alert" className="text-sm text-rose-800">{pdfError}</p>}
      {sections.length ? (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <Panel className="overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-5"><h2 className="font-bold">Offre reformulée en huit sections</h2><p className="mt-1 text-sm text-slate-500">Modifiez le texte avant de l’exporter.</p></div>
            <div className="divide-y divide-slate-100">
              {sections.map((section) => (
                <div key={section.id} className="p-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-bold text-slate-900">{section.title}</h3><div className="flex gap-2"><button className="secondary-button" onClick={()=>regenerateSection(section.id)}>Reformuler cette section</button><details className="text-xs text-slate-500"><summary className="cursor-pointer">Sources</summary>{section.source}</details></div></div>
                  <textarea value={section.body} onChange={(event) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, body: event.target.value } : item))} rows={Math.max(4, section.body.split("\n").length + 1)} className="field-control resize-y whitespace-pre-wrap" />
                </div>
              ))}
            </div>
          </Panel>
          <div className="space-y-5">
            <Panel className="p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="font-bold">Contrôle qualité</h2><button onClick={refreshQuality} className="icon-button" title="Actualiser"><RotateCcw className="h-4 w-4" /></button></div>
              <div className="mt-4 space-y-3">
                {checks.map((check) => (
                  <div key={check.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold text-slate-800">{check.label}</span><Badge tone={check.status === "Conforme" ? "success" : check.status === "À compléter" ? "warning" : "danger"}>{check.status}</Badge></div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-5 text-slate-500">{check.evidence}</p>
                    {check.status !== "Conforme" && <p className="mt-2 text-xs font-medium leading-5 text-slate-700">{check.suggestion}</p>}
                  </div>
                ))}
              </div>
            </Panel>
            <button onClick={onContinue} className="primary-button w-full justify-center">Continuer vers la scorecard <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      ) : <EmptyState title="Aucune offre générée" text="Renseignez le brief, puis générez l’offre." action={<button onClick={generate} className="primary-button"><Sparkles className="h-4 w-4" />Générer maintenant</button>} />}
    </div>
  );
}

function M2Module({
  scorecardConfirm,confirmGeneration,cancelGeneration,generationBusy,generationError,generationStatus,
  level,
  setLevel,
  threshold,
  setThreshold,
  scorecard,
  generateScorecard,
  activeCriterion,
  setActiveCriterion,
  criterion,
  updateCriterion,
  addCriterion,
  deleteCriterion,
  moveCriterion: reorderCriterion,
  scorecardStale,
  exportScorecard,
  exportBusy,
  excelDownload,
  onContinue,
}: {
  scorecardConfirm: boolean;
  confirmGeneration: () => void;
  cancelGeneration: () => void;
  generationBusy: boolean;
  generationError: string;
  generationStatus: string;
  level: JobLevel;
  setLevel: (value: JobLevel) => void;
  threshold: number;
  setThreshold: (value: number) => void;
  scorecard: ScorecardData | null;
  generateScorecard: () => void;
  activeCriterion: string;
  setActiveCriterion: (value: string) => void;
  criterion: ScorecardCriterion | null;
  updateCriterion: <K extends keyof ScorecardCriterion>(id: string, key: K, value: ScorecardCriterion[K]) => void;
  addCriterion: () => void;
  deleteCriterion: (id: string) => void;
  moveCriterion: (sourceId:string,targetId:string) => void;
  scorecardStale: boolean;
  exportScorecard: () => void;
  exportBusy: boolean;
  excelDownload: {url:string;name:string;roleTitle:string;archived:boolean}|null;
  onContinue: () => void;
}) {
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{if(!generationBusy){setElapsed(0);return;}const started=Date.now();const timer=window.setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>window.clearInterval(timer);},[generationBusy]);
  return (
    <div>
      <PageHeader
        eyebrow="Module 2"
        title="Scorecard"
        text="Créer et ajuster les critères d’entretien."
        actions={scorecard ? <><button onClick={exportScorecard} disabled={exportBusy} className="secondary-button"><Download className="h-4 w-4" />{exportBusy ? "Export en cours…" : scorecardStale ? "Exporter l’ancienne grille" : "Exporter Excel"}</button><button onClick={onContinue} className="primary-button">Préparer le sourcing <ArrowRight className="h-4 w-4" /></button></> : undefined}
      />
      {scorecardStale && <Panel className="mb-6 border-amber-300 bg-amber-50 p-6"><p role="alert" className="text-sm font-semibold text-amber-900">Le besoin ou le type a changé. Régénérez la grille pour l’actualiser, ou exportez l’ancienne version.</p><button className="secondary-button mt-3" onClick={generateScorecard}>Régénérer pour le besoin actuel</button></Panel>}
      <details className="mb-4 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Repères d’entretien et de notation</summary><div className="mt-3">
        <p className="text-sm leading-6 text-slate-600">{level==='Jeune diplômé'?'Priorité aux comportements observables, à l’apprentissage et à la motivation professionnelle. Les questions acceptent les projets d’études, stages, alternance ou autres projets concrets. Le socle métier indispensable reste à vérifier.':'Pour chaque compétence, les questions acceptent des exemples issus d’autres outils, secteurs ou environnements. Les relances portent sur ce qui est réutilisable dans les missions et les écarts restant à vérifier.'}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">Les expériences transférables sont prises en compte dans toutes les questions, sans option à activer. Choisir la grille avant les entretiens et garder les mêmes critères pour les personnes comparées. Non évalué = NE, pas 0.</p>
        {scorecard && scorecard.level!==level?<p role="alert" className="mt-3 text-sm font-semibold text-amber-800">Grille actuelle : {scorecard.level}. Régénérez pour appliquer le nouveau type.</p>:null}
      </div></details>
      <div id="scorecard-result" className="scroll-mt-24">
        {excelDownload && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Excel prêt pour « {excelDownload.roleTitle} »{excelDownload.archived?' (ancienne grille)':''}. <a className="font-semibold underline" href={excelDownload.url} download={excelDownload.name}>Télécharger le fichier Excel</a></p>}
        {scorecardConfirm && <Panel className="mb-6 border-amber-300 bg-amber-50 p-5"><p className="text-sm font-semibold">Remplacer la grille actuelle par une scorecard du besoin actuel ? Ses notes et modifications seront remplacées uniquement si la génération réussit.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={confirmGeneration} className="primary-button">Confirmer et générer</button><button type="button" onClick={cancelGeneration} className="secondary-button">Conserver la grille</button></div></Panel>}
        {generationBusy && <p role="status" className="mb-4 rounded-xl bg-indigo-50 p-4 text-sm font-semibold text-indigo-800">Génération de la scorecard en cours : {elapsed} s. Elle peut prendre jusqu’à deux minutes. Gardez cette page ouverte.</p>}
        {generationError && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{generationError}</p>}
        {generationStatus && !generationBusy && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{generationStatus}</p>}
      </div>
      <Panel className="mb-6 grid gap-6 p-6 lg:grid-cols-[1.25fr_1fr_auto] lg:items-end">
        <div><span className="mb-3 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Type de scorecard</span><div className="grid grid-cols-2 gap-2">{SCORECARD_LEVELS.map((item) => <button key={item} onClick={() => setLevel(item)} aria-pressed={level===item} className={`choice-button ${level === item ? "choice-button-active" : ""}`}>{item}</button>)}</div></div>
        <label><span className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-[0.1em] text-slate-500"><span>Seuil global interne</span><span className="text-slate-900">{threshold} %</span></span><input type="range" min="40" max="90" step="5" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="w-full accent-indigo-600" /></label>
        <div><p className="mb-2 text-xs text-slate-600">Génération : {scorecardCriterionLimit(level)} questions principales maximum, avec une alternative par critère.</p><button onClick={generateScorecard} className="primary-button justify-center"><Sparkles className="h-4 w-4" />{scorecard ? "Régénérer" : "Générer"}</button></div>
      </Panel>
      {scorecard ? (
        <>
          <Panel className="mb-6 flex flex-wrap items-center gap-3 p-4">
            <Badge tone="accent">{scorecard.level}</Badge><Badge>{scorecard.method}</Badge><Badge>Échelle {scorecard.scale}</Badge><Badge>{scorecard.duration}</Badge><span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" /><span className="text-xs text-slate-500">{scorecard.metadata.layoutContractId}</span>
          </Panel>
          <details className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6"><summary className="cursor-pointer text-sm font-semibold">Pondération et preuves transférables</summary><p>Une preuve transférable peut atteindre le niveau attendu. L’absence de l’outil cible n’est pas un zéro automatique : distinguer la compétence démontrée et l’écart restant, puis vérifier le prérequis indispensable. Les questions et ancrages restent modifiables.</p><p className="mt-2 text-xs text-slate-600">Pondération actuelle : {scorecardWeights(scorecard.criteria).map(item=>`${item.dimension} : ${item.weight}`).join(' ; ')}. Poids issus des coefficients, modifiables.</p></details>{reviewScorecardProfile(scorecard.criteria,scorecard.profile??'Standard').map(warning=><p key={warning} className="mt-2 font-semibold text-amber-800">{warning}</p>)}
          <div id="scorecard-criteria" className="scroll-mt-24 grid gap-6 xl:grid-cols-[310px_minmax(0,1fr)]">
            <Panel className="h-fit overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold">Critères</h2><p className="text-xs text-slate-500">{scorecard.criteria.length} questions principales · alternatives disponibles</p></div><button onClick={addCriterion} className="icon-button" title="Ajouter un critère"><Plus className="h-4 w-4" /></button></div>
              <ScorecardCriteriaList criteria={scorecard.criteria} activeId={activeCriterion} onSelect={setActiveCriterion} onMove={reorderCriterion}/>
            </Panel>
            {criterion && (
              <Panel className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-600">Contenu métier</p><h2 className="mt-1 text-lg font-bold">Éditer le critère</h2></div><button onClick={() => deleteCriterion(criterion.id)} className="danger-button"><Trash2 className="h-4 w-4" />Supprimer</button></div>
                <div className="grid gap-6 p-6 sm:p-8">
                  <Field label="1. Critère" value={criterion.criterion} onChange={(value) => updateCriterion(criterion.id, "criterion", value)} placeholder="Nom du critère" rows={1} />
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label><span className="mb-2 block text-sm font-semibold">2. Type</span><select className="field-control h-11" value={criterion.type} onChange={(event) => updateCriterion(criterion.id, "type", event.target.value as ScorecardCriterion["type"])}><option>Hard skill</option><option>Soft skill</option><option>Hybride</option></select></label>
                    <label><span className="mb-2 block text-sm font-semibold">4. Coefficient</span><select className="field-control h-11" value={criterion.coefficient} onChange={(event) => updateCriterion(criterion.id, "coefficient", Number(event.target.value) as 1 | 2 | 3)}><option value="1">×1 Secondaire</option><option value="2">×2 Important</option><option value="3">×3 Critique</option></select></label>
                    <label><span className="mb-2 block text-sm font-semibold">5. Éliminatoire</span><select className="field-control h-11" value={criterion.eliminatory ? "yes" : "no"} onChange={(event) => updateCriterion(criterion.id, "eliminatory", event.target.value === "yes")}><option value="no">Non</option><option value="yes">Oui</option></select></label>
                    <label><span className="mb-2 block text-sm font-semibold">6. Minimum</span><select className="field-control h-11" value={criterion.minimum} onChange={(event) => updateCriterion(criterion.id, "minimum", Number(event.target.value) as 0 | 1 | 2 | 3)}><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
                  </div>
                  <label className="block text-sm font-semibold">Dimension d’évaluation<select className="field-control mt-2" value={criterion.dimension??(criterion.type==='Hard skill'?'Compétences métier':'Comportements et apprentissage')} onChange={event=>updateCriterion(criterion.id,'dimension',event.target.value as NonNullable<ScorecardCriterion['dimension']>)}>{SCORECARD_DIMENSIONS.map(dimension=><option key={dimension}>{dimension}</option>)}</select></label>
                  <Field label="3. Définition" value={criterion.definition} onChange={(value) => updateCriterion(criterion.id, "definition", value)} placeholder="Ce que ce critère mesure précisément" />
                  <Field label="7.1 Question principale : compétence nécessaire" value={criterion.mainQuestion} onChange={(value) => updateCriterion(criterion.id, "mainQuestion", value)} placeholder="Une activité du poste, un exemple vécu comparable et une action précise à expliquer" />
                  <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Question alternative de preuve</summary><div className="mt-4"><Field label="Question de transfert" value={criterion.transferQuestion ?? ""} onChange={(value) => updateCriterion(criterion.id, "transferQuestion", value)} placeholder="Une expérience dans un autre outil, secteur ou contexte mobilisant le même savoir-faire pour l’activité cible" hint="À utiliser si utile ; une seule note par critère." /></div></details>
                  <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Relances, preuves et ancrages de notation</summary><div className="mt-4 space-y-5"><Field label="8. Relances ciblées" value={criterion.followUps} onChange={(value) => updateCriterion(criterion.id, "followUps", value)} placeholder="Quel périmètre ? Quels contrôles ou arbitrages ? Comment le résultat a-t-il été vérifié ? Une question par ligne." rows={6} />
                  <Field label="9. Preuves attendues" value={criterion.expectedEvidence} onChange={(value) => updateCriterion(criterion.id, "expectedEvidence", value)} placeholder="Faits, livrables, mesures et comportements observables" />
                  <div><h3 className="mb-3 text-sm font-bold">10 à 13. Ancrages de notation 0–3</h3><div className="grid gap-3 lg:grid-cols-2">{([0, 1, 2, 3] as const).map((value) => { const key = `anchor${value}` as keyof ScorecardCriterion; return <label key={value} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-600"><span className="grid h-6 w-6 place-items-center rounded-md bg-slate-900 text-white">{value}</span>{value === 0 ? "Non démontré" : value === 1 ? "Partiel" : value === 2 ? "Démontré" : "Maîtrisé"}</span><textarea rows={3} value={String(criterion[key])} onChange={(event) => updateCriterion(criterion.id, key, event.target.value as never)} className="field-control resize-y bg-white" /></label>; })}</div></div>
                  <p className="text-xs text-slate-500">Les notes et preuves candidat sont renseignées pendant l’entretien et l’évaluation.</p></div></details>
                </div>
              </Panel>
            )}
          </div>
        </>
      ) : <EmptyState title="Aucune scorecard" text="Générez une grille à partir du brief actuel." action={<button onClick={generateScorecard} className="primary-button"><Sparkles className="h-4 w-4" />Générer la scorecard</button>} />}
    </div>
  );
}

function M3Module({
  criteria,
  selected,
  setSelected,
  synonyms,
  setSynonyms,
  sourcing,
  funnelDraft,
  setFunnelDraft,
  sourcingFeedback,setSourcingFeedback,sourcingProposal,sourcingStale,optimizeSourcing,applySourcingProposal,dismissSourcingProposal,sourcingBusy,
}: {
  criteria: string[];
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  synonyms: Record<string, string>;
  setSynonyms: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  sourcing: ReturnType<typeof buildSourcingStrategy>;
  funnelDraft: FunnelDraft;
  setFunnelDraft: React.Dispatch<React.SetStateAction<FunnelDraft>>;
  sourcingFeedback:string;setSourcingFeedback:(value:string)=>void;sourcingProposal:AISourcingPlan|null;sourcingStale:boolean;optimizeSourcing:()=>void;applySourcingProposal:()=>void;dismissSourcingProposal:()=>void;sourcingBusy:boolean;
}) {
  const toggle = (criterion: string) => {
    setSelected((current) => current.includes(criterion) ? current.filter((item) => item !== criterion) : current.length < 3 ? [...current, criterion] : current);
  };
  return (
    <div>
      <PageHeader eyebrow="Module 3" title="Sourcing" text="Préparer et copier les requêtes de recherche." />
      <SourcingAIPanel feedback={sourcingFeedback} setFeedback={setSourcingFeedback} busy={sourcingBusy} proposal={sourcingProposal} stale={sourcingStale} onOptimize={optimizeSourcing} onApply={applySourcingProposal} onDismiss={dismissSourcingProposal}/>
      {criteria.length ? (
        <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel className="overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4"><div className="flex items-center justify-between"><div><h2 className="font-bold">Critères professionnels</h2><p className="mt-1 text-xs text-slate-500">Sélectionnez trois axes maximum</p></div><Badge tone={selected.length === 3 ? "success" : "accent"}>{selected.length}/3</Badge></div></div>
              <button className="secondary-button m-3" onClick={()=>{const seen=new Set<string>();setSelected(criteria.filter(name=>{const terms=suggestSearchTerms(name);const key=terms.map(term=>term.toLowerCase()).sort().join('|');if(!key||seen.has(key))return false;seen.add(key);return true;}).slice(0,3));}}>Proposer trois axes recherchables</button>
              <div className="max-h-[500px] space-y-2 overflow-auto p-3">
                {criteria.map((criterion) => {
                  const checked = selected.includes(criterion);
                  const disabled = !checked && selected.length >= 3;
                  return <button key={criterion} onClick={() => toggle(criterion)} disabled={disabled} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${checked ? "border-indigo-300 bg-indigo-50" : "border-transparent hover:bg-slate-50"} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>{checked && <Check className="h-3.5 w-3.5" />}</span><span className="text-sm font-medium text-slate-700">{criterion}</span></button>;
                })}
              </div>
            </Panel>
            {sourcing.excluded.length > 0 && <Panel className="p-5"><h3 className="text-sm font-bold">Critères exclus du booléen</h3><p className="mt-1 text-xs leading-5 text-slate-500">Ils restent évaluables en qualification ou en entretien.</p><div className="mt-3 flex flex-wrap gap-2">{sourcing.excluded.map((item) => <Badge key={item}>{item}</Badge>)}</div></Panel>}
          </div>

          <div className="space-y-6">
            <Panel className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-600">Taxonomie et synonymes</p><h2 className="mt-1 text-lg font-bold">Affiner les trois axes</h2></div><Target className="h-6 w-6 text-indigo-600" /></div>
              <div className="mt-6 space-y-5">
                {sourcing.selected.length ? sourcing.selected.map((item, index) => (
                  <div key={item.name} className="rounded-xl border border-slate-200 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 text-xs font-bold text-white">{index + 1}</span><h3 className="font-semibold">{item.name}</h3></div><Badge tone={index === 0 ? "danger" : index === 1 ? "warning" : "accent"}>{item.reason}</Badge></div>
                    <label className="mt-4 block"><span className="mb-2 block text-xs font-semibold text-slate-600">Termes à rechercher, alternatives reliées par OR</span><textarea rows={3} value={synonyms[item.name] ?? item.synonyms.join("\n")} onChange={(event) => setSynonyms((current) => ({ ...current, [item.name]: event.target.value }))} placeholder="Un terme présent dans les CV par ligne. Pas de phrase ni d’opérateur." className="field-control resize-y" /></label>
                    {!item.synonyms.length && <p className="mt-2 text-xs text-amber-700">Axe à traduire en mots-clés ou à remplacer par un intitulé ou un outil du brief.</p>}
                  </div>
                )) : <p className="text-sm text-slate-500">Sélectionnez au moins un critère.</p>}
              </div>
            </Panel>

            <SourcingFunnelView funnel={sourcing.funnel} draft={funnelDraft} onChange={setFunnelDraft}/>

            <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Pourquoi ces mots-clés ?</summary><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">{sourcing.explanation.map((item) => <li key={item} className="flex gap-2"><span className="text-indigo-600">—</span>{item}</li>)}</ul></details>
          </div>
        </div>
      ) : <EmptyState title="Aucun critère disponible" text="Renseignez le brief ou générez une scorecard pour préparer les recherches." />}
    </div>
  );
}
