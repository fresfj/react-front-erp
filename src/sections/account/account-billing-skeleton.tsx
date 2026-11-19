import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Grid from '@mui/material/Unstable_Grid2';
import CardHeader from '@mui/material/CardHeader';

// ----------------------------------------------------------------------

export function AccountBillingSkeleton() {
  return (
    <Grid container spacing={5}>
      <Grid xs={12} md={8}>
        <Card>
          <CardHeader title={<Skeleton width={120} />} />
          <Grid container spacing={2} sx={{ p: 3 }}>
            {[0, 1, 2].map((i) => (
              <Grid key={i} xs={12} md={4}>
                <Skeleton variant="rounded" height={160} />
              </Grid>
            ))}
          </Grid>
          <Stack spacing={2} sx={{ p: 3, pt: 0 }}>
            <Skeleton height={24} />
            <Skeleton height={24} />
            <Skeleton height={24} width="60%" />
          </Stack>
        </Card>

        <Card sx={{ my: 3 }}>
          <CardHeader title={<Skeleton width={160} />} />
          <Stack spacing={2} sx={{ p: 3 }}>
            <Skeleton variant="rounded" height={48} />
            <Skeleton variant="rounded" height={120} />
          </Stack>
        </Card>
      </Grid>

      <Grid xs={12} md={4}>
        <Card sx={{ p: 3 }}>
          <Skeleton width={140} height={28} sx={{ mb: 2 }} />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={36} sx={{ mb: 1.5 }} />
          ))}
        </Card>
      </Grid>
    </Grid>
  );
}
