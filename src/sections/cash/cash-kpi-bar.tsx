import type { Theme, SxProps } from '@mui/material/styles';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';

import { fCurrency } from 'src/utils/format-number';

import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';

// ----------------------------------------------------------------------

export type CashKpiItem = {
  id: string;
  title: string;
  value: number;
  subtitle: string;
  icon: string;
  color?: 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';
  isPrice?: boolean;
};

type Props = {
  items: CashKpiItem[];
  sx?: SxProps<Theme>;
};

export function CashKpiBar({ items, sx }: Props) {
  return (
    <Card sx={{ mb: { xs: 3, md: 4 }, ...sx }}>
      <Scrollbar sx={{ minHeight: 104 }}>
        <Stack
          direction="row"
          divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
          sx={{ py: 2 }}
        >
          {items.map((item) => {
            const color = item.color || 'primary';
            const isError = color === 'error';
            const isSuccess = color === 'success';

            return (
              <Stack
                key={item.id}
                spacing={1.5}
                direction="row"
                alignItems="center"
                justifyContent="center"
                sx={{
                  flexGrow: 1,
                  flexShrink: 0,
                  minWidth: { xs: 200, sm: 220 },
                  px: 2,
                }}
              >
                {/* Fixed-size circular icon container (NEVER deforms or squishes) */}
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    minWidth: 48,
                    minHeight: 48,
                    maxWidth: 48,
                    maxHeight: 48,
                    flexShrink: 0,
                    borderRadius: '50%',
                    bgcolor: (th) => th.vars.palette[color].lighter,
                    color: (th) => th.vars.palette[color].dark,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Iconify icon={item.icon} width={28} height={28} />
                </Box>

                <Stack spacing={0.5} sx={{ minWidth: 0, flexShrink: 1 }}>
                  <Typography
                    variant="subtitle2"
                    noWrap
                    sx={{
                      color: isError ? 'error.main' : 'text.secondary',
                      fontWeight: isError ? 700 : 600,
                    }}
                  >
                    {item.title}
                  </Typography>

                  <Typography
                    variant="h6"
                    noWrap
                    sx={{
                      color: isError
                        ? 'error.main'
                        : isSuccess
                          ? 'success.main'
                          : 'text.primary',
                    }}
                  >
                    {item.isPrice !== false ? fCurrency(item.value) : item.value}
                  </Typography>

                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: isError ? 'error.main' : 'text.disabled',
                    }}
                  >
                    {item.subtitle}
                  </Typography>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      </Scrollbar>
    </Card>
  );
}
