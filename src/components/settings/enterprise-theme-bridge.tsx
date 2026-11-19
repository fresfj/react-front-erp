import type { EnterpriseUiSettings } from 'src/api/firestore/platform';

import { useRef, useEffect } from 'react';

import { getEnterprise, updateEnterpriseSettings } from 'src/api/firestore/platform';

import { useAuthContext } from 'src/auth/hooks';

import { useSettingsContext } from './context';

// ----------------------------------------------------------------------

function pickUiSettings(input: {
  colorScheme: string;
  primaryColor: string;
  contrast: string;
  navColor: string;
  navLayout: string;
  compactLayout: boolean;
  fontFamily: string;
  fontSize?: number;
}): EnterpriseUiSettings {
  return {
    colorScheme: input.colorScheme === 'dark' ? 'dark' : 'light',
    primaryColor: input.primaryColor as EnterpriseUiSettings['primaryColor'],
    contrast: input.contrast === 'hight' ? 'hight' : 'default',
    navColor: input.navColor === 'apparent' ? 'apparent' : 'integrate',
    navLayout: input.navLayout as EnterpriseUiSettings['navLayout'],
    compactLayout: input.compactLayout,
    fontFamily: input.fontFamily,
    fontSize: input.fontSize,
  };
}

/**
 * Aplica `enterprises/{id}.uiSettings` no Settings Minimals após login
 * e persiste alterações do admin (tema por empresa).
 */
export function EnterpriseThemeBridge() {
  const { user } = useAuthContext();
  const {
    onUpdate,
    colorScheme,
    primaryColor,
    contrast,
    navColor,
    navLayout,
    compactLayout,
    fontFamily,
    fontSize,
  } = useSettingsContext();

  const appliedEnterpriseId = useRef<string | null>(null);
  const skipPersist = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enterpriseId =
    typeof user?.enterpriseId === 'string' && user.enterpriseId ? user.enterpriseId : null;
  const canPersist =
    user?.role === 'admin' || user?.role === 'gestor' || Boolean(user?.platformAdmin);

  useEffect(() => {
    if (!enterpriseId) {
      appliedEnterpriseId.current = null;
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const enterprise = await getEnterprise(enterpriseId);
        if (cancelled) return;
        if (appliedEnterpriseId.current === enterpriseId) return;

        appliedEnterpriseId.current = enterpriseId;
        if (enterprise?.uiSettings) {
          skipPersist.current = true;
          onUpdate(enterprise.uiSettings);
        }
      } catch (error) {
        console.warn('Enterprise uiSettings load skipped:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enterpriseId, onUpdate]);

  useEffect(() => {
    if (!enterpriseId || !canPersist) return undefined;
    if (skipPersist.current) {
      skipPersist.current = false;
      return undefined;
    }
    if (appliedEnterpriseId.current !== enterpriseId) return undefined;

    if (persistTimer.current) clearTimeout(persistTimer.current);

    persistTimer.current = setTimeout(() => {
      const payload = pickUiSettings({
        colorScheme,
        primaryColor,
        contrast,
        navColor,
        navLayout,
        compactLayout,
        fontFamily,
        fontSize,
      });
      updateEnterpriseSettings(enterpriseId, { uiSettings: payload }).catch((error) => {
        console.warn('Enterprise uiSettings save skipped:', error);
      });
    }, 800);

    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [
    enterpriseId,
    canPersist,
    colorScheme,
    primaryColor,
    contrast,
    navColor,
    navLayout,
    compactLayout,
    fontFamily,
    fontSize,
  ]);

  return null;
}
