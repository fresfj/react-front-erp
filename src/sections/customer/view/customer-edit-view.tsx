import type { Customer } from 'src/api/firestore/customers';

import { useState, useEffect, useCallback } from 'react';

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { getCustomer } from 'src/api/firestore/customers';

import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import { CustomerForm } from '../customer-form';

// ----------------------------------------------------------------------

type Props = {
  customerId: string;
};

export function CustomerEditView({ customerId }: Props) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    if (!enterpriseId || !customerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getCustomer(enterpriseId, customerId);
      setCustomer(data);
    } finally {
      setLoading(false);
    }
  }, [customerId, enterpriseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!loading && !customer) {
    return (
      <DashboardContent>
        <EmptyContent
          filled
          title={t('customers.notFound', { defaultValue: 'Cliente não encontrado' })}
          sx={{ py: 10 }}
        />
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('customers.editHeading', { defaultValue: 'Editar cliente' })}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          {
            name: t('nav.customers', { defaultValue: 'Clientes' }),
            href: paths.dashboard.customers.list,
          },
          { name: customer?.name || customerId },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      {customer && <CustomerForm currentCustomer={customer} />}
    </DashboardContent>
  );
}
