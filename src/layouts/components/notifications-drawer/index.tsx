import type { IconButtonProps } from '@mui/material/IconButton';

import { m } from 'framer-motion';
import { useMemo, useState, useCallback } from 'react';

import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Badge from '@mui/material/Badge';
import Drawer from '@mui/material/Drawer';
import Button from '@mui/material/Button';
import SvgIcon from '@mui/material/SvgIcon';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';
import { playLoudOrderAlertSound } from 'src/hooks/use-online-orders-monitor';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { varHover } from 'src/components/animate';
import { Scrollbar } from 'src/components/scrollbar';
import { CustomTabs } from 'src/components/custom-tabs';

import { NotificationItem } from './notification-item';

import type { NotificationItemProps } from './notification-item';

// ----------------------------------------------------------------------

export type NotificationsDrawerProps = IconButtonProps & {
  data?: NotificationItemProps[];
};

export function NotificationsDrawer({ data = [], sx, ...other }: NotificationsDrawerProps) {
  const drawer = useBoolean();
  const router = useRouter();

  const [currentTab, setCurrentTab] = useState<'all' | 'unread' | 'read'>('all');
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());

  const handleChangeTab = useCallback(
    (_event: React.SyntheticEvent, newValue: 'all' | 'unread' | 'read') => {
      setCurrentTab(newValue);
    },
    []
  );

  const notifications = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        isUnRead: item.isUnRead && !readIds.has(item.id),
      })),
    [data, readIds]
  );

  const unreadList = useMemo(
    () => notifications.filter((item) => item.isUnRead),
    [notifications]
  );
  const readList = useMemo(
    () => notifications.filter((item) => !item.isUnRead),
    [notifications]
  );

  const totalUnRead = unreadList.length;

  const displayedList = useMemo(() => {
    if (currentTab === 'unread') return unreadList;
    if (currentTab === 'read') return readList;
    return notifications;
  }, [currentTab, notifications, readList, unreadList]);

  const handleMarkAllAsRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      data.forEach((n) => next.add(n.id));
      return next;
    });
  }, [data]);

  const handleClickItem = useCallback(
    (item: NotificationItemProps) => {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      drawer.onFalse();
      if (item.href) {
        router.push(item.href);
      }
    },
    [drawer, router]
  );

  const handleViewAll = useCallback(() => {
    drawer.onFalse();
    router.push(paths.dashboard.pos.onlineOrders);
  }, [drawer, router]);

  const TABS = [
    { value: 'all', label: 'Todas', count: notifications.length },
    { value: 'unread', label: 'Não lidas', count: totalUnRead },
    { value: 'read', label: 'Lidas', count: readList.length },
  ] as const;

  const renderHead = (
    <Stack direction="row" alignItems="center" sx={{ py: 2, pl: 2.5, pr: 1, minHeight: 68 }}>
      <Typography variant="h6" sx={{ flexGrow: 1 }}>
        Notificações
      </Typography>

      {!!totalUnRead && (
        <Tooltip title="Marcar todas como lidas">
          <IconButton
            color="primary"
            onClick={handleMarkAllAsRead}
            aria-label="Marcar todas como lidas"
          >
            <Iconify icon="eva:done-all-fill" />
          </IconButton>
        </Tooltip>
      )}

      <Tooltip title="Testar alerta sonoro">
        <IconButton onClick={playLoudOrderAlertSound} aria-label="Testar alerta sonoro">
          <Iconify icon="solar:volume-loud-bold-duotone" />
        </IconButton>
      </Tooltip>

      <IconButton onClick={drawer.onFalse} aria-label="Fechar notificações">
        <Iconify icon="mingcute:close-line" />
      </IconButton>
    </Stack>
  );

  const renderTabs = (
    <CustomTabs variant="fullWidth" value={currentTab} onChange={handleChangeTab}>
      {TABS.map((tab) => (
        <Tab
          key={tab.value}
          iconPosition="end"
          value={tab.value}
          label={tab.label}
          icon={
            <Label
              variant={((tab.value === 'all' || tab.value === currentTab) && 'filled') || 'soft'}
              color={
                (tab.value === 'unread' && 'error') ||
                (tab.value === 'read' && 'success') ||
                'default'
              }
            >
              {tab.count}
            </Label>
          }
        />
      ))}
    </CustomTabs>
  );

  const renderList = (
    <Scrollbar>
      {displayedList.length === 0 ? (
        <Box sx={{ py: 8, px: 3, textAlign: 'center', color: 'text.secondary' }}>
          <Iconify
            icon="solar:bell-off-bold-duotone"
            width={44}
            sx={{ color: 'text.disabled', mb: 1.5 }}
          />
          <Typography variant="subtitle2">Nenhuma notificação por aqui</Typography>
          <Typography variant="caption" color="text.disabled">
            Novos pedidos online aparecerão automaticamente em tempo real.
          </Typography>
        </Box>
      ) : (
        <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none' }}>
          {displayedList.map((notification) => (
            <Box component="li" key={notification.id} sx={{ display: 'flex' }}>
              <NotificationItem
                notification={notification}
                onClick={() => handleClickItem(notification)}
              />
            </Box>
          ))}
        </Box>
      )}
    </Scrollbar>
  );

  return (
    <>
      <IconButton
        component={m.button}
        whileTap="tap"
        whileHover="hover"
        variants={varHover(1.05)}
        onClick={drawer.onTrue}
        aria-label="Notificações"
        sx={sx}
        {...other}
      >
        <Badge badgeContent={totalUnRead} color="error">
          <SvgIcon>
            {/* https://icon-sets.iconify.design/solar/bell-bing-bold-duotone/ */}
            <path
              fill="currentColor"
              d="M18.75 9v.704c0 .845.24 1.671.692 2.374l1.108 1.723c1.011 1.574.239 3.713-1.52 4.21a25.794 25.794 0 0 1-14.06 0c-1.759-.497-2.531-2.636-1.52-4.21l1.108-1.723a4.393 4.393 0 0 0 .693-2.374V9c0-3.866 3.022-7 6.749-7s6.75 3.134 6.75 7"
              opacity="0.5"
            />
            <path
              fill="currentColor"
              d="M12.75 6a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0zM7.243 18.545a5.002 5.002 0 0 0 9.513 0c-3.145.59-6.367.59-9.513 0"
            />
          </SvgIcon>
        </Badge>
      </IconButton>

      <Drawer
        open={drawer.value}
        onClose={drawer.onFalse}
        anchor="right"
        slotProps={{ backdrop: { invisible: true } }}
        PaperProps={{ sx: { width: 1, maxWidth: 420 } }}
      >
        {renderHead}

        {renderTabs}

        {renderList}

        <Box sx={{ p: 1.5 }}>
          <Button fullWidth size="large" variant="soft" color="primary" onClick={handleViewAll}>
            Ver todos os pedidos online
          </Button>
        </Box>
      </Drawer>
    </>
  );
}
