'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { menuSections as fallbackSections, type MenuItem, type MenuSection } from '../data';

import { useCartStore } from '@/features/cart/store';

interface MenuContextValue {
  sections: MenuSection[];
  allItems: MenuItem[];
  loading: boolean;
  source: 'db' | 'fallback';
}

const MenuContext = createContext<MenuContextValue | null>(null);

/**
 * Provides the menu to every consuming component. Initialized with the menu
 * the server already rendered (no fallback flash), then kept fresh by a
 * background refetch of /api/menu.
 */
export function MenuProvider({
  initialSections,
  initialSource,
  children,
}: {
  initialSections?: MenuSection[];
  initialSource?: 'db' | 'fallback';
  children: ReactNode;
}) {
  const [sections, setSections] = useState<MenuSection[]>(
    initialSections && initialSections.length > 0 ? initialSections : fallbackSections
  );
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'db' | 'fallback'>(initialSource ?? 'fallback');

  useEffect(() => {
    if (initialSections && initialSections.length > 0) {
      const items = initialSections.flatMap((s) => s.items);
      useCartStore.getState().syncPrices(items);
    }
  }, [initialSections]);

  useEffect(() => {
    let active = true;

    async function fetchMenu() {
      try {
        const res = await fetch('/api/menu', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store' },
        });
        if (res.ok) {
          const data = await res.json();
          if (active && data.success && data.sections && data.sections.length > 0) {
            setSections(data.sections);
            setSource(data.source);
            const freshItems = data.sections.flatMap((s: MenuSection) => s.items);
            useCartStore.getState().syncPrices(freshItems);
          }
        }
      } catch (err) {
        console.error('Error fetching dynamic menu:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchMenu();

    return () => {
      active = false;
    };
  }, []);

  const allItems = sections.flatMap((s) => s.items);

  return (
    <MenuContext.Provider value={{ sections, allItems, loading, source }}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (ctx) return ctx;
  return {
    sections: fallbackSections,
    allItems: fallbackSections.flatMap((s) => s.items),
    loading: false,
    source: 'fallback',
  };
}