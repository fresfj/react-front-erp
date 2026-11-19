import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Grid from '@mui/material/Unstable_Grid2';

// ----------------------------------------------------------------------

export function ErpDashboardSkeleton() {
  return (
    <Grid container spacing={3}>
      {[0, 1, 2, 3].map((idx) => (
        <Grid key={idx} xs={12} sm={6} md={3}>
          <Card sx={{ p: 3 }}>
            <Stack spacing={1.5}>
              <Skeleton animation="wave" variant="text" width="55%" height={20} />
              <Skeleton animation="wave" variant="text" width="75%" height={38} />
              <Skeleton animation="wave" variant="text" width="60%" height={18} />
            </Stack>
          </Card>
        </Grid>
      ))}

      <Grid xs={12} md={8}>
        <Card sx={{ p: 3 }}>
          <Skeleton animation="wave" variant="text" width="40%" height={26} sx={{ mb: 1 }} />
          <Skeleton animation="wave" variant="text" width="25%" height={18} sx={{ mb: 3 }} />
          <Skeleton animation="wave" variant="rounded" height={300} />
        </Card>
      </Grid>

      <Grid xs={12} md={4}>
        <Card sx={{ p: 3 }}>
          <Skeleton animation="wave" variant="text" width="55%" height={26} sx={{ mb: 1 }} />
          <Skeleton animation="wave" variant="text" width="35%" height={18} sx={{ mb: 3 }} />
          <Skeleton animation="wave" variant="circular" width={220} height={220} sx={{ mx: 'auto' }} />
        </Card>
      </Grid>

      <Grid xs={12} md={6}>
        <Card sx={{ p: 3 }}>
          <Skeleton animation="wave" variant="text" width="45%" height={26} sx={{ mb: 2 }} />
          {[0, 1, 2, 3].map((row) => (
            <Skeleton
              key={row}
              animation="wave"
              variant="rounded"
              height={44}
              sx={{ mb: 1.5 }}
            />
          ))}
        </Card>
      </Grid>

      <Grid xs={12} md={6}>
        <Card sx={{ p: 3 }}>
          <Skeleton animation="wave" variant="text" width="45%" height={26} sx={{ mb: 2 }} />
          {[0, 1, 2, 3].map((row) => (
            <Skeleton
              key={row}
              animation="wave"
              variant="rounded"
              height={44}
              sx={{ mb: 1.5 }}
            />
          ))}
        </Card>
      </Grid>
    </Grid>
  );
}
