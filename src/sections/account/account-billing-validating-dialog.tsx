import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import DialogContent from '@mui/material/DialogContent';
import CircularProgress from '@mui/material/CircularProgress';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  title?: string;
  subtitle?: string;
};

export function AccountBillingValidatingDialog({
  open,
  title = 'Validando pagamento…',
  subtitle = 'Aguarde a confirmação do Asaas. Não feche esta janela.',
}: Props) {
  return (
    <Dialog open={open} disableEscapeKeyDown maxWidth="xs" fullWidth>
      <DialogContent>
        <Stack spacing={2.5} alignItems="center" sx={{ py: 3, textAlign: 'center' }}>
          <CircularProgress />
          <Typography variant="h6">{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
