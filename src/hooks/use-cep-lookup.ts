import { useRef, useEffect, useState, useCallback } from 'react';

import { fetchCep, mapCepToAddress } from 'src/api/brasilapi/cep';
import type { CepAddressFields } from 'src/api/brasilapi/cep';

import { digitsOnly, isCompleteCep } from 'src/utils/br-docs';

// ----------------------------------------------------------------------

type Options = {
  cep: string;
  enabled?: boolean;
  onSuccess: (fields: CepAddressFields) => void;
  onError?: (code: string) => void;
};

export function useCepLookup({ cep, enabled = true, onSuccess, onError }: Options) {
  const [loading, setLoading] = useState(false);
  const lastFetched = useRef<string>('');
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const lookup = useCallback(async (value: string) => {
    const digits = digitsOnly(value);
    if (!isCompleteCep(digits) || digits === lastFetched.current) return;

    lastFetched.current = digits;
    setLoading(true);
    try {
      const data = await fetchCep(digits);
      onSuccessRef.current(mapCepToAddress(data));
    } catch (error) {
      lastFetched.current = '';
      const message = error instanceof Error ? error.message : 'CEP_LOOKUP_FAILED';
      onErrorRef.current?.(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!isCompleteCep(cep)) return;
    void lookup(cep);
  }, [cep, enabled, lookup]);

  return { loading, lookup };
}
