import { useState } from 'react';

import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import { usePwaInstall } from 'src/hooks/use-pwa-install';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  variant?: 'icon' | 'button';
  label?: string;
};

export function PwaInstallButton({ variant = 'button', label = 'Instalar App' }: Props) {
  const { canPrompt, isIosSafari, canShowInstall, promptInstall } = usePwaInstall();
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  if (!canShowInstall) return null;

  const handleClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        toast.success('Aplicativo instalado com sucesso!');
      }
      return;
    }
    if (isIosSafari) {
      setIosHelpOpen(true);
    }
  };

  return (
    <>
      {variant === 'icon' ? (
        <Tooltip title={label}>
          <IconButton color="primary" onClick={handleClick} aria-label={label}>
            <Iconify icon="solar:download-square-bold-duotone" width={22} />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          size="small"
          variant="soft"
          color="primary"
          onClick={handleClick}
          startIcon={<Iconify icon="solar:download-square-bold-duotone" width={18} />}
          sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          {label}
        </Button>
      )}

      <Dialog open={iosHelpOpen} onClose={() => setIosHelpOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Instalar na Tela de Início</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              No iPhone/iPad (Safari), você pode instalar este aplicativo em 2 passos:
            </Typography>
            <Typography variant="body2">
              1. Toque no ícone de <strong>Compartilhar</strong> na barra inferior do Safari.
            </Typography>
            <Typography variant="body2">
              2. Role para baixo e selecione <strong>Adicionar à Tela de Início</strong>.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setIosHelpOpen(false)}>
            Entendi
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
