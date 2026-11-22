import type {
  Product,
  ProductType,
  ProductComboItem,
  ProductServingTemp,
  ProductDiscountType,
} from 'src/api/firestore/products';

// ----------------------------------------------------------------------

export type ProductImportPayload = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

export type ParsedImportRow = {
  rowIndex: number;
  payload: ProductImportPayload;
  warnings: string[];
};

export type ParseImportResult = {
  rows: ParsedImportRow[];
  errors: string[];
  detectedFormat: 'csv' | 'json';
};

export const PRODUCT_CSV_HEADERS = [
  'sku',
  'name',
  'type',
  'category',
  'unit',
  'salePrice',
  'costPrice',
  'promoActive',
  'discountType',
  'discountValue',
  'servingTemperature',
  'isCombo',
  'comboItems',
  'servesCount',
  'featured',
  'showOnline',
  'minStock',
  'ean',
  'variant',
  'description',
  'imageUrl',
  'tags',
  'active',
] as const;

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function normalizeKey(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function escapeCsvCell(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[;"\n\r,]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseBool(raw: unknown, fallback = false): boolean {
  if (typeof raw === 'boolean') return raw;
  const s = normalizeKey(String(raw ?? ''));
  if (!s) return fallback;
  if (['true', '1', 'sim', 'yes', 's', 'y', 'ativo', 'ativa', 'disponivel'].includes(s)) {
    return true;
  }
  if (['false', '0', 'nao', 'no', 'n', 'inativo', 'inativa', 'pausado', 'indisponivel'].includes(s)) {
    return false;
  }
  return fallback;
}

function parseMoney(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  let cleaned = String(raw)
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return undefined;
  // Brazilian format "1.234,56" -> "1234.56"
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : undefined;
}

function parseServingTemp(raw: unknown): ProductServingTemp | undefined {
  const s = normalizeKey(String(raw ?? ''));
  if (!s || s === 'none' || s === 'nenhum') return undefined;
  if (['cold', 'gelado', 'frio', 'ice', 'frozen'].includes(s)) return 'cold';
  if (['hot', 'quente', 'warm', 'chapa'].includes(s)) return 'hot';
  return undefined;
}

function parseProductType(raw: unknown): ProductType {
  const s = normalizeKey(String(raw ?? ''));
  if (['raw', 'insumo', 'materia_prima', 'mp'].includes(s)) return 'raw';
  return 'finished';
}

function parseDiscountType(raw: unknown): ProductDiscountType | undefined {
  const s = normalizeKey(String(raw ?? ''));
  if (!s) return undefined;
  if (['fixed', 'fixo', 'valor', 'valor_fixo', 'brl', 'r'].includes(s)) return 'fixed';
  if (['percent', 'percentual', 'porcentagem', 'pct'].includes(s)) return 'percent';
  return undefined;
}

function parseComboItems(raw: unknown): ProductComboItem[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    const mapped = raw
      .map((item, idx) => {
        const rec = item as Record<string, unknown>;
        const productName = String(rec.productName || rec.name || '').trim();
        const productId = String(rec.productId || rec.sku || `combo-item-${idx + 1}`).trim();
        const qty = Math.max(1, Number(rec.qty || rec.quantity || 1));
        return productName ? { productId, productName, qty } : null;
      })
      .filter((x): x is ProductComboItem => x !== null);
    return mapped.length ? mapped : undefined;
  }

  const str = String(raw).trim();
  if (!str) return undefined;

  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      return parseComboItems(parsed);
    } catch {
      // fall through to pipe-delimited parsing
    }
  }

  // Format: "2x Açaí 500ml | 1x Milkshake"
  const parts = str
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);

  const items: ProductComboItem[] = [];
  parts.forEach((part, idx) => {
    const match = part.match(/^(\d+)\s*x\s+(.+)$/i);
    const qty = match ? Math.max(1, Number(match[1])) : 1;
    const productName = (match ? match[2] : part).trim();
    if (productName) {
      items.push({
        productId: `combo-item-${idx + 1}`,
        productName,
        qty,
      });
    }
  });
  return items.length ? items : undefined;
}

function parseTags(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    const list = raw.map((t) => String(t).trim()).filter(Boolean);
    return list.length ? list : undefined;
  }
  const list = String(raw)
    .split(/[|,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function autoSku(name: string, index: number): string {
  const prefix = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 10);
  return `${prefix || 'PROD'}-${String(index + 1).padStart(3, '0')}`;
}

// ----------------------------------------------------------------------
// Export (CSV & JSON & Template)
// ----------------------------------------------------------------------

export function formatComboItemsForCsv(items?: ProductComboItem[]): string {
  if (!items?.length) return '';
  return items.map((i) => `${i.qty}x ${i.productName}`).join(' | ');
}

export function exportProductsToCsv(products: Product[]): string {
  const lines = [
    PRODUCT_CSV_HEADERS.join(';'),
    ...products.map((p) =>
      [
        p.sku || '',
        p.name || '',
        p.type || 'finished',
        p.category || '',
        p.unit || 'un',
        p.salePrice != null ? p.salePrice.toFixed(2) : '',
        p.costPrice != null ? p.costPrice.toFixed(2) : '',
        p.promoActive ? 'true' : 'false',
        p.discountType || '',
        p.discountValue != null ? String(p.discountValue) : '',
        p.servingTemperature || '',
        p.isCombo ? 'true' : 'false',
        formatComboItemsForCsv(p.comboItems),
        p.servesCount != null ? String(p.servesCount) : '',
        p.featured ? 'true' : 'false',
        p.showOnline ? 'true' : 'false',
        p.minStock != null ? String(p.minStock) : '',
        p.ean || '',
        p.variant || '',
        p.description || '',
        p.imageUrl || '',
        (p.tags || []).join(' | '),
        p.active !== false ? 'true' : 'false',
      ]
        .map(escapeCsvCell)
        .join(';')
    ),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

export function exportProductsToJson(products: Product[]): string {
  const clean = products.map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => rest);
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), products: clean }, null, 2);
}

export function buildProductImportTemplateCsv(): string {
  const sample: Product[] = [
    {
      id: 'tpl-1',
      sku: 'ACA-500-GEL',
      name: 'Açaí Cremoso 500ml',
      type: 'finished',
      category: 'Potes & Copos Prontos',
      unit: 'un',
      salePrice: 26,
      costPrice: 9.5,
      promoActive: true,
      discountType: 'percent',
      discountValue: 15,
      servingTemperature: 'cold',
      isCombo: false,
      servesCount: 1,
      featured: true,
      showOnline: true,
      minStock: 10,
      description: 'Açaí batido bem gelado com banana, morango e granola crocante.',
      imageUrl: 'https://pecadodagula.lojadigitalds.com.br/_core/_uploads/331/2025/04/1619130425b2c7edd5dc.png',
      tags: ['Gelado', '500ml'],
      active: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'tpl-2',
      sku: 'CMB-BURGER-01',
      name: 'Combo Burger Duplo + Batata + Milkshake',
      type: 'finished',
      category: 'Combos & Promoções',
      unit: 'un',
      salePrice: 74,
      costPrice: 27,
      promoActive: true,
      discountType: 'fixed',
      discountValue: 12,
      servingTemperature: 'hot',
      isCombo: true,
      comboItems: [
        { productId: 'item-1', productName: 'Smash Burger Duplo', qty: 1 },
        { productId: 'item-2', productName: 'Batata Cheddar e Bacon', qty: 1 },
        { productId: 'item-3', productName: 'Milkshake 400ml', qty: 1 },
      ],
      servesCount: 2,
      featured: true,
      showOnline: true,
      minStock: 10,
      description: 'Combo completo na chapa quente com acompanhamento e milkshake.',
      imageUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
      tags: ['Combo', 'Quente'],
      active: true,
      createdAt: '',
      updatedAt: '',
    },
  ];
  return exportProductsToCsv(sample);
}

// ----------------------------------------------------------------------
// Smart Multi-Platform Import Parser (ERP Minimals / iFood / 99Food / Anota AI)
// ----------------------------------------------------------------------

const FIELD_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'codigo', 'cod', 'codigo_pdv', 'cod_pdv', 'external_code', 'id_externo', 'codigo_externo'],
  name: ['name', 'nome', 'produto', 'item', 'titulo', 'title', 'nome_do_produto', 'nome_do_item', 'product_name'],
  type: ['type', 'tipo', 'tipo_produto'],
  category: ['category', 'categoria', 'grupo', 'secao', 'departamento'],
  unit: ['unit', 'unidade', 'un', 'medida'],
  salePrice: ['saleprice', 'sale_price', 'preco', 'preco_venda', 'preco_de_venda', 'valor', 'price', 'valor_unitario', 'preco_original'],
  promoPrice: ['promoprice', 'promo_price', 'preco_promocional', 'valor_promocional', 'preco_com_desconto', 'promotional_price'],
  costPrice: ['costprice', 'cost_price', 'custo', 'preco_custo', 'preco_de_custo', 'cmv', 'cost'],
  promoActive: ['promoactive', 'promo_active', 'em_promocao', 'promocao', 'desconto_ativo'],
  discountType: ['discounttype', 'discount_type', 'tipo_desconto', 'tipo_de_desconto'],
  discountValue: ['discountvalue', 'discount_value', 'desconto', 'valor_desconto', 'percentual_desconto'],
  servingTemperature: ['servingtemperature', 'serving_temperature', 'temperatura', 'temp', 'gelado_quente'],
  isCombo: ['iscombo', 'is_combo', 'combo', 'eh_combo'],
  comboItems: ['comboitems', 'combo_items', 'itens_combo', 'itens_do_combo', 'composicao'],
  servesCount: ['servescount', 'serves_count', 'serve', 'serve_pessoas', 'porcao_pessoas', 'pessoas'],
  featured: ['featured', 'destaque', 'mais_pedido'],
  showOnline: ['showonline', 'show_online', 'vitrine', 'cardapio_online', 'online', 'visivel_online'],
  minStock: ['minstock', 'min_stock', 'estoque_minimo', 'estoque_min'],
  ean: ['ean', 'gtin', 'codigo_barras', 'codigo_de_barras', 'barcode'],
  variant: ['variant', 'variacao', 'tamanho'],
  description: ['description', 'descricao', 'detalhes', 'ingredientes', 'obs'],
  imageUrl: ['imageurl', 'image_url', 'imagem', 'foto', 'url_imagem', 'url_da_imagem', 'image', 'photo_url', 'link_imagem'],
  tags: ['tags', 'etiquetas', 'atributos'],
  active: ['active', 'ativo', 'status', 'disponivel'],
};

function pickAliasValue(record: Record<string, unknown>, field: keyof typeof FIELD_ALIASES): unknown {
  const aliases = FIELD_ALIASES[field];
  for (let i = 0; i < aliases.length; i += 1) {
    const key = aliases[i];
    if (record[key] !== undefined && record[key] !== '') {
      return record[key];
    }
  }
  return undefined;
}

function parseCsvMatrix(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] || '';
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolonCount >= commaCount ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c !== '')) {
    rows.push(row);
  }

  return rows;
}

function mapNormalizedRecord(
  rawRecord: Record<string, unknown>,
  rowIndex: number
): ParsedImportRow | { error: string } {
  const normalized: Record<string, unknown> = {};
  Object.entries(rawRecord).forEach(([k, v]) => {
    normalized[normalizeKey(k)] = v;
  });

  const name = String(pickAliasValue(normalized, 'name') ?? '').trim();
  if (!name) {
    return { error: `Linha ${rowIndex}: nome do produto ausente.` };
  }

  const warnings: string[] = [];
  const rawSku = String(pickAliasValue(normalized, 'sku') ?? '').trim();
  const sku = rawSku || autoSku(name, rowIndex - 1);
  if (!rawSku) {
    warnings.push(`SKU gerado automaticamente (${sku})`);
  }

  const salePrice = parseMoney(pickAliasValue(normalized, 'salePrice'));
  const promoPrice = parseMoney(pickAliasValue(normalized, 'promoPrice'));
  const costPrice = parseMoney(pickAliasValue(normalized, 'costPrice'));

  let promoActive = parseBool(pickAliasValue(normalized, 'promoActive'), false);
  let discountType = parseDiscountType(pickAliasValue(normalized, 'discountType'));
  let discountValue = parseMoney(pickAliasValue(normalized, 'discountValue'));

  // Suporte a planilhas iFood / Anota AI que trazem "preco_promocional" em vez de desconto
  if (
    promoPrice != null &&
    salePrice != null &&
    promoPrice > 0 &&
    promoPrice < salePrice &&
    !discountValue
  ) {
    promoActive = true;
    discountType = 'fixed';
    discountValue = Math.round((salePrice - promoPrice) * 100) / 100;
  } else if (discountValue && discountValue > 0 && pickAliasValue(normalized, 'promoActive') === undefined) {
    promoActive = true;
    discountType = discountType || 'percent';
  }

  const comboItems = parseComboItems(pickAliasValue(normalized, 'comboItems'));
  const isCombo = parseBool(pickAliasValue(normalized, 'isCombo'), Boolean(comboItems?.length));

  const servesRaw = parseMoney(pickAliasValue(normalized, 'servesCount'));
  const minStockRaw = parseMoney(pickAliasValue(normalized, 'minStock'));

  const payload: ProductImportPayload = {
    name,
    sku,
    ean: String(pickAliasValue(normalized, 'ean') ?? '').trim() || undefined,
    type: parseProductType(pickAliasValue(normalized, 'type')),
    category: String(pickAliasValue(normalized, 'category') ?? '').trim() || undefined,
    description: String(pickAliasValue(normalized, 'description') ?? '').trim() || undefined,
    unit: String(pickAliasValue(normalized, 'unit') ?? 'un').trim() || 'un',
    costPrice,
    salePrice,
    promoActive,
    discountType: promoActive ? discountType || 'percent' : undefined,
    discountValue: promoActive ? discountValue : undefined,
    servingTemperature: parseServingTemp(pickAliasValue(normalized, 'servingTemperature')),
    isCombo,
    comboItems: isCombo ? comboItems : undefined,
    servesCount: servesRaw && servesRaw > 0 ? Math.round(servesRaw) : undefined,
    featured: parseBool(pickAliasValue(normalized, 'featured'), false),
    minStock: minStockRaw ?? 10,
    variant: String(pickAliasValue(normalized, 'variant') ?? '').trim() || undefined,
    tags: parseTags(pickAliasValue(normalized, 'tags')),
    imageUrl: String(pickAliasValue(normalized, 'imageUrl') ?? '').trim() || undefined,
    showOnline: parseBool(pickAliasValue(normalized, 'showOnline'), true),
    active: parseBool(pickAliasValue(normalized, 'active'), true),
  };

  return { rowIndex, payload, warnings };
}

export function parseImportedProducts(content: string, filename = ''): ParseImportResult {
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    return { rows: [], errors: ['Arquivo vazio.'], detectedFormat: 'csv' };
  }

  const isJson =
    filename.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[');

  if (isJson) {
    try {
      const parsed = JSON.parse(trimmed);
      const list: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.products)
          ? parsed.products
          : Array.isArray(parsed?.items)
            ? parsed.items
            : [];
      if (!list.length) {
        return {
          rows: [],
          errors: ['JSON válido, mas nenhum array de produtos encontrado.'],
          detectedFormat: 'json',
        };
      }
      const rows: ParsedImportRow[] = [];
      const errors: string[] = [];
      list.forEach((item, idx) => {
        const res = mapNormalizedRecord((item || {}) as Record<string, unknown>, idx + 1);
        if ('error' in res) errors.push(res.error);
        else rows.push(res);
      });
      return { rows, errors, detectedFormat: 'json' };
    } catch {
      return { rows: [], errors: ['Arquivo JSON inválido.'], detectedFormat: 'json' };
    }
  }

  const matrix = parseCsvMatrix(trimmed);
  if (matrix.length < 2) {
    return {
      rows: [],
      errors: ['Planilha CSV precisa ter cabeçalho e pelo menos 1 linha de produto.'],
      detectedFormat: 'csv',
    };
  }

  const headers = matrix[0];
  const rows: ParsedImportRow[] = [];
  const errors: string[] = [];

  for (let r = 1; r < matrix.length; r += 1) {
    const record: Record<string, unknown> = {};
    headers.forEach((h, cIdx) => {
      record[h] = matrix[r][cIdx] ?? '';
    });
    const res = mapNormalizedRecord(record, r + 1);
    if ('error' in res) errors.push(res.error);
    else rows.push(res);
  }

  return { rows, errors, detectedFormat: 'csv' };
}
