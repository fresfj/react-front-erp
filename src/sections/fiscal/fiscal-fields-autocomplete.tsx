
import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';

import { searchNcmOptions } from 'src/api/ncm';

import {
  formatNcmCode,
  findCfopOption,
  findOriginOption,
  normalizeNcmDigits,
  findCstOrCsosnOption,
  FISCAL_ORIGIN_OPTIONS,
  COMMON_NCM_SUGGESTIONS,
  FISCAL_CFOP_SALE_OPTIONS,
  getCstOrCsosnOptionsByRegime,
} from './fiscal-tables';

import type { TaxRegime } from './nfce-domain';
import type { NcmOption, FiscalOriginCode } from './fiscal-tables';

// ----------------------------------------------------------------------

const SOURCE_LABEL: Record<NonNullable<NcmOption['source']>, string> = {
  siscomex: 'Siscomex',
  brasilapi: 'BrasilAPI',
  local: 'Sugestão',
};

type NcmAutocompleteProps = {
  value: string;
  onChange: (ncmDigits: string) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
};

export function NcmAutocompleteField({
  value,
  onChange,
  label = 'NCM (8 dígitos)',
  error,
  helperText,
  disabled,
}: NcmAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value ? formatNcmCode(value) : '');
  const [options, setOptions] = useState<NcmOption[]>(COMMON_NCM_SUGGESTIONS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clean = normalizeNcmDigits(value);
    setInputValue((prev) => {
      if (normalizeNcmDigits(prev) === clean && prev.trim() !== '') {
        return prev;
      }
      return clean ? formatNcmCode(clean) : '';
    });
  }, [value]);

  useEffect(() => {
    const query = inputValue.trim();
    if (query.length < 2) {
      setOptions(COMMON_NCM_SUGGESTIONS);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchNcmOptions(query, { limit: 25, signal: controller.signal });
        if (!controller.signal.aborted) {
          setOptions(res);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [inputValue]);

  const selectedOption = useMemo<NcmOption | string | null>(() => {
    const clean = normalizeNcmDigits(value);
    if (!clean) return null;
    return options.find((opt) => opt.code === clean) || formatNcmCode(clean);
  }, [options, value]);

  return (
    <Autocomplete<NcmOption, false, false, true>
      freeSolo
      disabled={disabled}
      loading={loading}
      options={options}
      value={selectedOption}
      inputValue={inputValue}
      filterOptions={(x) => x}
      isOptionEqualToValue={(opt, val) =>
        typeof val === 'string'
          ? opt.code === normalizeNcmDigits(val)
          : opt.code === val.code
      }
      getOptionLabel={(opt) => {
        if (typeof opt === 'string') return opt;
        return opt.description ? `${opt.formattedCode} — ${opt.description}` : opt.formattedCode;
      }}
      onInputChange={(_, newInput, reason) => {
        setInputValue(newInput);
        if (reason === 'input') {
          const digits = normalizeNcmDigits(newInput);
          if (digits.length === 8 || newInput.trim() === '') {
            onChange(digits);
          }
        }
        if (reason === 'clear') {
          onChange('');
        }
      }}
      onChange={(_, newValue) => {
        if (!newValue) {
          onChange('');
          setInputValue('');
          return;
        }
        if (typeof newValue === 'string') {
          const digits = normalizeNcmDigits(newValue);
          onChange(digits);
          setInputValue(digits ? formatNcmCode(digits) : newValue);
          return;
        }
        onChange(newValue.code);
        setInputValue(`${newValue.formattedCode} — ${newValue.description}`);
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.code}>
          <Stack spacing={0.25} sx={{ width: '100%' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
                {option.formattedCode}
              </Typography>
              {option.source && (
                <Chip
                  size="small"
                  label={SOURCE_LABEL[option.source]}
                  variant="soft"
                  color={option.source === 'siscomex' ? 'success' : 'info'}
                  sx={{ height: 18, fontSize: 10 }}
                />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" noWrap>
              {option.description}
            </Typography>
          </Stack>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Digite código (21069090) ou descrição (ex.: polpa, sorvete)"
          error={error}
          helperText={
            helperText ||
            (value && normalizeNcmDigits(value).length !== 8
              ? 'NCM deve conter exatamente 8 dígitos'
              : 'Consulta oficial Siscomex / BrasilAPI')
          }
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={18} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}

// ----------------------------------------------------------------------

type OriginAutocompleteProps = {
  value: number | undefined;
  onChange: (origin: FiscalOriginCode) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
};

export function OriginAutocompleteField({
  value,
  onChange,
  label = 'Origem da mercadoria',
  error,
  helperText,
  disabled,
}: OriginAutocompleteProps) {
  const selected = useMemo(() => findOriginOption(value ?? 0), [value]);

  return (
    <Autocomplete
      disabled={disabled}
      disableClearable
      options={FISCAL_ORIGIN_OPTIONS}
      value={selected || FISCAL_ORIGIN_OPTIONS[0]}
      isOptionEqualToValue={(opt, val) => opt.code === val.code}
      getOptionLabel={(opt) => `${opt.code} — ${opt.label}`}
      onChange={(_, newValue) => {
        if (newValue) {
          onChange(newValue.code);
        }
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.code}>
          <Typography variant="body2">
            <strong>{option.code}</strong> — {option.label}
          </Typography>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={error}
          helperText={helperText || 'Tabela A (Ajuste SINIEF / NF-e)'}
        />
      )}
    />
  );
}

// ----------------------------------------------------------------------

type CstCsosnAutocompleteProps = {
  value: string;
  onChange: (code: string) => void;
  taxRegime?: TaxRegime | null;
  label?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
};

export function CstCsosnAutocompleteField({
  value,
  onChange,
  taxRegime,
  label = 'CST / CSOSN',
  error,
  helperText,
  disabled,
}: CstCsosnAutocompleteProps) {
  const options = useMemo(() => getCstOrCsosnOptionsByRegime(taxRegime), [taxRegime]);
  const selected = useMemo(() => {
    const clean = String(value || '').trim();
    if (!clean) return null;
    return findCstOrCsosnOption(clean) || clean;
  }, [value]);

  const regimeHint =
    taxRegime === 'presumido' || taxRegime === 'real'
      ? 'Regime Normal: priorizando CST ICMS (ex.: 00, 60)'
      : 'Simples Nacional / MEI: priorizando CSOSN (ex.: 102, 500)';

  return (
    <Autocomplete
      freeSolo
      disabled={disabled}
      options={options}
      groupBy={(opt) => opt.group || ''}
      value={selected}
      isOptionEqualToValue={(opt, val) =>
        typeof val === 'string' ? opt.code === val : opt.code === val.code
      }
      getOptionLabel={(opt) => (typeof opt === 'string' ? opt : `${opt.code} — ${opt.label}`)}
      onInputChange={(_, newInput, reason) => {
        if (reason === 'input') {
          const digits = newInput.replace(/\D/g, '').slice(0, 3);
          if (digits.length === 2 || digits.length === 3 || newInput.trim() === '') {
            onChange(digits);
          }
        }
        if (reason === 'clear') {
          onChange('');
        }
      }}
      onChange={(_, newValue) => {
        if (!newValue) {
          onChange('');
          return;
        }
        if (typeof newValue === 'string') {
          onChange(newValue.replace(/\D/g, '').slice(0, 3));
          return;
        }
        onChange(newValue.code);
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={`${option.group}-${option.code}`}>
          <Typography variant="body2">
            <strong>{option.code}</strong> — {option.label}
          </Typography>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Ex.: 102, 500 (CSOSN) ou 00, 60 (CST)"
          error={error}
          helperText={helperText || regimeHint}
        />
      )}
    />
  );
}

// ----------------------------------------------------------------------

type CfopAutocompleteProps = {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
};

export function CfopAutocompleteField({
  value,
  onChange,
  label = 'CFOP venda padrão',
  error,
  helperText,
  disabled,
}: CfopAutocompleteProps) {
  const selected = useMemo(() => {
    const clean = String(value || '').trim();
    if (!clean) return null;
    return findCfopOption(clean) || clean;
  }, [value]);

  return (
    <Autocomplete
      freeSolo
      disabled={disabled}
      options={FISCAL_CFOP_SALE_OPTIONS}
      groupBy={(opt) => opt.group || ''}
      value={selected}
      isOptionEqualToValue={(opt, val) =>
        typeof val === 'string' ? opt.code === val : opt.code === val.code
      }
      getOptionLabel={(opt) => (typeof opt === 'string' ? opt : `${opt.code} — ${opt.label}`)}
      onInputChange={(_, newInput, reason) => {
        if (reason === 'input') {
          const digits = newInput.replace(/\D/g, '').slice(0, 4);
          if (digits.length === 4 || newInput.trim() === '') {
            onChange(digits);
          }
        }
        if (reason === 'clear') {
          onChange('');
        }
      }}
      onChange={(_, newValue) => {
        if (!newValue) {
          onChange('');
          return;
        }
        if (typeof newValue === 'string') {
          onChange(newValue.replace(/\D/g, '').slice(0, 4));
          return;
        }
        onChange(newValue.code);
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.code}>
          <Typography variant="body2">
            <strong>{option.code}</strong> — {option.label}
          </Typography>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Ex.: 5102 ou 5405"
          error={error}
          helperText={helperText || 'Padrão varejo interno: 5102 (tributado) ou 5405 (ST)'}
        />
      )}
    />
  );
}
