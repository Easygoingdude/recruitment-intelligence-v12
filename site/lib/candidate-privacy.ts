const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const URL = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com\/in\/|github\.com\/)\S+/giu;
const PHONE = /(?<!\d)(?:(?:\+|00)33[ .-]?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}(?!\d)/g;
const IDENTITY_NUMBER = /\b(?:[12][ .-]?\d{2}[ .-]?(?:0[1-9]|1[0-2])[ .-]?(?:2[AB]|\d{2})[ .-]?\d{3}[ .-]?\d{3}[ .-]?\d{2}|\d{9,14})\b/giu;
const POSTAL_ADDRESS = /\b\d{1,4}(?:\s*(?:bis|ter))?\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|impasse|allée|place|quai)\s+[^\n,;]{2,80}/giu;
const SOCIAL_HANDLE = /(?<![\p{L}\d_])@[\p{L}\d_][\p{L}\d_.-]{1,60}/gu;

const NAME_PART = /[\p{L}][\p{L}'’-]*/gu;
const INITIAL_REFERENCE = /^\p{Lu}\.\p{Lu}\.(?:-[A-Z0-9]{3,8})?$/u;

export class CandidatePrivacyError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export type CandidatePrivacyResult = {
  content: string;
  sourceName: string;
  reference: string;
  redactions: number;
};

export function redactDirectIdentifiers(value: string): { value: string; redactions: number } {
  let redactions = 0;
  const replace = (pattern: RegExp, label: string) => {
    value = value.replace(pattern, () => { redactions += 1; return `[${label} supprimé]`; });
  };
  replace(EMAIL, 'E-mail');
  replace(URL, 'Lien');
  replace(SOCIAL_HANDLE, 'Profil');
  replace(PHONE, 'Téléphone');
  replace(POSTAL_ADDRESS, 'Adresse');
  replace(IDENTITY_NUMBER, 'Identifiant');
  return { value, redactions };
}

export function candidateInitials(candidateName: string): string {
  const parts = candidateName.match(NAME_PART) ?? [];
  if (parts.length < 2) throw new CandidatePrivacyError('CANDIDATE_NAME_REQUIRED', 'Indiquez le prénom et le nom du candidat afin de le pseudonymiser avant tout appel au modèle.');
  const given = parts[0]![0]!.toLocaleUpperCase('fr-FR');
  const family = parts[parts.length - 1]![0]!.toLocaleUpperCase('fr-FR');
  return `${given}.${family}.`;
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function replaceCandidateName(value: string, candidateName: string, reference: string) {
  const parts = candidateName.match(NAME_PART) ?? [];
  const variants = [candidateName.trim(), [...parts].reverse().join(' '), ...parts]
    .filter(item => item.length >= 2)
    .sort((a, b) => b.length - a.length);
  let count = 0;
  for (const variant of variants) {
    value = value.replace(new RegExp(`(?<![\\p{L}])${escapeRegExp(variant)}(?![\\p{L}])`, 'giu'), () => { count += 1; return reference; });
  }
  return { value, count };
}

export function assertNoDirectIdentifiers(value: string) {
  const tests = [EMAIL, URL, PHONE, POSTAL_ADDRESS, IDENTITY_NUMBER, SOCIAL_HANDLE];
  for (const pattern of tests) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) throw new CandidatePrivacyError('PRIVACY_GATE_FAILED', 'Des coordonnées ou identifiants directs subsistent après pseudonymisation. Aucun contenu n’a été envoyé au modèle.');
  }
}

export function prepareCandidateForModel(input: { content: string; sourceName?: string; candidateName: string; candidateReference?: string }): CandidatePrivacyResult {
  const initials = candidateInitials(input.candidateName);
  const reference = input.candidateReference?.trim() || initials;
  if (!INITIAL_REFERENCE.test(reference)) throw new CandidatePrivacyError('INVALID_CANDIDATE_REFERENCE', 'La référence candidat doit utiliser les initiales prénom.nom, par exemple J.D. ou J.D.-A7K2.');
  if(reference.split('-')[0]!==initials)throw new CandidatePrivacyError('INVALID_CANDIDATE_REFERENCE','La référence doit correspondre aux initiales du candidat.');
  const named = replaceCandidateName(input.content, input.candidateName, reference);
  const direct = redactDirectIdentifiers(named.value);
  const namedFile = replaceCandidateName(input.sourceName || 'Document candidat', input.candidateName, reference);
  const safeFile = redactDirectIdentifiers(namedFile.value).value;
  assertNoDirectIdentifiers(direct.value);
  if (new RegExp(escapeRegExp(input.candidateName.trim()), 'iu').test(direct.value)) throw new CandidatePrivacyError('PRIVACY_GATE_FAILED', 'Le nom complet du candidat subsiste après pseudonymisation. Aucun contenu n’a été envoyé au modèle.');
  return { content: direct.value, sourceName: safeFile, reference, redactions: named.count + direct.redactions };
}
