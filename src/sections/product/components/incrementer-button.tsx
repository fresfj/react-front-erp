import type { StackProps } from '@mui/material/Stack';

import { forwardRef } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import FormHelperText from '@mui/material/FormHelperText';

import { varAlpha } from 'src/theme/styles';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = StackProps & {
  name?: string;
  quantity: number;
  size?: 'small' | 'medium';
  disabledIncrease?: boolean;
  disabledDecrease?: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
  onDelete?: () => void;
  helperText?: React.ReactNode;
};

export const IncrementerButton = forwardRef<HTMLDivElement, Props>(
  (
    {
      quantity,
      size = 'small',
      onIncrease,
      onDecrease,
      onDelete,
      disabledIncrease,
      disabledDecrease,
      helperText,
      sx,
      ...other
    },
    ref
  ) => {
    const isMedium = size === 'medium';
    const isSingle = quantity <= 1;
    const showDelete = Boolean(onDelete && isSingle);

    const stepper = (
      <Stack
        ref={ref}
        flexShrink={0}
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          p: isMedium ? 0.75 : 0.5,
          width: isMedium ? 112 : 88,
          height: isMedium ? 56 : 36,
          borderRadius: 1,
          typography: isMedium ? 'subtitle1' : 'subtitle2',
          fontWeight: isMedium ? 600 : undefined,
          border: (theme) => `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
          transition: (theme) =>
            theme.transitions.create(['border-color'], {
              duration: theme.transitions.duration.shortest,
            }),
          '&:hover': {
            borderColor: 'text.primary',
          },
          ...sx,
        }}
        {...other}
      >
        <IconButton
          size={isMedium ? 'medium' : 'small'}
          onClick={showDelete ? onDelete : onDecrease}
          disabled={!showDelete && disabledDecrease}
          title={showDelete ? 'Remover item do carrinho' : undefined}
          sx={{
            borderRadius: 0.75,
            ...(isMedium && {
              width: 38,
              height: 38,
            }),
            ...(showDelete && {
              color: 'error.main',
              '&:hover': {
                bgcolor: (theme) => varAlpha(theme.vars.palette.error.mainChannel, 0.08),
              },
            }),
          }}
        >
          <Iconify
            icon={showDelete ? 'solar:trash-bin-trash-bold' : 'eva:minus-fill'}
            width={isMedium ? 18 : 16}
          />
        </IconButton>

        {quantity}

        <IconButton
          size={isMedium ? 'medium' : 'small'}
          onClick={onIncrease}
          disabled={disabledIncrease}
          sx={{
            borderRadius: 0.75,
            ...(isMedium && {
              width: 38,
              height: 38,
            }),
          }}
        >
          <Iconify icon="mingcute:add-line" width={isMedium ? 18 : 16} />
        </IconButton>
      </Stack>
    );

    if (helperText) {
      return (
        <Box sx={{ width: isMedium ? 112 : 88, textAlign: 'right' }}>
          {stepper}
          <FormHelperText
            sx={{
              mx: 0,
              mt: 1,
              px: 0.5,
              textAlign: 'right',
              typography: 'caption',
              color: 'text.secondary',
              whiteSpace: 'nowrap',
            }}
          >
            {helperText}
          </FormHelperText>
        </Box>
      );
    }

    return stepper;
  }
);
