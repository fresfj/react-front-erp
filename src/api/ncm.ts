import type { NcmOption } from 'src/sections/fiscal/fiscal-tables';

import { httpsCallable } from 'firebase/functions';

import { FUNCTIONS } from 'src/lib/firebase';

import {
  stripHtmlTags,
  formatNcmCode,
  normalizeNcmDigits,
  COMMON_NCM_SUGGESTIONS,
} from 'src/sections/fiscal/fiscal-tables';

// ----------------------------------------------------------------------

const BRASIL_API_NCM_URL = 'https://brasilapi.com.br/api/ncm/v1';

type SiscomexSearchResponse = {
  source: 'siscomex';
  updatedAt?: string;
  act?: string;
  items: Array<{
    code: string;
    formattedCode: string;
    description: string;
  }>;
};

type BrasilApiNcmRow = {
  codigo?: string;
  descricao?: string;
};

const queryCache = new Map<string, NcmOption[]>();
let siscomexCallableAvailable = true;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function filterLocalSuggestions(query: string): NcmOption[] {
  const trimmed = query.trim();
  if (!trimmed) return COMMON_NCM_SUGGESTIONS;
  const digits = normalizeNcmDigits(trimmed);
  const norm = normalizeText(trimmed);

  return COMMON_NCM_SUGGESTIONS.filter((item) => {
    if (digits.length >= 2 && item.code.startsWith(digits)) return true;
    return normalizeText(`${item.code} ${item.description}`).includes(norm);
  });
}

async function searchViaSiscomexCallable(query: string, limit: number): Promise<NcmOption[]> {
  const fn = httpsCallable<{ query: string; limit: number }, SiscomexSearchResponse>(
    FUNCTIONS,
    'searchSiscomexNcm'
  );
  const res = await fn({ query, limit });
  const items = Array.isArray(res.data?.items) ? res.data.items : [];
  return items
    .map((item) => {
      const code = normalizeNcmDigits(item.code);
      if (code.length !== 8) return null;
      return {
        code,
        formattedCode: item.formattedCode || formatNcmCode(code),
        description: stripHtmlTags(item.description),
        source: 'siscomex' as const,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

async function searchViaBrasilApi(
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<NcmOption[]> {
  const url = `${BRASIL_API_NCM_URL}?search=${encodeURIComponent(query.trim())}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    throw new Error(`BrasilAPI NCM HTTP ${res.status}`);
  }

  const rows = (await res.json()) as BrasilApiNcmRow[];
  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  const results: NcmOption[] = [];

  rows.forEach((row) => {
    const code = normalizeNcmDigits(row.codigo);
    if (code.length !== 8 || seen.has(code)) return;
    seen.add(code);
    results.push({
      code,
      formattedCode: formatNcmCode(code),
      description: stripHtmlTags(row.descricao),
      source: 'brasilapi',
    });
  });

  return results.slice(0, limit);
}

/**
 * Searches official 8-digit NCM codes.
 * Priority:
 * 1. Cloud Function backed by Portal Unico Siscomex official JSON (accent-insensitive, no CORS issues).
 * 2. BrasilAPI public NCM v1 endpoint (direct browser fallback, mirrors Siscomex).
 * 3. Local offline suggestions.
 */
export async function searchNcmOptions(
  query: string,
  options?: { limit?: number; signal?: AbortSignal }
): Promise<NcmOption[]> {
  const trimmed = query.trim();
  const limit = options?.limit ?? 25;

  if (trimmed.length < 2) {
    return filterLocalSuggestions(trimmed);
  }

  const cacheKey = `${trimmed.toLowerCase()}::${limit}`;
  const cached = queryCache.get(cacheKey);
  if (cached) return cached;

  let remote: NcmOption[] = [];

  if (siscomexCallableAvailable) {
    try {
      remote = await searchViaSiscomexCallable(trimmed, limit);
    } catch {
      siscomexCallableAvailable = false;
    }
  }

  if (remote.length === 0) {
    try {
      remote = await searchViaBrasilApi(trimmed, limit, options?.signal);
    } catch {
      // Offline or aborted — fall through to local suggestions
    }
  }

  const local = filterLocalSuggestions(trimmed);
  const seen = new Set<string>();
  const merged: NcmOption[] = [];

  [...remote, ...local].forEach((item) => {
    if (seen.has(item.code)) return;
    seen.add(item.code);
    merged.push(item);
  });

  const finalList = merged.slice(0, limit);
  if (remote.length > 0) {
    queryCache.set(cacheKey, finalList);
  }
  return finalList;
}
