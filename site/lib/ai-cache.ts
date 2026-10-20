import type { AIRequest } from './ai-contract';

export const AI_PROMPT_VERSION = 'RI_V12_AI_1_11';
export const AI_RESULT_CACHE_VERSION = 'RI_RESULT_CACHE_10';
export const SERVER_RESULT_CACHE_TTL_MS = 30 * 60 * 1000;
export const BROWSER_RESULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_BROWSER_RESULT_CACHE_ENTRIES = 12;

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalise(item)]),
    );
  }
  return value;
}

function withoutCacheDirective(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const { resultCacheMode: _resultCacheMode, ...content } = input as Record<string, unknown>;
  return content;
}

export async function createAIResultCacheKey(
  input: AIRequest | Record<string, unknown>,
  namespace: string,
): Promise<string | null> {
  if ((input as AIRequest).dataScope === 'candidate' || !globalThis.crypto?.subtle) return null;
  const serialised = JSON.stringify(canonicalise({
    version: AI_RESULT_CACHE_VERSION,
    namespace,
    input: withoutCacheDirective(input),
  }));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialised));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `${AI_RESULT_CACHE_VERSION}:${hex}`;
}
