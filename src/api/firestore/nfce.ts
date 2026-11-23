import { httpsCallable } from 'firebase/functions';

import { FUNCTIONS } from 'src/lib/firebase';

// ----------------------------------------------------------------------

async function call<TReq extends object, TRes>(name: string, data: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq, TRes>(FUNCTIONS, name);
  const result = await fn(data);
  return result.data;
}

export type IssueSaleNfceResult = {
  nfceNumber: string;
  nfceKey: string;
  nfceProtocol: string;
  nfceIssuedAt: string;
  nfceDanfeUrl?: string;
  nfceQrCodeUrl?: string;
};

export function saveEnterpriseFiscalSecrets(input: {
  enterpriseId: string;
  apiToken?: string;
  cscId?: string;
  cscToken?: string;
  provider?: 'focus';
}) {
  return call<typeof input, { ok: boolean; hasFiscalSecrets: boolean }>(
    'saveEnterpriseFiscalSecrets',
    input
  );
}

export function enqueueSaleNfceCf(input: { enterpriseId: string; saleId: string }) {
  return call<typeof input, { saleId: string; nfceStatus: string; skipped?: boolean }>(
    'enqueueSaleNfce',
    input
  );
}

export function issueSaleNfceCf(input: { enterpriseId: string; saleId: string }) {
  return call<typeof input, IssueSaleNfceResult>('issueSaleNfce', input);
}

export function cancelSaleNfceCf(input: {
  enterpriseId: string;
  saleId: string;
  justification?: string;
}) {
  return call<typeof input, { saleId: string; nfceStatus: string }>('cancelSaleNfce', input);
}

export function retryPendingNfceCf(input: { enterpriseId: string; saleId?: string }) {
  return call<typeof input, IssueSaleNfceResult | { results: unknown[] }>(
    'retryPendingNfce',
    input
  );
}
