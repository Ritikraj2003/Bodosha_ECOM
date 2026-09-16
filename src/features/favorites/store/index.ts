'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { menuSections } from '@/features/menu/data';

export interface FavoriteItem {
  id: string;
  name: string;
  price: number;
  desc: string;
  veg: boolean;
  popular?: boolean;
  img: string;
  image?: string; // Support for FeaturedDishes variant
  packagingBigQty?: number;
  packagingSmallQty?: number;
}

const menuItemById = new Map<string, FavoriteItem>();
for (const section of menuSections) {
  for (const item of section.items) {
    menuItemById.set(item.id, { ...item });
  }
}

export function favoriteItemFromMenu(itemId: string): FavoriteItem | null {
  return menuItemById.get(itemId) ?? null;
}

export interface FavoritesStore {
  items: FavoriteItem[];
  addFavorite: (item: FavoriteItem) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  hydrateFromServer: (ids: string[]) => void;
  clear: () => void;
}

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      items: [],
      addFavorite: (item) => {
        if (!get().isFavorite(item.id)) {
          set({ items: [...get().items, item] });
        }
      },
      removeFavorite: (id) => {
        set({ items: get().items.filter((i) => i.id !== id) });
      },
      isFavorite: (id) => {
        return get().items.some((i) => i.id === id);
      },
      hydrateFromServer: (ids) => {
        const items = ids
          .map((id) => favoriteItemFromMenu(id))
          .filter((item): item is FavoriteItem => item !== null);
        set({ items });
      },
      clear: () => {
        if (get().items.length > 0) set({ items: [] });
      },
    }),
    {
      name: 'dilip-da-favorites',
    }
  )
);
