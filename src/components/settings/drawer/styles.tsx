import type { Theme, SxProps } from '@mui/material/styles';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import ButtonBase from '@mui/material/ButtonBase';

import { varAlpha, stylesMode } from 'src/theme/styles';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type BlockProps = {
  title: string;
  tooltip?: string;
  canReset?: boolean;
  onReset?: () => void;
  sx?: SxProps<Theme>;
  children: React.ReactNode;
};

export function Block({ title, tooltip, canReset, onReset, children, sx }: BlockProps) {
  return (
    <Box
      sx={{
        px: 2,
        pb: 2,
        pt: 4,
        borderRadius: 2,
        display: 'flex',
        position: 'relative',
        flexDirection: 'column',
        border: (theme) => `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
        ...sx,
      }}
    >
      <Box
        component="span"
        sx={{
          px: 1.25,
          top: -12,
          fontSize: 13,
          borderRadius: 22,
          lineHeight: '22px',
          position: 'absolute',
          alignItems: 'center',
          color: 'common.white',
          display: 'inline-flex',
          bgcolor: 'text.primary',
          fontWeight: 'fontWeightSemiBold',
          [stylesMode.dark]: { color: 'grey.800' },
        }}
      >
        {canReset && onReset && (
          <ButtonBase
            disableRipple
            onClick={onReset}
            aria-label={`Reset ${title}`}
            sx={{ ml: -0.5, mr: 0.5 }}
          >
            <Iconify width={14} icon="solar:restart-bold" sx={{ opacity: 0.72 }} />
          </ButtonBase>
        )}

        {title}

        {tooltip && (
          <Tooltip title={tooltip} placement="right" arrow>
            <Iconify
              width={14}
              icon="eva:info-outline"
              sx={{ ml: 0.5, mr: -0.5, opacity: 0.48, cursor: 'pointer' }}
            />
          </Tooltip>
        )}
      </Box>

      {children}
    </Box>
  );
}

// ----------------------------------------------------------------------

type SmallBlockProps = {
  label: string;
  canReset?: boolean;
  onReset?: () => void;
  sx?: SxProps<Theme>;
  children: React.ReactNode;
};

export function SmallBlock({ label, canReset, onReset, sx, children }: SmallBlockProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        ...sx,
      }}
    >
      <ButtonBase
        component="button"
        type="button"
        disableRipple
        onClick={canReset ? onReset : undefined}
        sx={{
          gap: 0.5,
          lineHeight: '16px',
          alignSelf: 'flex-start',
          cursor: canReset ? 'pointer' : 'default',
          pointerEvents: canReset ? 'auto' : 'none',
          fontSize: (theme) => theme.typography.pxToRem(11),
          color: canReset ? 'text.primary' : 'text.secondary',
          fontWeight: canReset ? 'fontWeightBold' : 'fontWeightSemiBold',
          transition: (theme) => theme.transitions.create(['color']),
          '&:hover': canReset ? { color: 'primary.main' } : undefined,
        }}
      >
        {canReset && <Iconify width={14} icon="solar:restart-bold" />}
        {label}
      </ButtonBase>

      {children}
    </Box>
  );
}
