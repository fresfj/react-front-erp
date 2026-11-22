import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { useTranslate } from 'src/locales';

import { Iconify } from 'src/components/iconify';
import { CustomTabs } from 'src/components/custom-tabs';
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
    '7d': t('periodFilter.last7Days', { defaultValue: '7 dias' }),
    '30d': t('periodFilter.last30Days', { defaultValue: '30 dias' }),
    '90d': t('periodFilter.last90Days', { defaultValue: '90 dias' }),
    all: t('periodFilter.all', { defaultValue: 'Todo o período' }),
  };

  return (
    <>
      <Card sx={{ p: 2, mb: 3 }}>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          alignItems={{ lg: 'center' }}
          justifyContent="space-between"
          spacing={2}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
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

          <CustomTabs
            value={preset}
            onChange={(_, next: DateFilterPreset) => {
              if (!next) return;
              onPresetChange(next);
              if (next === 'custom') {
                rangePicker.onOpen?.();
              }
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderRadius: 1.25,
              bgcolor: 'background.neutral',
              minHeight: 42,
              maxWidth: '100%',
            }}
            slotProps={{
              indicator: {
                borderRadius: 1,
                boxShadow: (theme) => theme.customShadows.z4,
              },
              tab: {
                minHeight: 34,
                py: 0.5,
                px: 1.5,
                typography: 'caption',
                fontWeight: 700,
              },
            }}
          >
            {PRESET_KEYS.map((key) => (
              <Tab key={key} value={key} label={presetLabels[key]} />
            ))}

            <Tab
              value="custom"
              label={
                preset === 'custom' && rangePicker.shortLabel
                  ? rangePicker.shortLabel
                  : t('periodFilter.custom', { defaultValue: 'Personalizado' })
              }
              icon={<Iconify icon="solar:calendar-date-bold" width={16} />}
              iconPosition="start"
              onClick={() => {
                if (preset === 'custom') {
                  rangePicker.onOpen?.();
                }
              }}
            />
          </CustomTabs>
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
