'use server';

import { createServiceClient } from '@/infrastructure/supabase/service';
import { menuSections as fallbackMenuSections, type MenuItem, type MenuSection } from '../data';

export async function getPublicMenu(): Promise<{ success: boolean; sections: MenuSection[]; source: 'db' | 'fallback' }> {
  try {
    const supabase = createServiceClient();
    if (!supabase) {
      return { success: true, sections: fallbackMenuSections, source: 'fallback' };
    }

    // 1. Fetch active categories
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('id, name, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    // 2. Fetch active products
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (catError || prodError || !products || products.length === 0) {
      return { success: true, sections: fallbackMenuSections, source: 'fallback' };
    }

    // Map DB products to MenuItem format
    const categoryMap = new Map<string, string>();
    if (categories && categories.length > 0) {
      for (const cat of categories) {
        categoryMap.set(cat.id, cat.name);
      }
    }

    const sectionsMap = new Map<string, MenuItem[]>();

    for (const prod of products) {
      const categoryName = (prod.category_id && categoryMap.get(prod.category_id)) || 'Specials';
      if (!sectionsMap.has(categoryName)) {
        sectionsMap.set(categoryName, []);
      }

      const item: MenuItem = {
        id: prod.id,
        name: prod.name,
        price: Number(prod.price),
        desc: prod.description || '',
        fullDesc: prod.full_description || prod.description || '',
        veg: Boolean(prod.is_vegetarian),
        popular: Boolean(prod.compare_at_price || (prod.tags && prod.tags.includes('popular')) || prod.tags?.includes('bestseller')),
        img: prod.image || '/images/Chicken Curry.jpg',
        rating: 4.8,
        category: categoryName,
        servings: prod.servings || undefined,
        pieces: prod.pieces || undefined,
        portionSize: prod.portion_size || undefined,
        includedItems: Array.isArray(prod.included_items) && prod.included_items.length > 0 ? prod.included_items : undefined,
        ingredients: Array.isArray(prod.ingredients) && prod.ingredients.length > 0 ? prod.ingredients : undefined,
        allergens: Array.isArray(prod.allergens) && prod.allergens.length > 0 ? prod.allergens : undefined,
        prepTime: prod.preparation_time ? Number(prod.preparation_time) : 15,
        deliveryTime: prod.delivery_time || '20–30 min',
        spiceLevel: prod.spice_level != null ? Number(prod.spice_level) : undefined,
        unit: prod.unit || 'piece',
        packagingBigQty: prod.packaging_big_qty != null ? Number(prod.packaging_big_qty) : 0,
        packagingSmallQty: prod.packaging_small_qty != null ? Number(prod.packaging_small_qty) : 0,
        isAvailable: prod.is_available ?? true,
      };

      sectionsMap.get(categoryName)!.push(item);
    }

    const sections: MenuSection[] = Array.from(sectionsMap.entries())
      .filter(([, items]) => items.length > 0)
      .map(([category, items]) => ({
        category,
        items,
      }));

    if (sections.length === 0) {
      return { success: true, sections: fallbackMenuSections, source: 'fallback' };
    }

    return { success: true, sections, source: 'db' };
  } catch (err) {
    console.error('Failed to load menu from DB:', err);
    return { success: true, sections: fallbackMenuSections, source: 'fallback' };
  }
}
