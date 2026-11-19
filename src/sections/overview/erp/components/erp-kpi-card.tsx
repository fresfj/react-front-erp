import type { CardProps } from '@mui/material/Card';
import type { ChartOptions } from 'src/components/chart';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';

import { fNumber, fPercent } from 'src/utils/format-number';

import { varAlpha, stylesMode } from 'src/theme/styles';

import { Iconify } from 'src/components/iconify';
import { Chart, useChart } from 'src/components/chart';

// ----------------------------------------------------------------------

type Props = CardProps & {
  title: string;
  value: string;
  subtitle?: string;
  percent?: number | null;
  percentLabel?: string;
  chartType?: 'line' | 'bar';
  chart: {
    colors?: string[];
    categories: string[];
    series: number[];
    options?: ChartOptions;
  };
};

export function ErpKpiCard({
  title,
  value,
  subtitle,
  percent,
  percentLabel = 'vs período anterior',
  chartType = 'line',
  chart,
  sx,
  ...other
}: Props) {
  const theme = useTheme();

  const chartColors = chart.colors ?? [theme.palette.primary.light, theme.palette.primary.main];

  // Ensure at least 2 points so sparklines never collapse into a giant single bar or blank line
  const safeSeries =
    chart.series.length === 0
      ? [0, 0]
      : chart.series.length === 1
        ? [0, chart.series[0]]
        : chart.series;

  const safeCategories =
    chart.categories.length === 0
      ? ['—', '—']
      : chart.categories.length === 1
        ? ['', chart.categories[0]]
        : chart.categories;

  const chartOptions = useChart({
    chart: { sparkline: { enabled: true } },
    colors: [chartColors[1] ?? chartColors[0]],
    xaxis: { categories: safeCategories },
    grid: {
      padding: { top: 6, left: 6, right: 6, bottom: 6 },
    },
    ...(chartType === 'bar'
      ? {
          plotOptions: { bar: { borderRadius: 2, columnWidth: '48%' } },
        }
      : {
          stroke: { width: 2.5, curve: 'smooth' },
          fill: {
            type: 'gradient',
            gradient: {
              colorStops: [
                { offset: 0, color: chartColors[0], opacity: 1 },
                { offset: 100, color: chartColors[1] ?? chartColors[0], opacity: 1 },
              ],
            },
          },
        }),
    tooltip: {
      y: { formatter: (val: number) => fNumber(val), title: { formatter: () => '' } },
    },
    ...chart.options,
  });

  const hasPercent = typeof percent === 'number' && !Number.isNaN(percent);
  const isNegative = hasPercent && percent < 0;

  return (
    <Card
      sx={{
        p: 3,
        height: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        ...sx,
      }}
      {...other}
    >
      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: 1,
        }}
      >
        <Tooltip title={title} placement="top-start">
          <Box
            sx={{
              typography: 'subtitle2',
              color: 'text.secondary',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </Box>
        </Tooltip>

        <Box
          sx={{
            my: 1.25,
            typography: 'h3',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {value}
        </Box>

        <Box>
          {hasPercent && (
            <Box sx={{ gap: 0.5, display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <Box
                component="span"
                sx={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  display: 'flex',
                  borderRadius: '50%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: varAlpha(theme.vars.palette.success.mainChannel, 0.16),
                  color: 'success.dark',
                  [stylesMode.dark]: { color: 'success.light' },
                  ...(isNegative && {
                    bgcolor: varAlpha(theme.vars.palette.error.mainChannel, 0.16),
                    color: 'error.dark',
                    [stylesMode.dark]: { color: 'error.light' },
                  }),
                }}
              >
                <Iconify
                  width={14}
                  icon={isNegative ? 'eva:trending-down-fill' : 'eva:trending-up-fill'}
                />
              </Box>

              <Box component="span" sx={{ typography: 'subtitle2', flexShrink: 0 }}>
                {percent > 0 && '+'}
                {fPercent(percent)}
              </Box>

              <Box
                component="span"
                sx={{
                  color: 'text.secondary',
                  typography: 'caption',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {percentLabel}
              </Box>
            </Box>
          )}

          {subtitle && (
            <Tooltip title={subtitle} placement="bottom-start">
              <Box
                sx={{
                  mt: hasPercent ? 0.5 : 0,
                  color: 'text.secondary',
                  typography: 'caption',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {subtitle}
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Box sx={{ flexShrink: 0 }}>
        <Chart
          type={chartType}
          series={[{ data: safeSeries }]}
          options={chartOptions}
          width={84}
          height={58}
        />
      </Box>
    </Card>
  );
}
