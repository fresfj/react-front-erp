import type { DiningTable } from 'src/api/firestore/tables';

import { useState, useEffect } from 'react';

import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  currentTable?: DiningTable | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (data: { number: string; label?: string; area?: string; capacity?: number }) => void;
};

export function TableFormDialog({ open, currentTable, busy, onClose, onSubmit }: Props) {
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [area, setArea] = useState('');
  const [capacity, setCapacity] = useState('4');

  useEffect(() => {
    if (open) {
      setNumber(currentTable?.number || '');
      setLabel(currentTable?.label || '');
      setArea(currentTable?.area || '');
      setCapacity(String(currentTable?.capacity ?? 4));
    }
  }, [open, currentTable]);

  const handleSave = () => {
    if (!number.trim()) return;
    onSubmit({
      number: number.trim(),
      label: label.trim() || undefined,
      area: area.trim() || undefined,
      capacity: Math.max(1, Number(capacity || 4)),
    });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{currentTable ? `Editar Mesa ${currentTable.number}` : 'Nova Mesa'}</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            fullWidth
            required
            label="Número / Identificação da Mesa"
            placeholder="Ex.: 01, 02, VIP-1"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            disabled={busy}
          />

          <TextField
            fullWidth
            label="Descrição / Apelido (opcional)"
            placeholder="Ex.: Mesa da Janela"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
          />

          <Stack direction="row" spacing={2}>
            <TextField
              fullWidth
              label="Ambiente / Área"
              placeholder="Ex.: Salão, Varanda"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              disabled={busy}
            />
            <TextField
              type="number"
              label="Lugares"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              inputProps={{ min: 1 }}
              sx={{ width: 120 }}
              disabled={busy}
            />
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <LoadingButton
          variant="contained"
          loading={busy}
          disabled={!number.trim()}
          onClick={handleSave}
        >
          {currentTable ? 'Salvar' : 'Criar mesa'}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}
