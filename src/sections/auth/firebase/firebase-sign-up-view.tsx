import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';
import { useCepLookup } from 'src/hooks/use-cep-lookup';
import { useCnpjLookup } from 'src/hooks/use-cnpj-lookup';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import {
  formatCep,
  digitsOnly,
  formatCnpj,
  formatPhoneBr,
  isCompleteCep,
  isCompleteCnpj,
  isCompletePhoneBr,
} from 'src/utils/br-docs';

import { AUTH } from 'src/lib/firebase';
import { selfRegisterEnterprise } from 'src/api/firestore/platform';

import { Iconify } from 'src/components/iconify';
import { AnimateLogo2 } from 'src/components/animate';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';
import { signUp } from 'src/auth/context/firebase';

// ----------------------------------------------------------------------

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export type SignUpSchemaType = zod.infer<typeof SignUpSchema>;

export const SignUpSchema = zod.object({
  firstName: zod.string().min(1, { message: 'Informe o nome do administrador' }),
  lastName: zod.string().min(1, { message: 'Informe o sobrenome' }),
  email: zod
    .string()
    .min(1, { message: 'Informe o e-mail master' })
    .email({ message: 'E-mail inválido' }),
  password: zod
    .string()
    .min(1, { message: 'Informe a senha' })
    .min(6, { message: 'A senha deve ter pelo menos 6 caracteres' }),
  name: zod.string().min(1, { message: 'Razão social obrigatória' }),
  tradeName: zod.string().optional().or(zod.literal('')),
  document: zod
    .string()
    .min(1, { message: 'CNPJ obrigatório' })
    .refine((v) => isCompleteCnpj(v), { message: 'CNPJ deve ter 14 dígitos' }),
  phone: zod
    .string()
    .min(1, { message: 'WhatsApp obrigatório' })
    .refine((v) => isCompletePhoneBr(v), { message: 'Informe WhatsApp com DDD (10 ou 11 dígitos)' }),
  zipCode: zod
    .string()
    .min(1, { message: 'CEP obrigatório' })
    .refine((v) => isCompleteCep(v), { message: 'CEP deve ter 8 dígitos' }),
  address: zod.string().min(1, { message: 'Endereço obrigatório' }),
  addressNumber: zod.string().min(1, { message: 'Número obrigatório' }),
  complement: zod.string().optional().or(zod.literal('')),
  neighborhood: zod.string().min(1, { message: 'Bairro obrigatório' }),
  city: zod.string().min(1, { message: 'Cidade obrigatória' }),
  state: zod.string().min(2, { message: 'UF obrigatória' }).max(2),
});

// ----------------------------------------------------------------------

export function FirebaseSignUpView() {
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();
  const { checkUserSession } = useAuthContext();
  const password = useBoolean();

  const defaultValues = useMemo<SignUpSchemaType>(
    () => ({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      name: '',
      tradeName: '',
      document: '',
      phone: '',
      zipCode: '',
      address: '',
      addressNumber: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
    }),
    []
  );

  const methods = useForm<SignUpSchemaType>({
    resolver: zodResolver(SignUpSchema),
    defaultValues,
    mode: 'onBlur',
  });

  const {
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const documentWatch = watch('document') || '';
  const zipWatch = watch('zipCode') || '';

  const { loading: cnpjLoading, handleBlur: handleCnpjBlur } = useCnpjLookup({
    document: documentWatch,
    enabled: true,
    onSuccess: (fields) => {
      if (fields.name) setValue('name', fields.name, { shouldDirty: true, shouldValidate: true });
      if (fields.tradeName) {
        setValue('tradeName', fields.tradeName, { shouldDirty: true });
      }
      if (fields.zipCode) {
        setValue('zipCode', formatCep(fields.zipCode), { shouldDirty: true, shouldValidate: true });
      }
      if (fields.address) {
        setValue('address', fields.address, { shouldDirty: true, shouldValidate: true });
      }
      if (fields.addressNumber) {
        setValue('addressNumber', fields.addressNumber, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (fields.neighborhood) {
        setValue('neighborhood', fields.neighborhood, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (fields.city) setValue('city', fields.city, { shouldDirty: true, shouldValidate: true });
      if (fields.state) setValue('state', fields.state, { shouldDirty: true, shouldValidate: true });
      if (fields.phone) {
        setValue('phone', formatPhoneBr(fields.phone), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    },
    onError: () => {
      setErrorMsg('CNPJ não encontrado na consulta automática. Preencha os dados manualmente.');
    },
  });

  const { loading: cepLoading, handleBlur: handleCepBlur } = useCepLookup({
    cep: zipWatch,
    onSuccess: (fields) => {
      if (fields.address) {
        setValue('address', fields.address, { shouldDirty: true, shouldValidate: true });
      }
      if (fields.neighborhood) {
        setValue('neighborhood', fields.neighborhood, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (fields.city) setValue('city', fields.city, { shouldDirty: true, shouldValidate: true });
      if (fields.state) setValue('state', fields.state, { shouldDirty: true, shouldValidate: true });
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    try {
      setErrorMsg('');

      await signUp({
        email: data.email.trim(),
        password: data.password,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
      });

      await selfRegisterEnterprise({
        name: data.name.trim(),
        tradeName: data.tradeName?.trim() || undefined,
        document: digitsOnly(data.document),
        phone: digitsOnly(data.phone),
        displayName: `${data.firstName.trim()} ${data.lastName.trim()}`.trim(),
        zipCode: digitsOnly(data.zipCode),
        address: data.address.trim(),
        addressNumber: data.addressNumber.trim(),
        complement: data.complement?.trim() || undefined,
        neighborhood: data.neighborhood.trim(),
        city: data.city.trim(),
        state: data.state.trim().toUpperCase(),
      });

      await AUTH.currentUser?.getIdToken(true);
      await checkUserSession?.();
      router.replace(paths.dashboard.root);
    } catch (error) {
      console.error(error);
      setErrorMsg(getFirebaseErrorMessage(error, 'Não foi possível criar a empresa'));
    }
  });

  const renderLogo = <AnimateLogo2 sx={{ mb: 3, mx: 'auto' }} />;

  const renderHead = (
    <Stack alignItems="center" spacing={1.5} sx={{ mb: 4 }}>
      <Typography variant="h5">Criar empresa</Typography>

      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
        Cadastre o administrador e os dados da empresa para iniciar.
      </Typography>

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
        <Stack spacing={3}>
          <Typography variant="subtitle2">Administrador (e-mail master)</Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Field.Text name="firstName" label="Nome" InputLabelProps={{ shrink: true }} />
            <Field.Text name="lastName" label="Sobrenome" InputLabelProps={{ shrink: true }} />
          </Stack>

          <Field.Text
            name="email"
            label="E-mail master"
            InputLabelProps={{ shrink: true }}
            autoComplete="username"
          />

          <Field.Text
            name="password"
            label="Senha de acesso"
            placeholder="6+ caracteres"
            type={password.value ? 'text' : 'password'}
            InputLabelProps={{ shrink: true }}
            autoComplete="new-password"
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

          <Divider sx={{ borderStyle: 'dashed' }} />

          <Typography variant="subtitle2">Empresa (plano Free Starter)</Typography>

          <Field.Text
            name="document"
            label="CNPJ"
            type="tel"
            inputMode="numeric"
            InputLabelProps={{ shrink: true }}
            value={formatCnpj(documentWatch)}
            onChange={(event) =>
              setValue('document', formatCnpj(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            onBlur={handleCnpjBlur}
            InputProps={{
              endAdornment: cnpjLoading ? (
                <InputAdornment position="end">
                  <CircularProgress size={18} />
                </InputAdornment>
              ) : null,
            }}
          />

          <Field.Text name="name" label="Razão social" InputLabelProps={{ shrink: true }} />
          <Field.Text
            name="tradeName"
            label="Nome fantasia (opcional)"
            InputLabelProps={{ shrink: true }}
          />

          <Field.Text
            name="phone"
            label="WhatsApp da empresa"
            type="tel"
            inputMode="tel"
            placeholder="(91) 98888-7777"
            InputLabelProps={{ shrink: true }}
            value={formatPhoneBr(watch('phone') || '')}
            onChange={(event) =>
              setValue('phone', formatPhoneBr(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />

          <Divider sx={{ borderStyle: 'dashed' }} />

          <Typography variant="subtitle2">Endereço</Typography>

          <Field.Text
            name="zipCode"
            label="CEP"
            type="tel"
            inputMode="numeric"
            InputLabelProps={{ shrink: true }}
            value={formatCep(zipWatch)}
            onChange={(event) =>
              setValue('zipCode', formatCep(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            onBlur={handleCepBlur}
            InputProps={{
              endAdornment: cepLoading ? (
                <InputAdornment position="end">
                  <CircularProgress size={18} />
                </InputAdornment>
              ) : null,
            }}
          />

          <Field.Text name="address" label="Logradouro" InputLabelProps={{ shrink: true }} />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Field.Text
              name="addressNumber"
              label="Número"
              type="tel"
              inputMode="numeric"
              InputLabelProps={{ shrink: true }}
            />
            <Field.Text
              name="complement"
              label="Complemento"
              InputLabelProps={{ shrink: true }}
            />
          </Stack>

          <Field.Text name="neighborhood" label="Bairro" InputLabelProps={{ shrink: true }} />

          <Box
            gap={2}
            display="grid"
            gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: '2fr 1fr' }}
          >
            <Field.Text name="city" label="Cidade" InputLabelProps={{ shrink: true }} />
            <Field.Select name="state" label="UF" InputLabelProps={{ shrink: true }}>
              {UF_OPTIONS.map((uf) => (
                <MenuItem key={uf} value={uf}>
                  {uf}
                </MenuItem>
              ))}
            </Field.Select>
          </Box>

          <Alert severity="info" sx={{ typography: 'caption' }}>
            Sua empresa entra automaticamente no plano <strong>Free Starter</strong>. Você será o
            administrador master desta conta.
          </Alert>

          <LoadingButton
            fullWidth
            color="inherit"
            size="large"
            type="submit"
            variant="contained"
            loading={isSubmitting}
            loadingIndicator="Criando empresa..."
          >
            Criar empresa e entrar
          </LoadingButton>
        </Stack>
      </Form>
    </>
  );
}
