'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { getUserOrders } from '@/features/orders/actions/customer';
import type { Order } from '@/features/orders/types';
import { menuSections } from '@/features/menu/data';
import type { MenuItem } from '@/features/menu/data';

const allMenuItems = menuSections.flatMap((s) => s.items);

export function matchMenuItem(name: string | undefined): MenuItem | undefined {
  if (!name) return undefined;
  const q = name.toLowerCase();
  return allMenuItems.find((i) => q.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(q));
}

export function useHomeOrders() {
  const { isAuthenticated } = useAuthStore();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getUserOrders(1, 20).then((res) => {
      if (!cancelled && res.success && res.data) setOrders(res.data.orders);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return { orders };
}
