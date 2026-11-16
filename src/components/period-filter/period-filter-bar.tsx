import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { useTranslate } from 'src/locales';

import { Iconify } from 'src/components/iconify';
import {
  CustomDateRangePicker,
  type UseDateRangePickerReturn,
} from 'src/components/custom-date-range-picker';

import type { DateFilterPreset } from './types';

// ----------------------------------------------------------------------

type Props = {
  preset: DateFilterPreset;
  onPresetChange: (preset: DateFilterPreset) => void;
  rangePicker: UseDateRangePickerReturn;
  title?: string;
};

const PRESET_KEYS: Exclude<DateFilterPreset, 'custom'>[] = ['today', '7d', '30d', '90d', 'all'];

export function PeriodFilterBar({ preset, onPresetChange, rangePicker, title }: Props) {
  const { t } = useTranslate('common');

  const presetLabels: Record<Exclude<DateFilterPreset, 'custom'>, string> = {
    today: t('periodFilter.today', { defaultValue: 'Hoje' }),
    '7d': t('periodFilter.last7Days', { defaultValue: 'Últimos 7 dias' }),
    '30d': t('periodFilter.last30Days', { defaultValue: '30 dias' }),
    '90d': t('periodFilter.last90Days', { defaultValue: '90 dias' }),
    all: t('periodFilter.all', { defaultValue: 'Todo o período' }),
  };

  return (
    <>
      <Card sx={{ p: 2, mb: 3 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ md: 'center' }}
          justifyContent="space-between"
          spacing={2}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Iconify
              icon="solar:calendar-mark-bold-duotone"
              width={24}
              sx={{ color: 'primary.main' }}
            />
            <Typography variant="subtitle2">
              {title ||
                t('periodFilter.title', {
                  defaultValue: 'Filtro de período',
                })}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {PRESET_KEYS.map((key) => (
              <Button
                key={key}
                size="small"
                variant={preset === key ? 'contained' : 'soft'}
                color={preset === key ? 'primary' : 'inherit'}
                onClick={() => onPresetChange(key)}
              >
                {presetLabels[key]}
              </Button>
            ))}

            <Button
              size="small"
              variant={preset === 'custom' ? 'contained' : 'outlined'}
              color={preset === 'custom' ? 'primary' : 'inherit'}
              startIcon={<Iconify icon="solar:calendar-date-bold" />}
              onClick={() => {
                onPresetChange('custom');
                rangePicker.onOpen?.();
              }}
            >
              {preset === 'custom' && rangePicker.shortLabel
                ? rangePicker.shortLabel
                : t('periodFilter.custom', { defaultValue: 'Personalizado' })}
            </Button>
          </Stack>
        </Stack>
      </Card>

      <CustomDateRangePicker
        variant="calendar"
        startDate={rangePicker.startDate}
        endDate={rangePicker.endDate}
        onChangeStartDate={rangePicker.onChangeStartDate}
        onChangeEndDate={rangePicker.onChangeEndDate}
        open={rangePicker.open}
        onClose={rangePicker.onClose}
        selected={rangePicker.selected}
        error={rangePicker.error}
        title={t('periodFilter.pickRange', { defaultValue: 'Selecionar período' })}
      />
    </>
  );
}
