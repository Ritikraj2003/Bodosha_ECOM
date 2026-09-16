'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { useFavoritesStore } from '@/features/favorites/store';
import { getUserFavoriteIds } from '@/features/favorites/actions';

export default function FavoritesSync() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      loadedUserId.current = null;
      useFavoritesStore.getState().clear();
      return;
    }
    if (loadedUserId.current === user.id) return;
    loadedUserId.current = user.id;
    useFavoritesStore.getState().clear();
    getUserFavoriteIds().then((res) => {
      if (res.success && res.data) {
        useFavoritesStore.getState().hydrateFromServer(res.data);
      }
    });
  }, [isAuthenticated, user]);

  return null;
}
