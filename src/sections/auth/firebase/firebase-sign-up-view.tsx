import { z as zod } from 'zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { Iconify } from 'src/components/iconify';
import { AnimateLogo2 } from 'src/components/animate';
import { Form, Field } from 'src/components/hook-form';

import { signUp } from 'src/auth/context/firebase';

// ----------------------------------------------------------------------

export type SignUpSchemaType = zod.infer<typeof SignUpSchema>;

export const SignUpSchema = zod.object({
  firstName: zod.string().min(1, { message: 'Informe o nome' }),
  lastName: zod.string().min(1, { message: 'Informe o sobrenome' }),
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

export function FirebaseSignUpView() {
  const [errorMsg, setErrorMsg] = useState('');

  const router = useRouter();

  const password = useBoolean();

  const defaultValues = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  };

  const methods = useForm<SignUpSchemaType>({
    resolver: zodResolver(SignUpSchema),
    defaultValues,
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const onSubmit = handleSubmit(async (data) => {
    try {
      setErrorMsg('');
      await signUp({
        email: data.email.trim(),
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      });

      const searchParams = new URLSearchParams({ email: data.email.trim() }).toString();
      router.push(`${paths.auth.firebase.verify}?${searchParams}`);
    } catch (error) {
      console.error(error);
      setErrorMsg(getFirebaseErrorMessage(error, 'Não foi possível criar a conta'));
    }
  });

  const renderLogo = <AnimateLogo2 sx={{ mb: 3, mx: 'auto' }} />;

  const renderHead = (
    <Stack alignItems="center" spacing={1.5} sx={{ mb: 5 }}>
      <Typography variant="h5">Criar conta da empresa</Typography>

      <Stack direction="row" spacing={0.5}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Já tem acesso?
        </Typography>

        <Link component={RouterLink} href={paths.auth.firebase.signIn} variant="subtitle2">
          Entrar
        </Link>
      </Stack>
    </Stack>
  );

  const renderForm = (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Field.Text name="firstName" label="Nome" InputLabelProps={{ shrink: true }} />
        <Field.Text name="lastName" label="Sobrenome" InputLabelProps={{ shrink: true }} />
      </Stack>

      <Field.Text name="email" label="E-mail" InputLabelProps={{ shrink: true }} />

      <Field.Text
        name="password"
        label="Senha"
        placeholder="6+ caracteres"
        type={password.value ? 'text' : 'password'}
        InputLabelProps={{ shrink: true }}
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

      <LoadingButton
        fullWidth
        color="inherit"
        size="large"
        type="submit"
        variant="contained"
        loading={isSubmitting}
        loadingIndicator="Criando..."
      >
        Criar conta
      </LoadingButton>
    </Stack>
  );

  const renderTerms = (
    <Typography
      component="div"
      sx={{
        mt: 3,
        textAlign: 'center',
        typography: 'caption',
        color: 'text.secondary',
      }}
    >
      Ao criar a conta, você concorda com os termos de uso e a política de privacidade.
    </Typography>
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

      {renderTerms}
    </>
  );
}
