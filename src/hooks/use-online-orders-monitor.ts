import type { OnlineOrder } from 'src/api/firestore/online-orders';
import type { NotificationItemProps } from 'src/layouts/components/notifications-drawer/notification-item';

import { useRef, useMemo, useState, useEffect } from 'react';

import { paths } from 'src/routes/paths';

import { fCurrency } from 'src/utils/format-number';

import { getEffectivePermissions } from 'src/api/firestore/members';
import { subscribeOnlineOrders } from 'src/api/firestore/online-orders';

import { toast } from 'src/components/snackbar';

import { getFulfillmentLabel } from 'src/sections/public-store/order-progress-stepper';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Alerta sonoro alto e nítido (campainha dupla ascendente de 3 notas)
 * para notificar imediatamente o admin/colaborador sobre novos pedidos online.
 */
export function playLoudOrderAlertSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [880, 1174.66, 1318.51]; // A5 -> D6 -> E6
    const repeats = [0, 0.55];

    repeats.forEach((repeatOffset) => {
      notes.forEach((freq, idx) => {
        const start = now + repeatOffset + idx * 0.12;
        const duration = idx === notes.length - 1 ? 0.28 : 0.14;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.65, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + duration + 0.02);
      });
    });
  } catch {
    // ignore browser autoplay restrictions until first user interaction
  }
}

// ----------------------------------------------------------------------

export function useOnlineOrdersMonitor() {
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const perms = useMemo(
    () => getEffectivePermissions(user?.role, user?.permissions as string[] | undefined),
    [user?.permissions, user?.role]
  );

  const canMonitor = Boolean(
    enterpriseId &&
      (user?.platformAdmin || user?.role === 'admin' || user?.role === 'gestor' || perms.has('pos'))
  );

  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const seenPendingRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  // Desbloqueia o AudioContext na primeira interação do usuário na página
  useEffect(() => {
    const unlock = () => {
      getAudioContext();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!canMonitor || !enterpriseId) {
      setOrders([]);
      return undefined;
    }

    primedRef.current = false;
    seenPendingRef.current = new Set();

    const unsub = subscribeOnlineOrders(enterpriseId, (next) => {
      setOrders(next);
      const alertableOrders = next.filter(
        (o) =>
          o.status === 'pending' ||
          (o.deliveryType === 'table' && o.fulfillmentStatus === 'preparing')
      );

      if (!primedRef.current) {
        alertableOrders.forEach((o) => seenPendingRef.current.add(o.id));
        primedRef.current = true;
        return;
      }

      const fresh = alertableOrders.filter((o) => !seenPendingRef.current.has(o.id));
      if (fresh.length > 0) {
        fresh.forEach((o) => seenPendingRef.current.add(o.id));
        playLoudOrderAlertSound();

        const newest = fresh[0];
        const prefix =
          newest.deliveryType === 'table'
            ? `Novo pedido na Mesa ${newest.tableNumber || ''} (${newest.code})`.trim()
            : `Novo pedido online ${newest.code}`;
        toast.info(`${prefix} — ${newest.customerName} (${fCurrency(newest.total)})`, {
          duration: 8000,
        });
      }
    });

    return unsub;
  }, [canMonitor, enterpriseId]);

  // Pedidos pendentes ou em atendimento (ainda não finalizados nem recusados)
  const activeOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === 'pending' ||
          (o.status === 'accepted' && o.fulfillmentStatus !== 'delivered')
      ),
    [orders]
  );

  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === 'pending').length,
    [orders]
  );

  const activeCount = activeOrders.length;

  const notifications: NotificationItemProps[] = useMemo(
    () =>
      orders.slice(0, 25).map((order) => {
        const badge = getFulfillmentLabel(order.fulfillmentStatus, order.deliveryType);
        const isActive =
          order.status === 'pending' ||
          (order.status === 'accepted' && order.fulfillmentStatus !== 'delivered');
        const modeText =
          order.deliveryType === 'delivery'
            ? 'Entrega'
            : order.deliveryType === 'table'
              ? `Mesa ${order.tableNumber || ''}`.trim()
              : 'Retirada';

        return {
          id: order.id,
          type: order.deliveryType === 'delivery' ? 'delivery' : 'order',
          title: `<p><strong>${order.code}</strong> • ${order.customerName} — <strong>${fCurrency(order.total)}</strong></p>`,
          category: `${badge.label} · ${modeText}`,
          isUnRead: isActive,
          avatarUrl: null,
          createdAt: order.createdAt || null,
          href: paths.dashboard.pos.onlineOrders,
        };
      }),
    [orders]
  );

  return {
    orders,
    activeOrders,
    pendingCount,
    activeCount,
    notifications,
  };
}
