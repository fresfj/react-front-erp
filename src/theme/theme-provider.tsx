import type {} from '@mui/lab/themeAugmentation';
import type {} from '@mui/x-tree-view/themeAugmentation';
import type {} from '@mui/x-data-grid/themeAugmentation';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import type {} from '@mui/material/themeCssVarsAugmentation';

import { useEffect } from 'react';

import CssBaseline from '@mui/material/CssBaseline';
import {
  useColorScheme,
  Experimental_CssVarsProvider as CssVarsProvider,
} from '@mui/material/styles';

import { useTranslate } from 'src/locales';

import { useSettingsContext } from 'src/components/settings';

import { createTheme } from './create-theme';
import { RTL } from './with-settings/right-to-left';
import { schemeConfig } from './color-scheme-script';

// ----------------------------------------------------------------------

function ColorSchemeSync() {
  const { mode } = useColorScheme();
  const settings = useSettingsContext();

  useEffect(() => {
    if ((mode === 'light' || mode === 'dark') && settings.colorScheme !== mode) {
      settings.onUpdateField('colorScheme', mode);
    }
  }, [mode, settings]);

  return null;
}

type Props = {
  children: React.ReactNode;
};

export function ThemeProvider({ children }: Props) {
  const { currentLang } = useTranslate();

  const settings = useSettingsContext();

  const theme = createTheme(currentLang?.systemValue, settings);

  return (
    <CssVarsProvider
      theme={theme}
      defaultMode={schemeConfig.defaultMode}
      modeStorageKey={schemeConfig.modeStorageKey}
    >
      <ColorSchemeSync />
      <CssBaseline />
      <RTL direction={settings.direction}>{children}</RTL>
    </CssVarsProvider>
  );
}
