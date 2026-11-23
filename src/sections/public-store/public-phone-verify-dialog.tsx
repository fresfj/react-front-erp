import type { ConfirmationResult } from 'firebase/auth';

import { MuiOtpInput } from 'mui-one-time-password-input';
import { useRef, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogContent from '@mui/material/DialogContent';

import { digitsOnly, formatPhoneBr } from 'src/utils/br-docs';

import { varAlpha } from 'src/theme/styles';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import {
  sendPublicPhoneOtp,
  confirmPublicPhoneOtp,
  clearRecaptchaVerifier,
  getPhoneAuthErrorMessage,
} from './public-customer-phone-auth';

import type { VerifiedPublicCustomer } from './public-customer-phone-auth';

// ----------------------------------------------------------------------

const RECAPTCHA_CONTAINER_ID = 'public-phone-recaptcha-container';
const RESEND_COOLDOWN_SEC = 45;

type Props = {
  open: boolean;
  slug: string;
  phone: string;
  customerName?: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onVerified: (customer: VerifiedPublicCustomer) => void;
};

export function PublicPhoneVerifyDialog({
  open,
  slug,
  phone,
  customerName,
  title = 'Confirme seu celular',
  subtitle,
  onClose,
  onVerified,
}: Props) {
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const submittingRef = useRef(false);

  const formattedPhone = formatPhoneBr(phone);

  const triggerSendSms = useCallback(async () => {
    if (!phone) return;
    setSending(true);
    setErrorMsg(null);
    setCode('');
    confirmationRef.current = null;
    try {
      const confirmation = await sendPublicPhoneOtp(phone, RECAPTCHA_CONTAINER_ID);
      confirmationRef.current = confirmation;
      setCooldown(RESEND_COOLDOWN_SEC);
      toast.success(`Código SMS enviado para ${formattedPhone}`);
    } catch (error) {
      console.error('Firebase Phone Auth send error:', error);
      setErrorMsg(getPhoneAuthErrorMessage(error));
    } finally {
      setSending(false);
    }
  }, [formattedPhone, phone]);

  useEffect(() => {
    if (open && phone) {
      const timer = window.setTimeout(() => {
        triggerSendSms();
      }, 150);
      return () => {
        window.clearTimeout(timer);
        clearRecaptchaVerifier();
      };
    }
    return undefined;
  }, [open, phone, triggerSendSms]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleVerify = useCallback(
    async (otpCode: string) => {
      const clean = digitsOnly(otpCode);
      if (clean.length !== 6 || submittingRef.current) return;
      if (!confirmationRef.current) {
        setErrorMsg('Aguarde o envio do SMS ou clique em "Reenviar código".');
        return;
      }

      submittingRef.current = true;
      setVerifying(true);
      setErrorMsg(null);
      try {
        const firstName = customerName?.trim().split(/\s+/)[0];
        const verified = await confirmPublicPhoneOtp(confirmationRef.current, clean, {
          slug,
          phone,
          firstName,
          fullName: customerName?.trim(),
        });
        toast.success('Celular verificado com sucesso!');
        onVerified(verified);
      } catch (error) {
        console.error('Firebase Phone Auth confirm error:', error);
        setErrorMsg(getPhoneAuthErrorMessage(error));
        setCode('');
      } finally {
        setVerifying(false);
        submittingRef.current = false;
      }
    },
    [customerName, onVerified, phone, slug]
  );

  const handleCodeChange = (newValue: string) => {
    const onlyDigits = digitsOnly(newValue).slice(0, 6);
    setCode(onlyDigits);
    if (errorMsg) setErrorMsg(null);
  };

  return (
    <Dialog open={open} onClose={verifying ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogContent sx={{ py: 4, px: { xs: 2.5, sm: 4 } }}>
        <Stack spacing={3} alignItems="center" sx={{ textAlign: 'center' }}>
          {/* Ícone estilo /auth-demo/split/verify */}
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
              bgcolor: (theme) => varAlpha(theme.vars.palette.primary.mainChannel, 0.12),
            }}
          >
            <Iconify icon="solar:smartphone-2-bold-duotone" width={38} />
          </Box>

          <Stack spacing={1}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {subtitle ||
                `Enviamos um código SMS de 6 dígitos para ${formattedPhone}. Digite os números abaixo para validar seu acesso.`}
            </Typography>
          </Stack>

          {errorMsg && (
            <Alert severity="error" sx={{ width: '100%', textAlign: 'left' }}>
              {errorMsg}
            </Alert>
          )}

          {/* OTP 6 dígitos somente números — auto-submit ao completar */}
          <Box sx={{ width: '100%' }}>
            <MuiOtpInput
              value={code}
              onChange={handleCodeChange}
              onComplete={(completedCode) => handleVerify(completedCode)}
              length={6}
              autoFocus
              gap={1.25}
              validateChar={(char) => /^\d$/.test(char)}
              TextFieldsProps={{
                placeholder: '•',
                disabled: sending || verifying,
                inputProps: {
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  autoComplete: 'one-time-code',
                },
              }}
            />
          </Box>

          <LoadingButton
            fullWidth
            size="large"
            variant="contained"
            loading={verifying || sending}
            loadingIndicator={sending ? 'Enviando SMS...' : 'Validando...'}
            disabled={code.length !== 6}
            onClick={() => handleVerify(code)}
          >
            Validar código
          </LoadingButton>

          <Typography variant="body2" color="text.secondary">
            Não recebeu o código?{' '}
            {cooldown > 0 ? (
              <Box component="span" sx={{ fontWeight: 700, color: 'text.disabled' }}>
                Reenviar em {cooldown}s
              </Box>
            ) : (
              <Link
                component="button"
                type="button"
                variant="subtitle2"
                onClick={triggerSendSms}
                disabled={sending || verifying}
                sx={{ cursor: 'pointer', verticalAlign: 'baseline' }}
              >
                Reenviar código
              </Link>
            )}
          </Typography>

          <Button
            color="inherit"
            size="small"
            disabled={verifying}
            onClick={onClose}
            startIcon={<Iconify icon="eva:arrow-ios-back-fill" width={16} />}
          >
            Voltar e corrigir telefone
          </Button>

          {/* Container invisível para RecaptchaVerifier do Firebase Phone Auth */}
          <Box id={RECAPTCHA_CONTAINER_ID} sx={{ display: 'none' }} />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
