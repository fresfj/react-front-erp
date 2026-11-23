import type { Product } from 'src/api/firestore/products';

// ----------------------------------------------------------------------

export type SmartSearchMatch = {
  product: Product;
  score: number;
};

export function normalizeSearchText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Fast bounded Levenshtein distance (returns > maxDist early) for typo tolerance
 * similar to Algolia / Typesense (1 typo allowed on tokens >= 4 chars).
 */
function isWithinEditDistanceOne(a: string, b: string): boolean {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < lenA && j < lenB) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else {
      edits += 1;
      if (edits > 1) return false;
      if (lenA > lenB) {
        i += 1;
      } else if (lenB > lenA) {
        j += 1;
      } else {
        i += 1;
        j += 1;
      }
    }
  }

  if (i < lenA || j < lenB) edits += 1;
  return edits <= 1;
}

function tokenMatchesWord(token: string, words: string[]): 'prefix' | 'contains' | 'typo' | null {
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word.startsWith(token)) return 'prefix';
    if (word.includes(token)) return 'contains';
  }
  if (token.length >= 4) {
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      if (word.length >= 4 && isWithinEditDistanceOne(token, word.slice(0, token.length + 1))) {
        return 'typo';
      }
      if (word.length >= 4 && isWithinEditDistanceOne(token, word)) {
        return 'typo';
      }
    }
  }
  return null;
}

/**
 * Intelligent multi-token, accent-insensitive, typo-tolerant product search
 * with relevance ranking (inspired by Algolia / Typesense).
 */
export function smartSearchProducts(
  products: Product[],
  query: string,
  options?: { limit?: number; category?: string | null }
): Product[] {
  const limit = options?.limit ?? 12;
  const activeFinished = products.filter((p) => p.active && p.type === 'finished');

  const categoryScoped =
    options?.category && options.category !== 'all'
      ? activeFinished.filter((p) =>
          options.category === '__featured__'
            ? Boolean(p.featured || p.isCombo)
            : p.category === options.category
        )
      : activeFinished;

  const normQuery = normalizeSearchText(query);
  if (!normQuery) {
    // Default view: prioritize featured/combos first, never dump entire catalog at once
    const sorted = [...categoryScoped].sort((a, b) => {
      const fa = a.featured ? 2 : a.isCombo ? 1 : 0;
      const fb = b.featured ? 2 : b.isCombo ? 1 : 0;
      if (fb !== fa) return fb - fa;
      return a.name.localeCompare(b.name);
    });
    return sorted.slice(0, limit);
  }

  const tokens = normQuery.split(/\s+/).filter(Boolean);
  const scored: SmartSearchMatch[] = [];

  categoryScoped.forEach((product) => {
    const nameNorm = normalizeSearchText(product.name);
    const skuNorm = normalizeSearchText(product.sku);
    const eanNorm = normalizeSearchText(product.ean);
    const catNorm = normalizeSearchText(product.category);
    const variantNorm = normalizeSearchText(product.variant);
    const descNorm = normalizeSearchText(product.description);
    const tagsNorm = (product.tags || []).map((tag) => normalizeSearchText(tag)).join(' ');

    const nameWords = nameNorm.split(/[\s\-_/.,+()]+/).filter(Boolean);
    const metaWords = `${skuNorm} ${eanNorm} ${catNorm} ${variantNorm} ${tagsNorm} ${descNorm}`
      .split(/[\s\-_/.,+()]+/)
      .filter(Boolean);

    let score = 0;

    if (skuNorm === normQuery || eanNorm === normQuery) {
      score += 150;
    } else if (nameNorm === normQuery) {
      score += 130;
    } else if (nameNorm.startsWith(normQuery)) {
      score += 90;
    }

    let allTokensMatched = true;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const nameHit = tokenMatchesWord(token, nameWords);
      if (nameHit === 'prefix') {
        score += 55;
      } else if (nameHit === 'contains') {
        score += 35;
      } else if (nameHit === 'typo') {
        score += 20;
      } else {
        const metaHit = tokenMatchesWord(token, metaWords);
        if (metaHit === 'prefix') {
          score += 25;
        } else if (metaHit === 'contains') {
          score += 15;
        } else if (metaHit === 'typo') {
          score += 8;
        } else {
          allTokensMatched = false;
          break;
        }
      }
    }

    if (allTokensMatched && score > 0) {
      if (product.featured) score += 5;
      scored.push({ product, score });
    }
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.product.name.localeCompare(b.product.name);
  });

  return scored.slice(0, limit).map((item) => item.product);
}

/**
 * Splits a text into highlighted segments matching any query token (accent-insensitive).
 */
export function getHighlightParts(
  text: string,
  query: string
): Array<{ text: string; highlight: boolean }> {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return [{ text, highlight: false }];

  const tokens = normQuery.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [{ text, highlight: false }];

  // Build accent-stripped map preserving original character indices
  const normChars: string[] = [];
  const origIndices: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const stripped = text[i]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    for (let k = 0; k < stripped.length; k += 1) {
      normChars.push(stripped[k]);
      origIndices.push(i);
    }
  }
  const normText = normChars.join('');
  const matchedMask = new Array<boolean>(text.length).fill(false);

  tokens.forEach((token) => {
    let startIdx = 0;
    while (startIdx < normText.length) {
      const found = normText.indexOf(token, startIdx);
      if (found === -1) break;
      for (let pos = found; pos < found + token.length; pos += 1) {
        matchedMask[origIndices[pos]] = true;
      }
      startIdx = found + token.length;
    }
  });

  const parts: Array<{ text: string; highlight: boolean }> = [];
  let current = '';
  let currentFlag = matchedMask[0] ?? false;

  for (let i = 0; i < text.length; i += 1) {
    const flag = matchedMask[i];
    if (flag !== currentFlag && current) {
      parts.push({ text: current, highlight: currentFlag });
      current = '';
      currentFlag = flag;
    }
    current += text[i];
  }
  if (current) {
    parts.push({ text: current, highlight: currentFlag });
  }

  return parts;
}
