import type { NavSectionProps } from 'src/components/nav-section';

import { useMemo } from 'react';

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { CONFIG } from 'src/config-global';

import { Label } from 'src/components/label';
import { SvgColor } from 'src/components/svg-color';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const icon = (name: string) => (
  <SvgColor src={`${CONFIG.site.basePath}/assets/icons/navbar/${name}.svg`} />
);

const ICONS = {
  job: icon('ic-job'),
  blog: icon('ic-blog'),
  chat: icon('ic-chat'),
  mail: icon('ic-mail'),
  user: icon('ic-user'),
  file: icon('ic-file'),
  lock: icon('ic-lock'),
  tour: icon('ic-tour'),
  order: icon('ic-order'),
  blank: icon('ic-blank'),
  kanban: icon('ic-kanban'),
  folder: icon('ic-folder'),
  course: icon('ic-course'),
  banking: icon('ic-banking'),
  booking: icon('ic-booking'),
  invoice: icon('ic-invoice'),
  product: icon('ic-product'),
  calendar: icon('ic-calendar'),
  ecommerce: icon('ic-ecommerce'),
  analytics: icon('ic-analytics'),
  dashboard: icon('ic-dashboard'),
};

// ----------------------------------------------------------------------

export function useNavData(): NavSectionProps['data'] {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const platformAdmin = Boolean(user?.platformAdmin);

  return useMemo(
    () => [
      {
        subheader: t('nav.overview'),
        items: [
          { title: t('nav.app'), path: paths.dashboard.root, icon: ICONS.dashboard },
          ...(platformAdmin
            ? [
                {
                  title: t('nav.enterprises'),
                  path: paths.dashboard.enterprises.list,
                  icon: ICONS.banking,
                },
              ]
            : []),
          {
            title: t('nav.suppliers'),
            path: paths.dashboard.suppliers.list,
            icon: ICONS.ecommerce,
          },
          {
            title: t('nav.products'),
            path: paths.dashboard.products.list,
            icon: ICONS.product,
          },
          {
            title: t('nav.account'),
            path: paths.dashboard.account.general,
            icon: ICONS.user,
          },
        ],
      },
      {
        subheader: t('nav.legacyErp'),
        items: [
          {
            title: t('nav.administration'),
            path: paths.dashboard.sistema.empresa,
            icon: ICONS.folder,
            children: [
              { title: t('nav.company'), path: paths.dashboard.sistema.empresa },
              { title: t('nav.branches'), path: paths.dashboard.sistema.sucursal },
              { title: t('nav.users'), path: paths.dashboard.sistema.usuarios.list },
            ],
          },
          {
            title: t('nav.inventory'),
            path: paths.dashboard.inventario.productos.list,
            icon: ICONS.product,
            children: [
              { title: t('nav.legacyProducts'), path: paths.dashboard.inventario.productos.list },
            ],
          },
          {
            title: t('nav.audit'),
            path: paths.dashboard.auditoria.eventosAuditoria,
            icon: ICONS.lock,
            children: [
              { title: t('nav.events'), path: paths.dashboard.auditoria.eventosAuditoria },
            ],
          },
        ],
      },
      {
        subheader: t('nav.minimalsRef'),
        items: [
          { title: 'Ecommerce', path: paths.dashboard.general.ecommerce, icon: ICONS.ecommerce },
          { title: 'Analytics', path: paths.dashboard.general.analytics, icon: ICONS.analytics },
          { title: 'Banking', path: paths.dashboard.general.banking, icon: ICONS.banking },
          { title: 'Booking', path: paths.dashboard.general.booking, icon: ICONS.booking },
          { title: 'File', path: paths.dashboard.general.file, icon: ICONS.file },
          { title: 'Course', path: paths.dashboard.general.course, icon: ICONS.course },
          {
            title: 'User',
            path: paths.dashboard.user.root,
            icon: ICONS.user,
            children: [
              { title: 'Profile', path: paths.dashboard.user.root },
              { title: 'Cards', path: paths.dashboard.user.cards },
              { title: 'List', path: paths.dashboard.user.list },
              { title: 'Create', path: paths.dashboard.user.new },
              { title: 'Edit', path: paths.dashboard.user.demo.edit },
              { title: 'Account', path: paths.dashboard.user.account },
            ],
          },
          {
            title: 'Product (shop)',
            path: paths.dashboard.product.root,
            icon: ICONS.product,
            children: [
              { title: 'List', path: paths.dashboard.product.root },
              { title: 'Details', path: paths.dashboard.product.demo.details },
              { title: 'Create', path: paths.dashboard.product.new },
              { title: 'Edit', path: paths.dashboard.product.demo.edit },
            ],
          },
          {
            title: 'Order',
            path: paths.dashboard.order.root,
            icon: ICONS.order,
            children: [
              { title: 'List', path: paths.dashboard.order.root },
              { title: 'Details', path: paths.dashboard.order.demo.details },
            ],
          },
          {
            title: 'Invoice',
            path: paths.dashboard.invoice.root,
            icon: ICONS.invoice,
            children: [
              { title: 'List', path: paths.dashboard.invoice.root },
              { title: 'Details', path: paths.dashboard.invoice.demo.details },
              { title: 'Create', path: paths.dashboard.invoice.new },
              { title: 'Edit', path: paths.dashboard.invoice.demo.edit },
            ],
          },
          {
            title: 'Blog',
            path: paths.dashboard.post.root,
            icon: ICONS.blog,
            children: [
              { title: 'List', path: paths.dashboard.post.root },
              { title: 'Details', path: paths.dashboard.post.demo.details },
              { title: 'Create', path: paths.dashboard.post.new },
              { title: 'Edit', path: paths.dashboard.post.demo.edit },
            ],
          },
          {
            title: 'Job',
            path: paths.dashboard.job.root,
            icon: ICONS.job,
            children: [
              { title: 'List', path: paths.dashboard.job.root },
              { title: 'Details', path: paths.dashboard.job.demo.details },
              { title: 'Create', path: paths.dashboard.job.new },
              { title: 'Edit', path: paths.dashboard.job.demo.edit },
            ],
          },
          {
            title: 'Tour',
            path: paths.dashboard.tour.root,
            icon: ICONS.tour,
            children: [
              { title: 'List', path: paths.dashboard.tour.root },
              { title: 'Details', path: paths.dashboard.tour.demo.details },
              { title: 'Create', path: paths.dashboard.tour.new },
              { title: 'Edit', path: paths.dashboard.tour.demo.edit },
            ],
          },
          { title: 'File manager', path: paths.dashboard.fileManager, icon: ICONS.folder },
          {
            title: 'Mail',
            path: paths.dashboard.mail,
            icon: ICONS.mail,
            info: (
              <Label color="error" variant="inverted">
                +32
              </Label>
            ),
          },
          { title: 'Chat', path: paths.dashboard.chat, icon: ICONS.chat },
          { title: 'Calendar', path: paths.dashboard.calendar, icon: ICONS.calendar },
          { title: 'Kanban', path: paths.dashboard.kanban, icon: ICONS.kanban },
          { title: 'Permission', path: paths.dashboard.permission, icon: ICONS.lock },
          { title: 'Blank', path: paths.dashboard.blank, icon: ICONS.blank },
        ],
      },
    ],
    [platformAdmin, t]
  );
}
