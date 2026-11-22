import i18next from 'i18next';

import { allLangs } from '../all-langs';
import { fallbackLng } from '../config-locales';

// ----------------------------------------------------------------------

export function formatNumberLocale() {
  const lng = (i18next.resolvedLanguage ?? fallbackLng ?? 'pt').toLowerCase();

  const currentLang =
    allLangs.find((lang) => lang.value.toLowerCase() === lng) ||
    allLangs.find((lang) => lng.startsWith(lang.value.toLowerCase()));

  return {
    code: currentLang?.numberFormat.code ?? 'pt-BR',
    currency: currentLang?.numberFormat.currency ?? 'BRL',
  };
}
