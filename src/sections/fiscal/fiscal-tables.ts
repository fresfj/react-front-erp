import type { TaxRegime } from './nfce-domain';

// ----------------------------------------------------------------------

export type FiscalCodeOption = {
  code: string;
  label: string;
  group?: string;
};

export type FiscalOriginCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type FiscalOriginOption = {
  code: FiscalOriginCode;
  label: string;
};

export type NcmOption = {
  code: string;
  formattedCode: string;
  description: string;
  source?: 'siscomex' | 'brasilapi' | 'local';
};

// ----------------------------------------------------------------------
// Tabela A — Origem da Mercadoria (Ajuste SINIEF / Manual NF-e)

export const FISCAL_ORIGIN_OPTIONS: FiscalOriginOption[] = [
  { code: 0, label: 'Nacional, exceto as indicadas nos códigos 3, 4, 5 e 8' },
  { code: 1, label: 'Estrangeira — Importação direta, exceto a indicada no código 6' },
  { code: 2, label: 'Estrangeira — Adquirida no mercado interno, exceto a indicada no código 7' },
  {
    code: 3,
    label: 'Nacional, mercadoria ou bem com Conteúdo de Importação superior a 40% e até 70%',
  },
  {
    code: 4,
    label: 'Nacional, cuja produção tenha sido feita em conformidade com os processos produtivos básicos',
  },
  { code: 5, label: 'Nacional, mercadoria ou bem com Conteúdo de Importação inferior ou igual a 40%' },
  { code: 6, label: 'Estrangeira — Importação direta, sem similar nacional (CAMEX) e gás natural' },
  {
    code: 7,
    label: 'Estrangeira — Adquirida no mercado interno, sem similar nacional (CAMEX) e gás natural',
  },
  { code: 8, label: 'Nacional, mercadoria ou bem com Conteúdo de Importação superior a 70%' },
];

// ----------------------------------------------------------------------
// CSOSN — Simples Nacional / MEI (CRT 1 e 4)

export const FISCAL_CSOSN_OPTIONS: FiscalCodeOption[] = [
  { code: '101', label: 'Tributada pelo Simples Nacional com permissão de crédito', group: 'CSOSN (Simples Nacional / MEI)' },
  { code: '102', label: 'Tributada pelo Simples Nacional sem permissão de crédito', group: 'CSOSN (Simples Nacional / MEI)' },
  { code: '103', label: 'Isenção do ICMS no Simples Nacional para faixa de receita bruta', group: 'CSOSN (Simples Nacional / MEI)' },
  { code: '201', label: 'Tributada pelo Simples Nacional com permissão de crédito e cobrança de ICMS por ST', group: 'CSOSN (Simples Nacional / MEI)' },
  { code: '202', label: 'Tributada pelo Simples Nacional sem permissão de crédito e cobrança de ICMS por ST', group: 'CSOSN (Simples Nacional / MEI)' },
  { code: '203', label: 'Isenção do ICMS no Simples Nacional para faixa de receita bruta e cobrança por ST', group: 'CSOSN (Simples Nacional / MEI)' },
  { code: '300', label: 'Imune', group: 'CSOSN (Simples Nacional / MEI)' },
  { code: '400', label: 'Não tributada pelo Simples Nacional', group: 'CSOSN (Simples Nacional / MEI)' },
  { code: '500', label: 'ICMS cobrado anteriormente por substituição tributária (substituído) ou por antecipação', group: 'CSOSN (Simples Nacional / MEI)' },
  { code: '900', label: 'Outros (Simples Nacional)', group: 'CSOSN (Simples Nacional / MEI)' },
];

// ----------------------------------------------------------------------
// CST ICMS — Regime Normal (Lucro Presumido / Lucro Real — CRT 3)

export const FISCAL_CST_OPTIONS: FiscalCodeOption[] = [
  { code: '00', label: 'Tributada integralmente', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '10', label: 'Tributada e com cobrança do ICMS por substituição tributária', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '20', label: 'Com redução de base de cálculo', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '30', label: 'Isenta ou não tributada e com cobrança do ICMS por substituição tributária', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '40', label: 'Isenta', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '41', label: 'Não tributada', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '50', label: 'Suspensão', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '51', label: 'Diferimento', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '60', label: 'ICMS cobrado anteriormente por substituição tributária', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '70', label: 'Com redução de base de cálculo e cobrança do ICMS por substituição tributária', group: 'CST ICMS (Lucro Presumido / Real)' },
  { code: '90', label: 'Outros (Regime Normal)', group: 'CST ICMS (Lucro Presumido / Real)' },
];

// ----------------------------------------------------------------------
// CFOP — Operações mais comuns em PDV / NFC-e

export const FISCAL_CFOP_SALE_OPTIONS: FiscalCodeOption[] = [
  { code: '5102', label: 'Venda de mercadoria adquirida ou recebida de terceiros', group: 'Operação interna (mesma UF)' },
  { code: '5405', label: 'Venda de mercadoria adquirida/recebida de terceiros sujeita a ST (contribuinte substituído)', group: 'Operação interna (mesma UF)' },
  { code: '5101', label: 'Venda de produção do estabelecimento', group: 'Operação interna (mesma UF)' },
  { code: '5103', label: 'Venda de produção do estabelecimento efetuada fora do estabelecimento', group: 'Operação interna (mesma UF)' },
  { code: '5403', label: 'Venda de mercadoria adquirida/recebida de terceiros sujeita a ST (substituto)', group: 'Operação interna (mesma UF)' },
  { code: '5401', label: 'Venda de produção do estabelecimento sujeita a ST (substituto)', group: 'Operação interna (mesma UF)' },
  { code: '5910', label: 'Remessa em bonificação, doação ou brinde', group: 'Outras saídas' },
  { code: '5949', label: 'Outra saída de mercadoria ou prestação de serviço não especificada', group: 'Outras saídas' },
  { code: '6102', label: 'Venda de mercadoria adquirida ou recebida de terceiros (interestadual)', group: 'Operação interestadual' },
];

// ----------------------------------------------------------------------
// Sugestões locais rápidas de NCM (offline-first / varejo & alimentação)

export const COMMON_NCM_SUGGESTIONS: NcmOption[] = [
  {
    code: '21069090',
    formattedCode: '2106.90.90',
    description: 'Outras preparações alimentícias (ex.: açaí preparado, sobremesas, cremes)',
    source: 'local',
  },
  {
    code: '20089900',
    formattedCode: '2008.99.00',
    description: 'Frutas e outras partes comestíveis de plantas preparadas/conservadas (ex.: polpa de açaí)',
    source: 'local',
  },
  {
    code: '20098990',
    formattedCode: '2009.89.90',
    description: 'Sucos de outras frutas ou produtos hortícolas',
    source: 'local',
  },
  {
    code: '21050010',
    formattedCode: '2105.00.10',
    description: 'Sorvetes, mesmo que contenham cacau, em embalagens de conteúdo <= 2 kg',
    source: 'local',
  },
  {
    code: '22021000',
    formattedCode: '2202.10.00',
    description: 'Águas, incluindo as águas minerais e gaseificadas, adicionadas de açúcar ou aromatizantes',
    source: 'local',
  },
  {
    code: '22011000',
    formattedCode: '2201.10.00',
    description: 'Águas minerais e águas gaseificadas, não adicionadas de açúcar',
    source: 'local',
  },
  {
    code: '19041000',
    formattedCode: '1904.10.00',
    description: 'Produtos à base de cereais obtidos por expansão ou torrefação (ex.: granola)',
    source: 'local',
  },
  {
    code: '08109000',
    formattedCode: '0810.90.00',
    description: 'Outras frutas frescas (ex.: açaí in natura)',
    source: 'local',
  },
  {
    code: '39239090',
    formattedCode: '3923.90.90',
    description: 'Outros artigos de transporte ou de embalagem, de plástico (potes, copos, tampas)',
    source: 'local',
  },
  {
    code: '84713019',
    formattedCode: '8471.30.19',
    description: 'Máquinas automáticas para processamento de dados, portáteis',
    source: 'local',
  },
];

// ----------------------------------------------------------------------

export function normalizeNcmDigits(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 8);
}

export function formatNcmCode(value: string | null | undefined): string {
  const digits = normalizeNcmDigits(value);
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  }
  return digits;
}

export function stripHtmlTags(value: string | null | undefined): string {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—\s]+/, '')
    .trim();
}

export function getCstOrCsosnOptionsByRegime(
  taxRegime?: TaxRegime | null
): FiscalCodeOption[] {
  if (taxRegime === 'presumido' || taxRegime === 'real') {
    return [...FISCAL_CST_OPTIONS, ...FISCAL_CSOSN_OPTIONS];
  }
  return [...FISCAL_CSOSN_OPTIONS, ...FISCAL_CST_OPTIONS];
}

export function findOriginOption(code: number | null | undefined): FiscalOriginOption | null {
  if (typeof code !== 'number' || !Number.isInteger(code)) return null;
  return FISCAL_ORIGIN_OPTIONS.find((item) => item.code === code) || null;
}

export function findCstOrCsosnOption(code: string | null | undefined): FiscalCodeOption | null {
  const clean = String(code || '').trim();
  if (!clean) return null;
  return (
    FISCAL_CSOSN_OPTIONS.find((item) => item.code === clean) ||
    FISCAL_CST_OPTIONS.find((item) => item.code === clean) ||
    null
  );
}

export function findCfopOption(code: string | null | undefined): FiscalCodeOption | null {
  const clean = String(code || '').trim();
  if (!clean) return null;
  return FISCAL_CFOP_SALE_OPTIONS.find((item) => item.code === clean) || null;
}
