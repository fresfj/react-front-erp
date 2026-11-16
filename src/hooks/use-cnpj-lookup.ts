import { useRef, useEffect, useState, useCallback } from 'react';

import { fetchCnpj, mapCnpjToCompany } from 'src/api/brasilapi/cnpj';
import type { CnpjCompanyFields } from 'src/api/brasilapi/cnpj';

import { digitsOnly, isCompleteCnpj } from 'src/utils/br-docs';

// ----------------------------------------------------------------------

type Options = {
  document: string;
  enabled?: boolean;
  onSuccess: (fields: CnpjCompanyFields) => void;
  onError?: (code: string) => void;
};

export function useCnpjLookup({ document, enabled = true, onSuccess, onError }: Options) {
  const [loading, setLoading] = useState(false);
  const lastFetched = useRef<string>('');
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const lookup = useCallback(async (value: string) => {
    const digits = digitsOnly(value);
    if (!isCompleteCnpj(digits) || digits === lastFetched.current) return;

    lastFetched.current = digits;
    setLoading(true);
    try {
      const data = await fetchCnpj(digits);
      onSuccessRef.current(mapCnpjToCompany(data));
    } catch (error) {
      lastFetched.current = '';
      const message = error instanceof Error ? error.message : 'CNPJ_LOOKUP_FAILED';
      onErrorRef.current?.(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!isCompleteCnpj(document)) return;
    void lookup(document);
  }, [document, enabled, lookup]);

  return { loading, lookup };
}
