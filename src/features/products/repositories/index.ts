import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { createServiceClient } from '@/infrastructure/supabase/service';
import type { Product, ProductFormData, Category, CategoryFormData, ProductsFilter } from '../types';

const BASE_PRODUCT_COLUMNS = 'id, restaurant_id, category_id, name, slug, description, price, compare_at_price, cost_per_unit, unit, is_vegetarian, is_vegan, is_gluten_free, spice_level, preparation_time, image, is_active, is_available, stock_quantity, track_inventory, sort_order, tags, created_at, updated_at, deleted_at';

const FULL_PRODUCT_COLUMNS = 'id, restaurant_id, category_id, name, slug, description, full_description, price, compare_at_price, cost_per_unit, unit, servings, pieces, portion_size, included_items, ingredients, allergens, delivery_time, is_vegetarian, is_vegan, is_gluten_free, spice_level, preparation_time, image, is_active, is_available, stock_quantity, track_inventory, packaging_big_qty, packaging_small_qty, sort_order, tags, created_at, updated_at, deleted_at';

const CATEGORY_COLUMNS = 'id, restaurant_id, name, slug, description, display_order, is_active, created_at, updated_at';

export class ProductRepository {
  async findByRestaurant(restaurantId: string, filter: ProductsFilter = {}): Promise<Product[]> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return [];
    
    let query = supabase
      .from('products')
      .select(FULL_PRODUCT_COLUMNS)
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (filter.deletedOnly) {
      query = query.not('deleted_at', 'is', null);
    } else if (!filter.includeDeleted) {
      query = query.is('deleted_at', null);
    }
    if (filter.category_id) query = query.eq('category_id', filter.category_id);
    if (filter.is_active !== undefined) query = query.eq('is_active', filter.is_active);
    if (filter.is_available !== undefined) query = query.eq('is_available', filter.is_available);
    if (filter.search) query = query.or(`name.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
    if (filter.low_stock) query = query.gt('stock_quantity', 0).lte('stock_quantity', 5);
    if (filter.pageSize) {
      const from = ((filter.page ?? 1) - 1) * filter.pageSize;
      query = query.range(from, from + filter.pageSize - 1);
    }

    const { data, error } = await query;
    if (error && String(error.message).toLowerCase().includes('column')) {
      // Fall back if newer columns are missing from DB
      let fallbackQuery = supabase
        .from('products')
        .select(BASE_PRODUCT_COLUMNS)
        .eq('restaurant_id', restaurantId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (filter.deletedOnly) {
        fallbackQuery = fallbackQuery.not('deleted_at', 'is', null);
      } else if (!filter.includeDeleted) {
        fallbackQuery = fallbackQuery.is('deleted_at', null);
      }
      if (filter.category_id) fallbackQuery = fallbackQuery.eq('category_id', filter.category_id);
      if (filter.is_active !== undefined) fallbackQuery = fallbackQuery.eq('is_active', filter.is_active);
      if (filter.is_available !== undefined) fallbackQuery = fallbackQuery.eq('is_available', filter.is_available);
      if (filter.search) fallbackQuery = fallbackQuery.or(`name.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
      if (filter.low_stock) fallbackQuery = fallbackQuery.gt('stock_quantity', 0).lte('stock_quantity', 5);
      if (filter.pageSize) {
        const from = ((filter.page ?? 1) - 1) * filter.pageSize;
        fallbackQuery = fallbackQuery.range(from, from + filter.pageSize - 1);
      }
      const { data: fallbackData } = await fallbackQuery;
      return (fallbackData ?? []) as Product[];
    }
    return (data ?? []) as Product[];
  }

  async findById(id: string, includeDeleted = false): Promise<Product | null> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return null;
    let query = supabase
      .from('products')
      .select(FULL_PRODUCT_COLUMNS)
      .eq('id', id);
    if (!includeDeleted) query = query.is('deleted_at', null);
    const { data, error } = await query.maybeSingle();
    if (error && String(error.message).toLowerCase().includes('column')) {
      const { data: fallback } = await supabase
        .from('products')
        .select(BASE_PRODUCT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      return fallback as Product | null;
    }
    return data as Product | null;
  }

  async create(restaurantId: string, data: ProductFormData): Promise<Product | null> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return null;
    const slugBase = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
    const insertPayload: Record<string, unknown> = {
      restaurant_id: restaurantId,
      name: data.name,
      slug: `${slugBase}-${Date.now().toString(36)}`,
      description: data.description ?? null,
      full_description: data.full_description ?? null,
      price: data.price,
      compare_at_price: data.compare_at_price ?? null,
      cost_per_unit: data.cost_per_unit ?? null,
      unit: data.unit ?? 'piece',
      servings: data.servings ?? null,
      pieces: data.pieces ?? null,
      portion_size: data.portion_size ?? null,
      included_items: data.included_items ?? [],
      ingredients: data.ingredients ?? [],
      allergens: data.allergens ?? [],
      delivery_time: data.delivery_time ?? null,
      category_id: data.category_id ?? null,
      is_vegetarian: data.is_vegetarian ?? false,
      is_vegan: data.is_vegan ?? false,
      is_gluten_free: data.is_gluten_free ?? false,
      spice_level: data.spice_level ?? 0,
      preparation_time: data.preparation_time ?? 10,
      image: data.image ?? null,
      stock_quantity: data.stock_quantity ?? 0,
      track_inventory: data.track_inventory ?? false,
      packaging_big_qty: data.packaging_big_qty ?? 0,
      packaging_small_qty: data.packaging_small_qty ?? 0,
      is_available: data.is_available ?? true,
      is_active: data.is_active ?? true,
      tags: data.tags ?? null,
    };
    let product: Product | null = null;
    const { data: insertedProduct, error } = await supabase
      .from('products')
      .insert(insertPayload)
      .select(FULL_PRODUCT_COLUMNS)
      .single();

    if (error && String(error.message).toLowerCase().includes('column')) {
      delete insertPayload.full_description;
      delete insertPayload.servings;
      delete insertPayload.pieces;
      delete insertPayload.portion_size;
      delete insertPayload.included_items;
      delete insertPayload.ingredients;
      delete insertPayload.allergens;
      delete insertPayload.delivery_time;
      delete insertPayload.packaging_big_qty;
      delete insertPayload.packaging_small_qty;

      const fallbackRes = await supabase
        .from('products')
        .insert(insertPayload)
        .select(BASE_PRODUCT_COLUMNS)
        .single();
      product = fallbackRes.data as unknown as Product | null;
      if (fallbackRes.error) {
        console.error('Product insert fallback error:', fallbackRes.error);
      }
    } else if (error) {
      console.error('Product insert error:', error);
    } else {
      product = insertedProduct as unknown as Product | null;
    }
    return product;
  }

  async update(id: string, restaurantId: string, data: Partial<ProductFormData>): Promise<Product | null> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return null;
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) { updateData.name = data.name; updateData.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36); }
    if (data.description !== undefined) updateData.description = data.description;
    if (data.full_description !== undefined) updateData.full_description = data.full_description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.compare_at_price !== undefined) updateData.compare_at_price = data.compare_at_price;
    if (data.cost_per_unit !== undefined) updateData.cost_per_unit = data.cost_per_unit;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.servings !== undefined) updateData.servings = data.servings;
    if (data.pieces !== undefined) updateData.pieces = data.pieces;
    if (data.portion_size !== undefined) updateData.portion_size = data.portion_size;
    if (data.included_items !== undefined) updateData.included_items = data.included_items;
    if (data.ingredients !== undefined) updateData.ingredients = data.ingredients;
    if (data.allergens !== undefined) updateData.allergens = data.allergens;
    if (data.delivery_time !== undefined) updateData.delivery_time = data.delivery_time;
    if (data.category_id !== undefined) updateData.category_id = data.category_id;
    if (data.is_vegetarian !== undefined) updateData.is_vegetarian = data.is_vegetarian;
    if (data.is_vegan !== undefined) updateData.is_vegan = data.is_vegan;
    if (data.is_gluten_free !== undefined) updateData.is_gluten_free = data.is_gluten_free;
    if (data.spice_level !== undefined) updateData.spice_level = data.spice_level;
    if (data.preparation_time !== undefined) updateData.preparation_time = data.preparation_time;
    if (data.image !== undefined) updateData.image = data.image;
    if (data.stock_quantity !== undefined) updateData.stock_quantity = data.stock_quantity;
    if (data.track_inventory !== undefined) updateData.track_inventory = data.track_inventory;
    if (data.packaging_big_qty !== undefined) updateData.packaging_big_qty = data.packaging_big_qty;
    if (data.packaging_small_qty !== undefined) updateData.packaging_small_qty = data.packaging_small_qty;
    if (data.is_available !== undefined) updateData.is_available = data.is_available;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.tags !== undefined) updateData.tags = data.tags;
    updateData.updated_at = new Date().toISOString();

    let product: Product | null = null;
    let query = supabase.from('products').update(updateData).eq('id', id);
    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }
    const { data: updatedProduct, error } = await query
      .select(FULL_PRODUCT_COLUMNS)
      .single();

    if (error && String(error.message).toLowerCase().includes('column')) {
      delete updateData.full_description;
      delete updateData.servings;
      delete updateData.pieces;
      delete updateData.portion_size;
      delete updateData.included_items;
      delete updateData.ingredients;
      delete updateData.allergens;
      delete updateData.delivery_time;
      delete updateData.packaging_big_qty;
      delete updateData.packaging_small_qty;

      let fallbackQuery = supabase.from('products').update(updateData).eq('id', id);
      if (restaurantId) {
        fallbackQuery = fallbackQuery.eq('restaurant_id', restaurantId);
      }
      const fallbackRes = await fallbackQuery
        .select(BASE_PRODUCT_COLUMNS)
        .single();
      product = fallbackRes.data as unknown as Product | null;
      if (fallbackRes.error) {
        console.error('Product update fallback error:', fallbackRes.error);
      }
    } else if (error) {
      console.error('Product update error:', error);
    } else {
      product = updatedProduct as unknown as Product | null;
    }
    return product;
  }

  async softDelete(id: string, restaurantId: string): Promise<boolean> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return false;
    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    return !error;
  }

  async restore(id: string, restaurantId: string): Promise<boolean> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return false;
    const { error } = await supabase
      .from('products')
      .update({ deleted_at: null, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    return !error;
  }

  async hasOrderHistory(id: string): Promise<boolean> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return false;
    const { data: refs, error } = await supabase.from('order_items').select('id').eq('product_id', id).limit(1);
    if (error) {
      console.error('Order history check error:', error);
    }
    return !!refs && refs.length > 0;
  }

  async hardDelete(id: string, restaurantId: string): Promise<boolean> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return false;
    const { data: refs } = await supabase.from('order_items').select('id').eq('product_id', id).limit(1);
    if (refs && refs.length > 0) return false;
    const { error } = await supabase.from('products').delete().eq('id', id).eq('restaurant_id', restaurantId);
    return !error;
  }

  async updateStock(id: string, restaurantId: string, quantity: number): Promise<Product | null> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return null;
    const { data } = await supabase
      .from('products')
      .update({ stock_quantity: quantity, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select(BASE_PRODUCT_COLUMNS)
      .single();
    return data as Product | null;
  }
}

export class CategoryRepository {
  async findByRestaurant(restaurantId: string, includeInactive = false): Promise<Category[]> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return [];
    let query = supabase
      .from('categories')
      .select(CATEGORY_COLUMNS)
      .eq('restaurant_id', restaurantId)
      .order('display_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    const { data } = await query;
    return (data ?? []).map((c) => ({ ...c, product_count: 0 }));
  }

  async findById(id: string): Promise<Category | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.from('categories').select(CATEGORY_COLUMNS).eq('id', id).maybeSingle();
    return data as Category | null;
  }

  async create(restaurantId: string, data: CategoryFormData): Promise<Category | null> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return null;
    const { count } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId);
    const slugBase = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cat';
    const slug = `${slugBase}-${Date.now().toString(36)}`;
    const { data: category, error } = await supabase
      .from('categories')
      .insert({
        restaurant_id: restaurantId,
        name: data.name,
        slug,
        description: data.description ?? null,
        display_order: data.display_order ?? (count ?? 0) + 1,
        is_active: data.is_active ?? true,
      })
      .select(CATEGORY_COLUMNS)
      .single();
    if (error) {
      console.error('Category insert error:', error);
    }
    return category as Category | null;
  }

  async update(id: string, restaurantId: string, data: Partial<CategoryFormData>): Promise<Category | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) { updateData.name = data.name; updateData.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
    if (data.description !== undefined) updateData.description = data.description;
    if (data.display_order !== undefined) updateData.display_order = data.display_order;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    const { data: category } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select(CATEGORY_COLUMNS)
      .single();
    return category as Category | null;
  }

  async delete(id: string, restaurantId: string): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return false;
    await supabase.from('products').update({ category_id: null }).eq('category_id', id).eq('restaurant_id', restaurantId);
    const { error } = await supabase.from('categories').delete().eq('id', id).eq('restaurant_id', restaurantId);
    return !error;
  }

  async reorder(ids: string[]): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return false;
    const updates = ids.map((id, i) => supabase.from('categories').update({ display_order: i + 1 }).eq('id', id));
    const results = await Promise.all(updates);
    return results.every((r) => !r.error);
  }
}

export const productRepository = new ProductRepository();
export const categoryRepository = new CategoryRepository();
