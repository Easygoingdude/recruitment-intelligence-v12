import type { ScorecardProfile } from './scorecard-profiles';
import type { BriefData } from './recruitment-engine';

export type AITask = 'analyze' | 'offer' | 'scorecard' | 'import' | 'sourcing';
export interface AISourcingAxisInput {name:string;exactTerms:string[];locked:boolean;}
export interface AISourcingPlan {
  summary:string;
  axes:Array<{name:string;exactTerms:string[];adjacentTerms:string[];transferableTerms:string[];locked:boolean;reason:string;verify:string;evidence:Array<{field:keyof BriefData|'requestedCriteria';excerpt:string}>}>;
  warnings:string[];
}
export type AIModelPreference = 'auto' | 'luna' | 'sol';
export type AIAnalysis = {
  synthesis: string;
  strengths: string[];
  missingInformation: Array<{ field: string; reason: string; question: string }>;
  contradictions: Array<{ finding: string; evidence: string; question: string }>;
  arbitrations: Array<{ requirement: string; recommendation: string; justification: string }>;
  followUpQuestions: string[];
  warnings: string[];
};
export interface AIEnvelope<T = unknown> {
  task: AITask;
  runId: string;
  status: 'AI_PROPOSED';
  model: string;
  reasoningEffort: 'low' | 'medium';
  routingMode: AIModelPreference;
  promptVersion: string;
  profileVersion: string;
  generatedAt: string;
  sourceRefs: Array<{ id: string; title: string; usage: string }>;
  warnings: string[];
  privacy: { mode: 'minimised' | 'candidate-pseudonymised'; candidateReference?: string; redactions: number };
  usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cachedWriteTokens?: number; reasoningTokens?: number };
  cache?: {
    hit: boolean;
    layer: 'none' | 'browser' | 'server';
    keyVersion: string;
    reusedAt?: string;
    expiresAt?: string;
  };
  optimization?: {
    promptCache: 'implicit-30m' | 'disabled-private';
    rag: { mode: 'lexical-selective'; selectedExcerpts: number; selectedCharacters: number; corpusCharacters: number };
    harness: { modelCalls: number; maxRetries: 0 };
  };
  output: T;
}
export type AIRequest = {
  task: AITask;
  brief?: BriefData;
  sourceText?: string;
  sourceName?: string;
  sectionId?:'why'|'problems'|'expectations'|'required'|'plus'|'realities'|'value'|'conditions';
  styleCorpus?: string;
  format?: 'Courte' | 'Standard' | 'Détaillée';
  tone?: 'Professionnel direct' | 'Institutionnel' | 'Dynamique';
  level?: 'Opérationnel' | 'Manager' | 'Direction' | 'Jeune diplômé';
  scorecardProfile?: ScorecardProfile;
  globalThreshold?: number;
  criteria?: string[];
  sourcingAxes?: AISourcingAxisInput[];
  sourcingFeedback?: string;
  modelPreference?: AIModelPreference;
  resultCacheMode?: 'prefer' | 'refresh';
  dataScope?: 'job' | 'candidate';
  candidateName?: string;
  candidateReference?: string;
};
