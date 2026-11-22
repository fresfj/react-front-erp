import { it, expect, describe } from 'vitest';

import {
  exportProductsToCsv,
  parseImportedProducts,
  buildProductImportTemplateCsv,
} from './product-import-export';

// ----------------------------------------------------------------------

describe('product-import-export', () => {
  it('round-trips the standard CSV template with promos, combos and servingTemperature', () => {
    const csv = buildProductImportTemplateCsv();
    const parsed = parseImportedProducts(csv, 'modelo-produtos.csv');

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.detectedFormat).toBe('csv');
    expect(parsed.rows).toHaveLength(2);

    const first = parsed.rows[0].payload;
    expect(first.sku).toBe('ACA-500-GEL');
    expect(first.servingTemperature).toBe('cold');
    expect(first.promoActive).toBe(true);
    expect(first.discountType).toBe('percent');
    expect(first.discountValue).toBe(15);

    const second = parsed.rows[1].payload;
    expect(second.isCombo).toBe(true);
    expect(second.servingTemperature).toBe('hot');
    expect(second.comboItems).toHaveLength(3);
    expect(second.comboItems?.[0]).toMatchObject({ productName: 'Smash Burger Duplo', qty: 1 });
  });

  it('parses external iFood / Anota AI style CSV with Portuguese headers and promo_price', () => {
    const externalCsv = [
      'Nome do Produto,Categoria,Descrição,Preço,Preço Promocional,Temperatura,Foto',
      '"X-Bacon Artesanal","Lanches","Pão brioche e bacon","R$ 35,00","R$ 29,90","Quente","https://img.test/burger.jpg"',
      '"Suco Natural 500ml","Bebidas","Laranja fresca","R$ 12,50","","Gelado",""',
    ].join('\n');

    const parsed = parseImportedProducts(externalCsv, 'ifood-cardapio.csv');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);

    const burger = parsed.rows[0].payload;
    expect(burger.name).toBe('X-Bacon Artesanal');
    expect(burger.salePrice).toBe(35);
    expect(burger.promoActive).toBe(true);
    expect(burger.discountType).toBe('fixed');
    expect(burger.discountValue).toBe(5.1);
    expect(burger.servingTemperature).toBe('hot');
    expect(burger.imageUrl).toBe('https://img.test/burger.jpg');
    expect(burger.showOnline).toBe(true);

    const juice = parsed.rows[1].payload;
    expect(juice.servingTemperature).toBe('cold');
    expect(juice.promoActive).toBe(false);
  });

  it('parses JSON export cleanly and re-exports valid CSV', () => {
    const json = JSON.stringify({
      products: [
        {
          sku: 'JSON-01',
          name: 'Combo Família',
          salePrice: 89.9,
          isCombo: true,
          comboItems: [{ productName: 'Açaí 1L', qty: 2 }],
          servingTemperature: 'cold',
        },
      ],
    });
    const parsed = parseImportedProducts(json, 'catalogo.json');
    expect(parsed.detectedFormat).toBe('json');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].payload.comboItems?.[0].qty).toBe(2);

    const csvOut = exportProductsToCsv([
      { ...parsed.rows[0].payload, id: '1', createdAt: '', updatedAt: '' },
    ]);
    expect(csvOut).toContain('JSON-01');
    expect(csvOut).toContain('2x Açaí 1L');
  });
});
