import type { TaxRegime } from 'src/sections/fiscal/nfce-domain';
import type { FiscalOriginCode } from 'src/sections/fiscal/fiscal-tables';

import { useState, useEffect } from 'react';

import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { updateProduct } from 'src/api/firestore/products';
import { getEnterprise } from 'src/api/firestore/platform';

import { toast } from 'src/components/snackbar';

import { normalizeNcmDigits } from 'src/sections/fiscal/fiscal-tables';
import {
  NcmAutocompleteField,
  CfopAutocompleteField,
  OriginAutocompleteField,
  CstCsosnAutocompleteField,
} from 'src/sections/fiscal/fiscal-fields-autocomplete';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  enterpriseId: string;
  selectedProductIds: string[];
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
};

export function ProductBulkFiscalDialog({
  open,
  enterpriseId,
  selectedProductIds,
  onClose,
  onUpdated,
}: Props) {
  const [ncm, setNcm] = useState('21069090');
  const [origin, setOrigin] = useState<FiscalOriginCode>(0);
  const [cstOrCsosn, setCstOrCsosn] = useState('102');
  const [cfopSaleDefault, setCfopSaleDefault] = useState('5102');
  const [taxRegime, setTaxRegime] = useState<TaxRegime | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !enterpriseId) return undefined;
    let alive = true;
    getEnterprise(enterpriseId)
      .then((ent) => {
        if (!alive || !ent) return;
        setTaxRegime(ent.taxRegime || null);
        if (ent.taxRegime === 'presumido' || ent.taxRegime === 'real') {
          setCstOrCsosn((prev) => (prev === '102' ? '00' : prev));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, enterpriseId]);

  const cleanNcm = normalizeNcmDigits(ncm);
  const isValid = cleanNcm.length === 8 && Boolean(cstOrCsosn.trim());

  const handleApply = async () => {
    if (!enterpriseId || !selectedProductIds.length) return;
    if (!isValid) {
      toast.error('Informe um NCM válido de 8 dígitos e o CST/CSOSN.');
      return;
    }

    setSaving(true);
    try {
      await Promise.all(
        selectedProductIds.map((id) =>
          updateProduct(enterpriseId, id, {
            ncm: cleanNcm,
            origin,
            cstOrCsosn: cstOrCsosn.trim(),
            cfopSaleDefault: cfopSaleDefault.trim() || '5102',
          })
        )
      );
      toast.success(
        `Dados fiscais (NCM ${cleanNcm}, Origem ${origin}, CST/CSOSN ${cstOrCsosn.trim()}) aplicados em ${selectedProductIds.length} produto(s)!`
      );
      await onUpdated();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao atualizar dados fiscais em massa'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Atualizar dados fiscais (NFC-e) em massa</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Alert severity="info">
            Os campos abaixo serão aplicados em <strong>{selectedProductIds.length}</strong>{' '}
            produto(s) selecionado(s) para liberar a emissão de NFC-e.
          </Alert>

          <NcmAutocompleteField
            value={ncm}
            onChange={setNcm}
            disabled={saving}
            error={Boolean(ncm) && cleanNcm.length !== 8}
          />

          <OriginAutocompleteField value={origin} onChange={setOrigin} disabled={saving} />

          <CstCsosnAutocompleteField
            value={cstOrCsosn}
            onChange={setCstOrCsosn}
            taxRegime={taxRegime}
            disabled={saving}
          />

          <CfopAutocompleteField
            value={cfopSaleDefault}
            onChange={setCfopSaleDefault}
            disabled={saving}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <LoadingButton
          variant="contained"
          loading={saving}
          disabled={!isValid || selectedProductIds.length === 0}
          onClick={handleApply}
        >
          Aplicar em {selectedProductIds.length} produto(s)
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}
