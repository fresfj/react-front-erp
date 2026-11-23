/**
 * Public NCM lookup backed by Portal Unico Siscomex official JSON table.
 * Source: https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json
 *
 * Cached in memory per Cloud Function instance to avoid downloading the ~3MB file on every request.
 */

const SISCOMEX_NCM_URL =
  'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

let cachedIndex = null;
let cachedAt = 0;

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—\s]+/, '')
    .trim();
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseSiscomexPayload(payload) {
  const list = Array.isArray(payload?.Nomenclaturas) ? payload.Nomenclaturas : [];
  const items = [];
  const seen = new Set();

  for (const row of list) {
    const rawCode = String(row?.Codigo || '').trim();
    const digits = digitsOnly(rawCode);
    if (digits.length !== 8 || seen.has(digits)) continue;
    seen.add(digits);

    const description = stripHtml(row?.Descricao || '');
    items.push({
      code: digits,
      formattedCode: `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`,
      description,
      searchText: `${digits} ${normalizeSearchText(description)}`,
      startDate: row?.Data_Inicio ? String(row.Data_Inicio) : undefined,
      endDate: row?.Data_Fim ? String(row.Data_Fim) : undefined,
    });
  }

  return {
    updatedAt: payload?.Data_Ultima_Atualizacao_NCM
      ? String(payload.Data_Ultima_Atualizacao_NCM)
      : undefined,
    act: payload?.Ato ? String(payload.Ato) : undefined,
    items,
  };
}

async function loadSiscomexNcmIndex(fetchImpl = fetch) {
  const now = Date.now();
  if (cachedIndex && now - cachedAt < CACHE_TTL_MS) {
    return cachedIndex;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchImpl(SISCOMEX_NCM_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Siscomex HTTP ${res.status}`);
    }
    const json = await res.json();
    cachedIndex = parseSiscomexPayload(json);
    cachedAt = now;
    return cachedIndex;
  } finally {
    clearTimeout(timer);
  }
}

function filterNcmIndex(index, query, limit = 25) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 25));
  const rawQuery = String(query || '').trim();
  const queryDigits = digitsOnly(rawQuery);
  const normalizedQuery = normalizeSearchText(rawQuery);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  if (!rawQuery) {
    return index.items.slice(0, safeLimit).map(({ searchText, ...item }) => item);
  }

  const exactPrefix = [];
  const partialMatches = [];

  for (const item of index.items) {
    if (queryDigits.length >= 2 && item.code.startsWith(queryDigits)) {
      exactPrefix.push(item);
      if (exactPrefix.length >= safeLimit) break;
      continue;
    }

    if (terms.length > 0 && terms.every((term) => item.searchText.includes(term))) {
      partialMatches.push(item);
    }
  }

  const combined = [...exactPrefix, ...partialMatches].slice(0, safeLimit);
  return combined.map(({ searchText, ...item }) => item);
}

async function searchSiscomexNcm({ query, limit = 25, fetchImpl } = {}) {
  const index = await loadSiscomexNcmIndex(fetchImpl);
  const items = filterNcmIndex(index, query, limit);
  return {
    source: 'siscomex',
    updatedAt: index.updatedAt,
    act: index.act,
    items,
  };
}

function clearSiscomexNcmCache() {
  cachedIndex = null;
  cachedAt = 0;
}

module.exports = {
  SISCOMEX_NCM_URL,
  digitsOnly,
  stripHtml,
  normalizeSearchText,
  parseSiscomexPayload,
  filterNcmIndex,
  loadSiscomexNcmIndex,
  searchSiscomexNcm,
  clearSiscomexNcmCache,
};
