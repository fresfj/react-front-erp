import type { NavSectionProps } from 'src/components/nav-section';

import { useMemo } from 'react';

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { CONFIG } from 'src/config-global';
import { getEffectivePermissions } from 'src/api/firestore/members';

import { SvgColor } from 'src/components/svg-color';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const icon = (name: string) => (
  <SvgColor src={`${CONFIG.site.basePath}/assets/icons/navbar/${name}.svg`} />
);

const ICONS = {
  user: icon('ic-user'),
  lock: icon('ic-lock'),
  order: icon('ic-order'),
  kanban: icon('ic-kanban'),
  banking: icon('ic-banking'),
  invoice: icon('ic-invoice'),
  product: icon('ic-product'),
  ecommerce: icon('ic-ecommerce'),
  dashboard: icon('ic-dashboard'),
};

// ----------------------------------------------------------------------

export function useNavData(): NavSectionProps['data'] {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const platformAdmin = Boolean(user?.platformAdmin);
  const isAdminOrGestor =
    platformAdmin || user?.role === 'admin' || user?.role === 'gestor';
  const perms = useMemo(
    () => getEffectivePermissions(user?.role, user?.permissions as string[] | undefined),
    [user?.permissions, user?.role]
  );

  return useMemo(
    () => [
      {
        // Sem subheader ("Visão geral" / headers de seção)
        items: [
          ...(perms.has('dre') || isAdminOrGestor
            ? [{ title: t('nav.app'), path: paths.dashboard.root, icon: ICONS.dashboard }]
            : []),
          ...(platformAdmin
            ? [
                {
                  title: t('nav.enterprises'),
                  path: paths.dashboard.enterprises.list,
                  icon: ICONS.banking,
                },
              ]
            : []),
          ...(perms.has('pos')
            ? [
                {
                  title: t('nav.pos'),
                  path: paths.dashboard.pos.root,
                  icon: ICONS.invoice,
                  children: [
                    { title: t('nav.posCheckout'), path: paths.dashboard.pos.checkout },
                    { title: t('nav.salesHistory'), path: paths.dashboard.pos.sales },
                  ],
                },
              ]
            : []),
          ...(perms.has('customers')
            ? [
                {
                  title: t('nav.customers', { defaultValue: 'Clientes' }),
                  path: paths.dashboard.customers.list,
                  icon: ICONS.user,
                },
              ]
            : []),
          ...(perms.has('cash_close') || perms.has('dre')
            ? [
                {
                  title: t('nav.cash', { defaultValue: 'Financeiro e Caixa' }),
                  path: paths.dashboard.cash.root,
                  icon: ICONS.banking,
                  children: [
                    ...(perms.has('cash_close')
                      ? [
                          {
                            title: t('nav.cashSession', {
                              defaultValue: 'Caixa (Fechamento Cego)',
                            }),
                            path: paths.dashboard.cash.root,
                          },
                        ]
                      : []),
                    ...(perms.has('dre')
                      ? [
                          {
                            title: t('nav.dre', { defaultValue: 'DRE Financeiro' }),
                            path: paths.dashboard.cash.dre,
                          },
                          {
                            title: t('nav.cashLedger', { defaultValue: 'Extrato de caixa' }),
                            path: paths.dashboard.cash.ledger,
                          },
                          {
                            title: t('nav.sellerRanking', {
                              defaultValue: 'Ranking de vendedores',
                            }),
                            path: paths.dashboard.cash.ranking,
                          },
                          {
                            title: t('nav.payables', { defaultValue: 'Contas a pagar' }),
                            path: paths.dashboard.cash.payables,
                          },
                          {
                            title: t('nav.receivables', { defaultValue: 'Contas a receber' }),
                            path: paths.dashboard.cash.receivables,
                          },
                        ]
                      : []),
                  ],
                },
              ]
            : []),
          ...(perms.has('products')
            ? [
                {
                  title: t('nav.products'),
                  path: paths.dashboard.products.list,
                  icon: ICONS.product,
                },
              ]
            : []),
          ...(perms.has('suppliers')
            ? [
                {
                  title: t('nav.suppliers'),
                  path: paths.dashboard.suppliers.list,
                  icon: ICONS.ecommerce,
                },
              ]
            : []),
          ...(perms.has('processing')
            ? [
                {
                  title: t('nav.processing'),
                  path: paths.dashboard.processing.list,
                  icon: ICONS.kanban,
                },
              ]
            : []),
          ...(perms.has('batches_read') || perms.has('batches_write')
            ? [
                {
                  title: t('nav.batches'),
                  path: paths.dashboard.batches.list,
                  icon: ICONS.order,
                  children: [
                    { title: t('nav.batchesList'), path: paths.dashboard.batches.list },
                    ...(perms.has('batches_write')
                      ? [{ title: t('nav.batchEntry'), path: paths.dashboard.batches.create }]
                      : []),
                    { title: t('nav.stockMovements'), path: paths.dashboard.batches.movements },
                  ],
                },
              ]
            : []),
          ...(isAdminOrGestor
            ? [
                {
                  title: t('nav.team', { defaultValue: 'Colaboradores (Acesso)' }),
                  path: paths.dashboard.team.list,
                  icon: ICONS.lock,
                },
              ]
            : []),
          {
            title: t('nav.account'),
            path: paths.dashboard.account.general,
            icon: ICONS.user,
          },
        ],
      },
    ],
    [isAdminOrGestor, perms, platformAdmin, t]
  );
}
