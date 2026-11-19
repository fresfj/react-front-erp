import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { varAlpha } from 'src/theme/styles';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  title: string;
  primaryValue: string;
  secondaryValue?: string;
  icon: string;
  color?: string;
  percent: number;
};

export function ProductAnalytic({
  title,
  primaryValue,
  secondaryValue,
  icon,
  color,
  percent,
}: Props) {
  return (
    <Stack
      spacing={2.5}
      direction="row"
      alignItems="center"
      justifyContent="center"
      sx={{ flexGrow: 1, flexShrink: 0, minWidth: 220, px: 2 }}
    >
      <Stack alignItems="center" justifyContent="center" sx={{ position: 'relative', flexShrink: 0 }}>
        <Iconify icon={icon} width={30} sx={{ color, position: 'absolute' }} />

        <CircularProgress
          size={56}
          thickness={2.5}
          value={percent}
          variant="determinate"
          sx={{ color, opacity: 0.8 }}
        />

        <CircularProgress
          size={56}
          value={100}
          thickness={3}
          variant="determinate"
          sx={{
            top: 0,
            left: 0,
            opacity: 0.2,
            position: 'absolute',
            color: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.24),
          }}
        />
      </Stack>

      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" noWrap sx={{ color: 'text.secondary', fontWeight: 600 }}>
          {title}
        </Typography>

        <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
          {primaryValue}
        </Typography>

        {secondaryValue && (
          <Box component="span" sx={{ color: 'text.disabled', typography: 'caption' }}>
            {secondaryValue}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
