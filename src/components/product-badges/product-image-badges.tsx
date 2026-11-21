import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';

import { varAlpha } from 'src/theme/styles';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

export type ProductServingTemp = 'none' | 'cold' | 'hot';

type Props = {
  servingTemperature?: ProductServingTemp;
  discountBadge?: string | null;
  isCombo?: boolean;
  /** Em thumbnails pequenos (ex.: 48px-84px), usa apenas o ícone de temperatura sem texto. */
  compact?: boolean;
};

export function ProductImageBadges({
  servingTemperature,
  discountBadge,
  isCombo,
  compact = false,
}: Props) {
  const theme = useTheme();
  const isCold = servingTemperature === 'cold';
  const isHot = servingTemperature === 'hot';

  if (!isCold && !isHot && !discountBadge && !isCombo) {
    return null;
  }

  return (
    <>
      {/* Top-Left: Temperatura (Gelado / Quente) */}
      {(isCold || isHot) && (
        <Tooltip title={isCold ? 'Produto Gelado' : 'Produto Quente'}>
          <Box
            sx={{
              top: compact ? 4 : 8,
              left: compact ? 4 : 8,
              zIndex: 2,
              position: 'absolute',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: compact ? 0.5 : 0.9,
              py: compact ? 0.35 : 0.4,
              borderRadius: 99,
              color: 'common.white',
              backdropFilter: 'blur(6px)',
              boxShadow: theme.customShadows.z4,
              bgcolor: isCold
                ? varAlpha(theme.vars.palette.info.mainChannel, 0.9)
                : varAlpha(theme.vars.palette.error.mainChannel, 0.9),
              typography: 'caption',
              fontWeight: 700,
              fontSize: compact ? 10 : 11,
              lineHeight: 1,
            }}
          >
            <Iconify
              icon={isCold ? 'solar:snowflake-line-duotone' : 'solar:flame-bold-duotone'}
              width={compact ? 13 : 15}
            />
            {!compact && <Box component="span">{isCold ? 'Gelado' : 'Quente'}</Box>}
          </Box>
        </Tooltip>
      )}

      {/* Top-Right: Desconto / Combo */}
      {(discountBadge || isCombo) && (
        <Stack
          spacing={0.5}
          alignItems="flex-end"
          sx={{
            top: compact ? 4 : 8,
            right: compact ? 4 : 8,
            zIndex: 2,
            position: 'absolute',
          }}
        >
          {discountBadge && (
            <Box
              sx={{
                px: compact ? 0.5 : 0.85,
                py: compact ? 0.25 : 0.35,
                borderRadius: 0.75,
                color: 'common.white',
                bgcolor: 'success.dark',
                boxShadow: theme.customShadows.z4,
                typography: 'caption',
                fontWeight: 800,
                fontSize: compact ? 10 : 11,
                lineHeight: 1.1,
              }}
            >
              {discountBadge}
            </Box>
          )}

          {isCombo && !compact && (
            <Box
              sx={{
                px: 0.85,
                py: 0.35,
                borderRadius: 0.75,
                color: 'common.white',
                bgcolor: varAlpha(theme.vars.palette.primary.darkChannel, 0.92),
                backdropFilter: 'blur(6px)',
                boxShadow: theme.customShadows.z4,
                typography: 'caption',
                fontWeight: 700,
                fontSize: 11,
                lineHeight: 1.1,
              }}
            >
              Combo
            </Box>
          )}
        </Stack>
      )}
    </>
  );
}
