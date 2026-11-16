import type { Theme, SxProps } from '@mui/material/styles';

import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useTranslate } from 'src/locales';

import { toast } from 'src/components/snackbar';
import { SplashScreen } from 'src/components/loading-screen';

import { useAuthContext } from 'src/auth/hooks';
import { signOut } from 'src/auth/context/firebase/action';

// ----------------------------------------------------------------------

type Props = {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
};

export function ClaimsGuard({ children, sx }: Props) {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user, loading, authenticated } = useAuthContext();

  if (loading) {
    return <SplashScreen />;
  }

  if (!authenticated) {
    return <>{children}</>;
  }

  if (user?.claimsValid) {
    return <>{children}</>;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace(paths.auth.firebase.signIn);
    } catch (error) {
      console.error(error);
      toast.error(String(error));
    }
  };

  return (
    <Container sx={{ textAlign: 'center', py: 10, ...sx }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('claims.missingTitle')}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3 }}>
        {t('claims.missingBody')}
      </Typography>
      <Button variant="contained" onClick={handleSignOut}>
        {t('claims.signOut')}
      </Button>
    </Container>
  );
}