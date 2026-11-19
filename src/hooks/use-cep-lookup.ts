import type { CepAddressFields } from 'src/api/brasilapi/cep';

import { useRef, useState, useEffect, useCallback } from 'react';

import { digitsOnly, isCompleteCep } from 'src/utils/br-docs';

import { fetchCep, mapCepToAddress } from 'src/api/brasilapi/cep';

// ----------------------------------------------------------------------

type Options = {
  cep?: string;
  initialValue?: string;
  enabled?: boolean;
  onSuccess: (fields: CepAddressFields) => void;
  onError?: (code: string) => void;
};

export function useCepLookup({
  cep = '',
  initialValue = '',
  enabled = true,
  onSuccess,
  onError,
}: Options) {
  const [loading, setLoading] = useState(false);
  const initialDigits = digitsOnly(initialValue);
  const lastFetched = useRef<string>(initialDigits);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  // Atualiza a referência de inicial se ela mudar externamente (ex.: carregamento assíncrono do registro)
  useEffect(() => {
    if (initialValue) {
      lastFetched.current = digitsOnly(initialValue);
    }
  }, [initialValue]);

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

  const handleBlur = useCallback(
    (event?: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!enabled) return;
      const targetVal = event?.target?.value ?? cep;
      const digits = digitsOnly(targetVal);

      // Não busca se incompleto
      if (!isCompleteCep(digits)) return;

      // Não busca se for idêntico ao já cadastrado inicialmente
      const currentInitial = digitsOnly(initialValue);
      if (currentInitial && digits === currentInitial) return;

      // Não busca se já consultou este mesmo valor recentemente
      if (digits === lastFetched.current) return;

      lookup(digits).catch(() => undefined);
    },
    [cep, enabled, initialValue, lookup]
  );

  return { loading, lookup, handleBlur, onBlur: handleBlur };
}
