import { z as zod } from 'zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { AnimateLogo2 } from 'src/components/animate';
import { Form, Field } from 'src/components/hook-form';
import { Iconify, SocialIcon } from 'src/components/iconify';

import { useAuthContext } from 'src/auth/hooks';
import { signInWithGoogle, signInWithPassword } from 'src/auth/context/firebase';

// ----------------------------------------------------------------------

export type SignInSchemaType = zod.infer<typeof SignInSchema>;

export const SignInSchema = zod.object({
  email: zod
    .string()
    .min(1, { message: 'Informe o e-mail' })
    .email({ message: 'E-mail inválido' }),
  password: zod
    .string()
    .min(1, { message: 'Informe a senha' })
    .min(6, { message: 'A senha deve ter pelo menos 6 caracteres' }),
});

// ----------------------------------------------------------------------

export function FirebaseSignInView() {
  const router = useRouter();

  const { checkUserSession } = useAuthContext();

  const [errorMsg, setErrorMsg] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const password = useBoolean();

  const defaultValues = {
    email: '',
    password: '',
  };

  const methods = useForm<SignInSchemaType>({
    resolver: zodResolver(SignInSchema),
    defaultValues,
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const onSubmit = handleSubmit(async (data) => {
    try {
      setErrorMsg('');
      await signInWithPassword({ email: data.email.trim(), password: data.password });
      await checkUserSession?.();

      router.refresh();
    } catch (error) {
      console.error(error);
      setErrorMsg(
        getFirebaseErrorMessage(error, 'Não foi possível entrar. Verifique e-mail e senha.')
      );
    }
  });

  const handleSignInWithGoogle = async () => {
    try {
      setErrorMsg('');
      setGoogleLoading(true);
      await signInWithGoogle();
      await checkUserSession?.();
      router.refresh();
    } catch (error) {
      console.error(error);
      setErrorMsg(getFirebaseErrorMessage(error, 'Não foi possível entrar com Google'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const renderLogo = <AnimateLogo2 sx={{ mb: 3, mx: 'auto' }} />;

  const renderHead = (
    <Stack alignItems="center" spacing={1.5} sx={{ mb: 5 }}>
      <Typography variant="h5">Entrar na sua conta</Typography>

      <Stack direction="row" spacing={0.5}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Ainda não tem empresa?
        </Typography>

        <Link component={RouterLink} href={paths.auth.firebase.signUp} variant="subtitle2">
          Criar conta
        </Link>
      </Stack>
    </Stack>
  );

  const renderForm = (
    <Stack spacing={3}>
      <Field.Text
        name="email"
        label="E-mail"
        InputLabelProps={{ shrink: true }}
        autoComplete="username"
      />

      <Stack spacing={1.5}>
        <Link
          component={RouterLink}
          href={paths.auth.firebase.resetPassword}
          variant="body2"
          color="inherit"
          sx={{ alignSelf: 'flex-end' }}
        >
          Esqueceu a senha?
        </Link>

        <Field.Text
          name="password"
          label="Senha"
          placeholder="6+ caracteres"
          type={password.value ? 'text' : 'password'}
          InputLabelProps={{ shrink: true }}
          autoComplete="current-password"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={password.onToggle} edge="end">
                  <Iconify icon={password.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Stack>

      <LoadingButton
        fullWidth
        color="inherit"
        size="large"
        type="submit"
        variant="contained"
        loading={isSubmitting}
        loadingIndicator="Entrando..."
      >
        Entrar
      </LoadingButton>
    </Stack>
  );

  return (
    <>
      {renderLogo}

      {renderHead}

      {!!errorMsg && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMsg}
        </Alert>
      )}

      <Form methods={methods} onSubmit={onSubmit}>
        {renderForm}
      </Form>

      <Divider
        sx={{
          my: 3,
          typography: 'overline',
          color: 'text.disabled',
          '&::before, :after': { borderTopStyle: 'dashed' },
        }}
      >
        OU
      </Divider>

      <LoadingButton
        fullWidth
        color="inherit"
        size="large"
        variant="outlined"
        loading={googleLoading}
        onClick={handleSignInWithGoogle}
        startIcon={<SocialIcon icon="google" width={22} />}
      >
        Entrar com Google
      </LoadingButton>
    </>
  );
}
