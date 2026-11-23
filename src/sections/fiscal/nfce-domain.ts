// ----------------------------------------------------------------------

export type TaxRegime = 'simples' | 'presumido' | 'real' | 'mei';

export type NfceEnvironment = 'homologation' | 'production';

export type NfceStatus = 'none' | 'pending' | 'authorized' | 'cancelled' | 'error';

export type NfceErrorCode =
  | 'missing_fiscal_config'
  | 'missing_fiscal_product_data'
  | 'provider_reject'
  | 'network'
  | 'sefaz_unavailable';

export type FiscalProductSnapshot = {
  ncm?: string | null;
  origin?: number | null;
  cstOrCsosn?: string | null;
};

export type FiscalEnterpriseSnapshot = {
  nfceEnabled: boolean;
  taxRegime?: TaxRegime | null;
  nfceSeries?: string | null;
  nfceEnvironment?: NfceEnvironment | null;
  hasIssuerCredentials: boolean;
};

export type NfceStatusEvent = 'enqueue' | 'authorize' | 'fail' | 'cancel' | 'retry';

// ----------------------------------------------------------------------

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

function isValidOrigin(origin: number | null | undefined): boolean {
  return typeof origin === 'number' && Number.isInteger(origin) && origin >= 0 && origin <= 8;
}

function productReady(product: FiscalProductSnapshot): boolean {
  return hasText(product.ncm) && isValidOrigin(product.origin) && hasText(product.cstOrCsosn);
}

export function canEmitNfce(
  enterprise: FiscalEnterpriseSnapshot,
  products: FiscalProductSnapshot[]
): { ok: true } | { ok: false; code: NfceErrorCode; message: string } {
  if (!enterprise.nfceEnabled) {
    return {
      ok: false,
      code: 'missing_fiscal_config',
      message: 'NFC-e is disabled for this enterprise',
    };
  }

  if (!enterprise.hasIssuerCredentials) {
    return {
      ok: false,
      code: 'missing_fiscal_config',
      message: 'Fiscal issuer credentials are missing',
    };
  }

  if (!enterprise.taxRegime || !hasText(enterprise.nfceSeries) || !enterprise.nfceEnvironment) {
    return {
      ok: false,
      code: 'missing_fiscal_config',
      message: 'Fiscal enterprise settings are incomplete',
    };
  }

  if (!products.length || products.some((p) => !productReady(p))) {
    return {
      ok: false,
      code: 'missing_fiscal_product_data',
      message: 'One or more products lack NCM, origin, or CST/CSOSN',
    };
  }

  return { ok: true };
}

export function nextNfceStatus(current: NfceStatus, event: NfceStatusEvent): NfceStatus {
  if (event === 'enqueue') {
    if (current === 'none' || current === 'error' || current === 'pending') return 'pending';
    return current;
  }

  if (event === 'authorize') {
    if (current === 'pending') return 'authorized';
    return current;
  }

  if (event === 'fail') {
    if (current === 'pending') return 'error';
    return current;
  }

  if (event === 'retry') {
    if (current === 'error' || current === 'pending') return 'pending';
    return current;
  }

  if (event === 'cancel') {
    if (current === 'authorized') return 'cancelled';
    return current;
  }

  return current;
}
