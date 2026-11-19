import type { CnpjCompanyFields } from 'src/api/brasilapi/cnpj';

import { useRef, useState, useEffect, useCallback } from 'react';

import { digitsOnly, isCompleteCnpj } from 'src/utils/br-docs';

import { fetchCnpj, mapCnpjToCompany } from 'src/api/brasilapi/cnpj';

// ----------------------------------------------------------------------

type Options = {
  document?: string;
  initialValue?: string;
  enabled?: boolean;
  onSuccess: (fields: CnpjCompanyFields) => void;
  onError?: (code: string) => void;
};

export function useCnpjLookup({
  document = '',
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

  // Atualiza a referência inicial se for carregada depois (ex.: getEnterprise / getCustomer)
  useEffect(() => {
    if (initialValue) {
      lastFetched.current = digitsOnly(initialValue);
    }
  }, [initialValue]);

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

  const handleBlur = useCallback(
    (event?: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!enabled) return;
      const targetVal = event?.target?.value ?? document;
      const digits = digitsOnly(targetVal);

      // Não busca se incompleto
      if (!isCompleteCnpj(digits)) return;

      // Não busca se for idêntico ao já cadastrado inicialmente
      const currentInitial = digitsOnly(initialValue);
      if (currentInitial && digits === currentInitial) return;

      // Não busca se já consultou este mesmo valor recentemente
      if (digits === lastFetched.current) return;

      lookup(digits).catch(() => undefined);
    },
    [document, enabled, initialValue, lookup]
  );

  return { loading, lookup, handleBlur, onBlur: handleBlur };
}
