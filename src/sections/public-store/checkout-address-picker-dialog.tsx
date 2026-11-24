import { useState, useEffect } from 'react';

import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import useMediaQuery from '@mui/material/useMediaQuery';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { useCepLookup } from 'src/hooks/use-cep-lookup';

import { formatCep } from 'src/utils/br-docs';

import { Iconify } from 'src/components/iconify';

import { formatSavedAddressLine } from './public-customer-profile';

import type { SavedCustomerAddress } from './public-customer-profile';

// ----------------------------------------------------------------------

export type CheckoutAddressDraft = Omit<SavedCustomerAddress, 'id'> & { id?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  addresses: SavedCustomerAddress[];
  selectedId?: string;
  onSelect: (addr: SavedCustomerAddress) => void;
  onCreate: (addr: CheckoutAddressDraft) => void | Promise<void>;
};

const EMPTY_DRAFT: CheckoutAddressDraft = {
  label: 'Casa',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  isDefault: false,
};

export function CheckoutAddressPickerDialog({
  open,
  onClose,
  addresses,
  selectedId,
  onSelect,
  onCreate,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [draft, setDraft] = useState<CheckoutAddressDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const { loading: cepLoading, handleBlur: handleCepBlur } = useCepLookup({
    cep: draft.cep,
    onSuccess: (fields) => {
      setDraft((prev) => ({
        ...prev,
        street: fields.address || prev.street,
        neighborhood: fields.neighborhood || prev.neighborhood,
        city: fields.city || prev.city,
        state: fields.state || prev.state,
      }));
    },
  });

  useEffect(() => {
    if (!open) {
      setMode('list');
      setDraft(EMPTY_DRAFT);
      setSaving(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!draft.street.trim() || !draft.number.trim() || !draft.neighborhood.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        ...draft,
        cep: formatCep(draft.cep),
        label: draft.label.trim() || 'Casa',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isMobile} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
      >
        <span>{mode === 'list' ? 'Alterar endereço' : 'Novo endereço'}</span>
        <IconButton onClick={onClose} aria-label="Fechar">
          <Iconify icon="mingcute:close-line" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {mode === 'list' ? (
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {addresses.map((addr) => {
              const selected = selectedId === addr.id;
              return (
                <Button
                  key={addr.id}
                  fullWidth
                  variant={selected ? 'contained' : 'outlined'}
                  color={selected ? 'primary' : 'inherit'}
                  onClick={() => {
                    onSelect(addr);
                    onClose();
                  }}
                  sx={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    py: 1.5,
                    px: 2,
                    textTransform: 'none',
                  }}
                  startIcon={
                    <Iconify
                      icon={addr.isDefault ? 'solar:star-bold' : 'solar:map-point-bold'}
                      width={20}
                    />
                  }
                >
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {addr.label}
                      {addr.isDefault ? ' · Padrão' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal' }}>
                      {formatSavedAddressLine(addr)}
                    </Typography>
                  </Stack>
                </Button>
              );
            })}

            {!addresses.length && (
              <Typography variant="body2" color="text.secondary">
                Nenhum endereço salvo ainda.
              </Typography>
            )}

            <Divider sx={{ borderStyle: 'dashed', my: 0.5 }} />

            <Button
              variant="soft"
              color="primary"
              startIcon={<Iconify icon="mingcute:add-line" width={18} />}
              onClick={() => setMode('create')}
            >
              Novo endereço
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Apelido"
              value={draft.label}
              onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="Casa, Trabalho…"
            />
            <TextField
              fullWidth
              type="tel"
              inputMode="numeric"
              label="CEP"
              value={draft.cep}
              onChange={(e) => setDraft((prev) => ({ ...prev, cep: formatCep(e.target.value) }))}
              onBlur={() => handleCepBlur()}
              InputProps={{
                endAdornment: cepLoading ? (
                  <InputAdornment position="end">
                    <CircularProgress size={20} />
                  </InputAdornment>
                ) : null,
              }}
            />
            <TextField
              fullWidth
              label="Rua / Logradouro"
              value={draft.street}
              onChange={(e) => setDraft((prev) => ({ ...prev, street: e.target.value }))}
              required
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Número"
                value={draft.number}
                onChange={(e) => setDraft((prev) => ({ ...prev, number: e.target.value }))}
                required
              />
              <TextField
                fullWidth
                label="Complemento"
                value={draft.complement || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, complement: e.target.value }))}
              />
            </Stack>
            <TextField
              fullWidth
              label="Bairro"
              value={draft.neighborhood}
              onChange={(e) => setDraft((prev) => ({ ...prev, neighborhood: e.target.value }))}
              required
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Cidade"
                value={draft.city}
                onChange={(e) => setDraft((prev) => ({ ...prev, city: e.target.value }))}
              />
              <TextField
                fullWidth
                label="UF"
                value={draft.state}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, state: e.target.value.toUpperCase().slice(0, 2) }))
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
            </Stack>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {mode === 'create' ? (
          <>
            <Button color="inherit" onClick={() => setMode('list')} disabled={saving}>
              Voltar
            </Button>
            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={saving || !draft.street.trim() || !draft.number.trim()}
            >
              {saving ? 'Salvando…' : 'Salvar endereço'}
            </Button>
          </>
        ) : (
          <Button color="inherit" onClick={onClose}>
            Fechar
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
