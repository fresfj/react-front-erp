import 'src/global.css';

// ----------------------------------------------------------------------

import { Router } from 'src/routes/sections';

import { useScrollToTop } from 'src/hooks/use-scroll-to-top';

import { CONFIG } from 'src/config-global';
import { LocalizationProvider } from 'src/locales';
import { I18nProvider } from 'src/locales/i18n-provider';
import { ThemeProvider } from 'src/theme/theme-provider';

import { Snackbar } from 'src/components/snackbar';
import { ProgressBar } from 'src/components/progress-bar';
import { MotionLazy } from 'src/components/animate/motion-lazy';
import { EnterpriseThemeBridge } from 'src/components/settings/enterprise-theme-bridge';
import { SettingsDrawer, defaultSettings, SettingsProvider } from 'src/components/settings';

import { useAuthContext } from 'src/auth/hooks';
import { AuthProvider as JwtAuthProvider } from 'src/auth/context/jwt';
import { AuthProvider as FirebaseAuthProvider } from 'src/auth/context/firebase';

// ----------------------------------------------------------------------

const AuthProvider =
  (CONFIG.auth.method === 'firebase' && FirebaseAuthProvider) || JwtAuthProvider;

/** Drawer de tema só para admin/gestor autenticado (configuração da empresa). */
function EnterpriseSettingsShell() {
  const { user } = useAuthContext();
  const canManageTheme =
    Boolean(user) &&
    (user?.role === 'admin' || user?.role === 'gestor' || Boolean(user?.platformAdmin));

  return (
    <>
      {canManageTheme ? <SettingsDrawer /> : null}
      <EnterpriseThemeBridge />
    </>
  );
}

export default function App() {
  useScrollToTop();

  return (
    <I18nProvider>
      <LocalizationProvider>
        <AuthProvider>
          <SettingsProvider settings={defaultSettings}>
            <ThemeProvider>
              <MotionLazy>
                <Snackbar />
                <ProgressBar />
                <EnterpriseSettingsShell />
                <Router />
              </MotionLazy>
            </ThemeProvider>
          </SettingsProvider>
        </AuthProvider>
      </LocalizationProvider>
    </I18nProvider>
  );
}