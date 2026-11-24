import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';

import { PUBLIC_STORE_MAX_WIDTH } from './public-store-helpers';

// ----------------------------------------------------------------------

export function StorefrontSkeleton() {
  return (
    <Box sx={{ pb: 14, pt: { xs: 2, sm: 3 }, minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ maxWidth: PUBLIC_STORE_MAX_WIDTH, mx: 'auto', px: { xs: 2, sm: 3 } }}>
        {/* Card do Topo (Banner + Avatar + Nome + Status) */}
        <Card sx={{ mb: 2.5, borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ position: 'relative' }}>
            <Skeleton variant="rectangular" animation="wave" sx={{ height: { xs: 150, sm: 190 } }} />
            <Skeleton
              variant="circular"
              animation="wave"
              width={64}
              height={64}
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: -32,
                mx: 'auto',
                border: (theme) => `3px solid ${theme.vars.palette.background.paper}`,
              }}
            />
          </Box>

          <Box sx={{ pt: 6, px: 2.5, pb: 2.5 }}>
            <Skeleton
              variant="text"
              animation="wave"
              width="55%"
              height={28}
              sx={{ mx: 'auto', mb: 1 }}
            />
            <Skeleton
              variant="text"
              animation="wave"
              width="75%"
              height={20}
              sx={{ mx: 'auto' }}
            />
            <Divider sx={{ my: 1.75, borderStyle: 'dashed' }} />
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Skeleton variant="rounded" animation="wave" width={72} height={24} />
              <Skeleton variant="rounded" animation="wave" width={96} height={24} />
              <Skeleton variant="rounded" animation="wave" width={110} height={24} />
            </Stack>
          </Box>
        </Card>

        {/* Campo de busca + chips de categorias */}
        <Skeleton
          variant="rounded"
          animation="wave"
          height={56}
          sx={{ borderRadius: 1.5, mb: 1.5 }}
        />

        <Stack direction="row" spacing={1} sx={{ mb: 3, overflow: 'hidden' }}>
          {[88, 120, 110, 96].map((w, i) => (
            <Skeleton
              key={i}
              variant="rounded"
              animation="wave"
              width={w}
              height={32}
              sx={{ borderRadius: 4, flexShrink: 0 }}
            />
          ))}
        </Stack>

        {/* Seção de Produtos */}
        <Skeleton variant="text" animation="wave" width={160} height={28} sx={{ mb: 1.5 }} />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 1.5,
          }}
        >
          {[0, 1, 2, 3].map((item) => (
            <Card key={item} sx={{ p: 1.5, borderRadius: 1.5 }}>
              <Stack direction="row" spacing={1.5}>
                <Skeleton
                  variant="rounded"
                  animation="wave"
                  width={84}
                  height={84}
                  sx={{ borderRadius: 1, flexShrink: 0 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" animation="wave" width="85%" height={22} />
                  <Skeleton variant="text" animation="wave" width="60%" height={18} />
                  <Skeleton
                    variant="text"
                    animation="wave"
                    width="40%"
                    height={24}
                    sx={{ mt: 1 }}
                  />
                </Box>
              </Stack>
              <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                <Skeleton variant="rounded" animation="wave" width={96} height={30} />
              </Box>
            </Card>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export function CheckoutSkeleton() {
  return (
    <Box sx={{ minHeight: '100vh', width: '100%', bgcolor: 'background.default', pb: 6 }}>
      {/* Top Bar */}
      <Box
        sx={{
          width: '100%',
          bgcolor: 'background.paper',
          borderBottom: (theme) => `1px solid ${theme.vars.palette.divider}`,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ maxWidth: PUBLIC_STORE_MAX_WIDTH, mx: 'auto', px: { xs: 2, sm: 3 }, py: 1.75 }}
        >
          <Skeleton variant="rounded" animation="wave" width={160} height={36} />
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Skeleton variant="circular" animation="wave" width={32} height={32} />
            <Skeleton variant="text" animation="wave" width={120} height={24} />
          </Stack>
        </Stack>
      </Box>

      {/* Grid 2 colunas */}
      <Box
        sx={{
          maxWidth: PUBLIC_STORE_MAX_WIDTH,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          pt: { xs: 2.5, md: 4 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.35fr 1fr' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Stack spacing={3}>
          <Card sx={{ p: 3, borderRadius: 2 }}>
            <Skeleton variant="text" animation="wave" width={220} height={28} sx={{ mb: 2 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Skeleton variant="rounded" animation="wave" height={96} sx={{ flex: 1 }} />
              <Skeleton variant="rounded" animation="wave" height={96} sx={{ flex: 1 }} />
            </Stack>
          </Card>

          <Card sx={{ p: 3, borderRadius: 2 }}>
            <Skeleton variant="text" animation="wave" width={200} height={28} sx={{ mb: 2 }} />
            <Stack spacing={2}>
              <Skeleton variant="rounded" animation="wave" height={56} />
              <Skeleton variant="rounded" animation="wave" height={56} />
            </Stack>
          </Card>
        </Stack>

        <Card sx={{ p: 3, borderRadius: 2 }}>
          <Skeleton variant="text" animation="wave" width={180} height={28} sx={{ mb: 2 }} />
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            <Skeleton variant="rounded" animation="wave" height={72} />
            <Skeleton variant="rounded" animation="wave" height={72} />
          </Stack>
          <Skeleton variant="rounded" animation="wave" height={44} sx={{ mb: 2.5 }} />
          <Divider sx={{ mb: 2, borderStyle: 'dashed' }} />
          <Skeleton variant="text" animation="wave" height={24} sx={{ mb: 1 }} />
          <Skeleton variant="text" animation="wave" height={32} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" animation="wave" height={52} />
        </Card>
      </Box>
    </Box>
  );
}

export function OrderProgressSkeleton() {
  return (
    <Box sx={{ width: '100%' }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
        <Skeleton variant="text" animation="wave" width={130} height={18} />
        <Skeleton variant="text" animation="wave" width={36} height={18} />
      </Stack>
      <Skeleton variant="rounded" animation="wave" height={8} sx={{ borderRadius: 4, mb: 2.5 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1 }}>
        {[0, 1, 2, 3, 4].map((step) => (
          <Stack key={step} alignItems="center" spacing={0.75}>
            <Skeleton variant="circular" animation="wave" width={32} height={32} />
            <Skeleton
              variant="text"
              animation="wave"
              width={48}
              height={14}
              sx={{ display: { xs: step === 1 || step === 2 ? 'block' : 'none', md: 'block' } }}
            />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export function OrderCardSkeleton() {
  return (
    <Card sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={1}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Skeleton variant="text" animation="wave" width={150} height={24} />
            <Skeleton variant="rounded" animation="wave" width={92} height={22} />
          </Stack>
          <Skeleton variant="text" animation="wave" width={220} height={16} />
        </Box>
        <Skeleton variant="text" animation="wave" width={72} height={30} />
      </Stack>

      <OrderProgressSkeleton />

      <Divider sx={{ my: 2, borderStyle: 'dashed' }} />

      <Stack spacing={0.75} sx={{ mb: 2 }}>
        <Stack direction="row" justifyContent="space-between">
          <Skeleton variant="text" animation="wave" width="60%" height={20} />
          <Skeleton variant="text" animation="wave" width={54} height={20} />
        </Stack>
        <Stack direction="row" justifyContent="space-between">
          <Skeleton variant="text" animation="wave" width="45%" height={20} />
          <Skeleton variant="text" animation="wave" width={54} height={20} />
        </Stack>
      </Stack>

      <Stack direction="row" justifyContent="flex-end">
        <Skeleton variant="rounded" animation="wave" width={150} height={30} />
      </Stack>
    </Card>
  );
}
