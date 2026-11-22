import { useState, useEffect, useCallback } from 'react';

import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';

import { useTranslate } from 'src/locales';
import { CONFIG } from 'src/config-global';

import { SvgColor, svgColorClasses } from '../../svg-color';

// ----------------------------------------------------------------------

export function FullScreenButton() {
  const { t } = useTranslate('common');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const syncState = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', syncState);
    return () => document.removeEventListener('fullscreenchange', syncState);
  }, []);

  const onToggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {
        // ignore browser rejection
      });
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {
        // ignore browser rejection
      });
    }
  }, []);

  const label = fullscreen
    ? t('settingsDrawer.exitFullscreen', { defaultValue: 'Sair da tela cheia' })
    : t('settingsDrawer.fullscreen', { defaultValue: 'Tela cheia' });

  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        onClick={onToggleFullScreen}
        sx={{
          [`& .${svgColorClasses.root}`]: {
            background: (theme) =>
              `linear-gradient(135deg, ${theme.vars.palette.grey[500]} 0%, ${theme.vars.palette.grey[600]} 100%)`,
            ...(fullscreen && {
              background: (theme) =>
                `linear-gradient(135deg, ${theme.vars.palette.primary.light} 0%, ${theme.vars.palette.primary.main} 100%)`,
            }),
          },
        }}
      >
        <SvgColor
          src={`${CONFIG.site.basePath}/assets/icons/setting/${fullscreen ? 'ic-exit-full-screen' : 'ic-full-screen'}.svg`}
          sx={{ width: 18, height: 18 }}
        />
      </IconButton>
    </Tooltip>
  );
}
