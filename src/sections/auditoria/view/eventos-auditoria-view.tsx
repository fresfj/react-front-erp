import type { Query, CustomColumn } from 'src/core/types';

import dayjs from 'dayjs';
import { useRef, useMemo, useState } from 'react';

import { LoadingButton } from '@mui/lab';
import { Card, Stack, Button } from '@mui/material';

import { paths } from 'src/routes/paths';

import { addDaysDate, getDateFormat } from 'src/utils/format-time';

import { useTranslate } from 'src/locales';
import { useGetProductos } from 'src/api/productos';
import { useListDataUsuarios } from 'src/api/usuarios';
import { getQueryEventosAuditoria } from 'src/api/audit';
import { DashboardContent } from 'src/layouts/dashboard';
import Dropdown, { useDropdown } from 'src/core/components/dropdown';
import { DataTableQuery, useDataTableQuery } from 'src/core/components/dataTable';
import CalendarRangePicker, { useCalendarRangePicker } from 'src/core/components/calendar';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

// ----------------------------------------------------------------------

export function EventosAuditoriaView() {
  const { t } = useTranslate('common');

  const queryAudit: Query = getQueryEventosAuditoria();
  const refAudit = useRef();

  const customColumns: CustomColumn[] = useMemo(
    () => [
      {
        name: 'ide_auac',
        visible: true,
      },
      {
        name: 'fecha_auac',
        label: 'Fecha',
        order: 1,
        filter: false,
      },
      {
        name: 'detallE_auac',
        label: 'Referencia',
        orderable: false,
      },
      {
        name: 'pantalla',
        size: 250,
      },
    ],
    []
  );

  const { dataResponse, isLoading, error, isValidating } = useGetProductos();

  const tabAudit = useDataTableQuery({
    config: { dataResponse, isLoading, error, isValidating },
    ref: refAudit,
  });
  const calRango = useCalendarRangePicker(dayjs(addDaysDate(new Date(), -3)), dayjs(new Date()));
  const droUser = useDropdown({ config: useListDataUsuarios() });
  const [openConfirm, setOpenConfirm] = useState(false);

  const handleDeleteAudit = async () => {
    if (calRango.startDate && calRango.endDate && tabAudit.selected) {
      tabAudit.onRefresh();
    }
  };

  const handleOpenConfirm = () => {
    if (tabAudit.selectionMode === 'multiple' && tabAudit.selected.length === 0) {
      toast.warning(t('audit.selectOne'));
    } else {
      setOpenConfirm(true);
    }
  };

  const handleCloseConfirm = () => {
    setOpenConfirm(false);
  };

  const handleSearch = () => {
    queryAudit.params.fechaInicio = getDateFormat(calRango.startDate);
    queryAudit.params.fechaFin = getDateFormat(calRango.endDate);
    queryAudit.params.ide_usua = droUser.value === null ? null : Number(droUser.value);
    tabAudit.onRefresh();
  };

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('audit.eventsHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          {
            name: t('nav.audit'),
            href: paths.dashboard.auditoria.root,
          },
        ]}
        action={
          <Button
            onClick={handleOpenConfirm}
            color="error"
            variant="contained"
            startIcon={<Iconify icon="ic:twotone-delete-outline" />}
          >
            {tabAudit.selectionMode === 'multiple'
              ? t('audit.deleteSelected')
              : t('audit.deleteAudit')}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <Card>
        <Stack
          spacing={2}
          alignItems="center"
          direction={{
            xs: 'column',
            md: 'row',
          }}
          sx={{ px: 2.5, py: 3, border: 'radius' }}
        >
          <CalendarRangePicker useCalendarRangePicker={calRango} />
          <Dropdown label={t('audit.user')} useDropdown={droUser} />
          <LoadingButton
            loading={tabAudit.isLoading}
            variant="contained"
            onClick={handleSearch}
            endIcon={<Iconify icon="ic:baseline-search" />}
            fullWidth
          >
            {t('audit.search')}
          </LoadingButton>
        </Stack>
        <DataTableQuery
          ref={refAudit}
          useDataTableQuery={tabAudit}
          customColumns={customColumns}
          rows={50}
          defaultOrderBy="fecha_auac"
          numSkeletonCols={7}
        />
      </Card>

      <ConfirmDialog
        open={openConfirm}
        onClose={handleCloseConfirm}
        title={t('audit.deleteTitle')}
        content={
          tabAudit.selectionMode === 'multiple'
            ? t('audit.deleteConfirmMultiple', { count: tabAudit.selected.length })
            : t('audit.deleteConfirmAll')
        }
        action={
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              handleDeleteAudit();
              handleCloseConfirm();
            }}
          >
            {t('audit.delete')}
          </Button>
        }
      />
    </DashboardContent>
  );
}