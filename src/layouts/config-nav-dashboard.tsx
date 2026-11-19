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

type NavItem = NavSectionProps['data'][number]['items'][number];

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

  return useMemo(() => {
    const overviewItems: NavItem[] = [
      ...(perms.has('dre') || isAdminOrGestor
        ? [{ title: t('nav.app'), path: paths.dashboard.root, icon: ICONS.dashboard }]
        : []),
    ];

    const managementItems: NavItem[] = [
      ...(perms.has('pos')
        ? [
            {
              title: t('nav.pos'),
              // root path keeps parent active on /pos/sales/:id (deep match)
              path: paths.dashboard.pos.root,
              icon: ICONS.invoice,
              children: [
                { title: t('nav.posCheckout'), path: paths.dashboard.pos.checkout },
                { title: t('nav.salesHistory'), path: paths.dashboard.pos.sales },
                {
                  title: t('nav.onlineOrders', { defaultValue: 'Pedidos online' }),
                  path: paths.dashboard.pos.onlineOrders,
                },
              ],
            },
          ]
        : []),
      ...(perms.has('customers')
        ? [
            {
              title: t('nav.customers', { defaultValue: 'Clientes' }),
              path: paths.dashboard.customers.root,
              icon: ICONS.user,
              children: [
                {
                  title: t('nav.customersList', { defaultValue: 'Lista' }),
                  path: paths.dashboard.customers.list,
                },
                {
                  title: t('nav.customersCreate', { defaultValue: 'Novo cliente' }),
                  path: paths.dashboard.customers.create,
                },
              ],
            },
          ]
        : []),
      ...(perms.has('products')
        ? [
            {
              title: t('nav.products'),
              path: paths.dashboard.products.root,
              icon: ICONS.product,
              children: [
                {
                  title: t('nav.productsList', { defaultValue: 'Lista' }),
                  path: paths.dashboard.products.list,
                },
                {
                  title: t('nav.productsCreate', { defaultValue: 'Novo produto' }),
                  path: paths.dashboard.products.create,
                },
              ],
            },
          ]
        : []),
      ...(perms.has('suppliers')
        ? [
            {
              title: t('nav.suppliers'),
              path: paths.dashboard.suppliers.root,
              icon: ICONS.ecommerce,
              children: [
                {
                  title: t('nav.suppliersList', { defaultValue: 'Lista' }),
                  path: paths.dashboard.suppliers.list,
                },
                {
                  title: t('nav.suppliersCreate', { defaultValue: 'Novo fornecedor' }),
                  path: paths.dashboard.suppliers.create,
                },
              ],
            },
          ]
        : []),
      ...(perms.has('processing')
        ? [
            {
              title: t('nav.processing'),
              path: paths.dashboard.processing.root,
              icon: ICONS.kanban,
              children: [
                {
                  title: t('nav.processingList', { defaultValue: 'Ordens' }),
                  path: paths.dashboard.processing.list,
                },
                {
                  title: t('nav.processingCreate', { defaultValue: 'Nova ordem' }),
                  path: paths.dashboard.processing.create,
                },
              ],
            },
          ]
        : []),
      ...(perms.has('batches_read') || perms.has('batches_write')
        ? [
            {
              title: t('nav.batches'),
              // MUST be root (/batches), not /batches/list — otherwise create/movements
              // do not keep the parent highlighted (useActiveLink deep includes).
              path: paths.dashboard.batches.root,
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
    ];

    const financeItems: NavItem[] = [
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
    ];

    const adminItems: NavItem[] = [
      ...(platformAdmin
        ? [
            {
              title: t('nav.enterprises'),
              path: paths.dashboard.enterprises.root,
              icon: ICONS.banking,
              children: [
                {
                  title: t('nav.enterprisesList', { defaultValue: 'Lista' }),
                  path: paths.dashboard.enterprises.list,
                },
                {
                  title: t('nav.enterprisesCreate', { defaultValue: 'Nova empresa' }),
                  path: paths.dashboard.enterprises.create,
                },
              ],
            },
            {
              title: t('nav.plans', { defaultValue: 'Planos' }),
              path: paths.dashboard.plans.root,
              icon: ICONS.invoice,
              children: [
                {
                  title: t('nav.plansList', { defaultValue: 'Lista' }),
                  path: paths.dashboard.plans.list,
                },
                {
                  title: t('nav.plansCreate', { defaultValue: 'Novo plano' }),
                  path: paths.dashboard.plans.create,
                },
              ],
            },
            {
              title: t('nav.billingSettings', { defaultValue: 'Cobrança Asaas' }),
              path: paths.dashboard.billingSettings,
              icon: ICONS.banking,
            },
          ]
        : []),
      ...(isAdminOrGestor
        ? [
            {
              title: t('nav.team', { defaultValue: 'Colaboradores (Acesso)' }),
              path: paths.dashboard.team.root,
              icon: ICONS.lock,
              children: [
                {
                  title: t('nav.teamList', { defaultValue: 'Lista' }),
                  path: paths.dashboard.team.list,
                },
              ],
            },
          ]
        : []),
      {
        title: t('nav.account'),
        path: paths.dashboard.account.root,
        icon: ICONS.user,
        children: [
          {
            title: t('nav.accountGeneral', { defaultValue: 'Geral' }),
            path: paths.dashboard.account.general,
          },
          {
            title: t('nav.accountPassword', { defaultValue: 'Alterar senha' }),
            path: paths.dashboard.account.changePassword,
          },
          ...(user?.enterpriseId
            ? [
                {
                  title: t('nav.accountCompany', { defaultValue: 'Empresa' }),
                  path: paths.dashboard.account.company,
                },
                {
                  title: t('nav.accountFiscal', { defaultValue: 'Fiscal' }),
                  path: paths.dashboard.account.fiscal,
                },
                {
                  title: t('nav.accountOnlineStore', { defaultValue: 'Loja online' }),
                  path: paths.dashboard.account.onlineStore,
                },
              ]
            : []),
          ...(user?.role === 'admin'
            ? [
                {
                  title: t('nav.accountBilling', { defaultValue: 'Assinatura' }),
                  path: paths.dashboard.account.billing,
                },
              ]
            : []),
        ],
      },
    ];

    return [
      { subheader: t('nav.overview'), items: overviewItems },
      { subheader: t('nav.management'), items: managementItems },
      {
        subheader: t('nav.finance', { defaultValue: 'Financeiro' }),
        items: financeItems,
      },
      { subheader: t('nav.administration'), items: adminItems },
    ].filter((section) => section.items.length > 0);
  }, [isAdminOrGestor, perms, platformAdmin, t, user?.enterpriseId, user?.role]);
}
