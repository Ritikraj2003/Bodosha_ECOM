import { query } from '@/infrastructure/db';
import type { Product, ProductFormData, Category, CategoryFormData, ProductsFilter } from '../types';

export function mapProductRow(r: any): Product {
  return {
    id: r.id,
    restaurant_id: r.restaurant_id,
    category_id: r.category_id || null,
    name: r.name,
    slug: r.slug,
    description: r.description || null,
    full_description: r.full_description || null,
    price: Number(r.price) || 0,
    compare_at_price: r.compare_at_price ? Number(r.compare_at_price) : (r.compare_price ? Number(r.compare_price) : null),
    cost_per_unit: r.cost_per_unit ? Number(r.cost_per_unit) : (r.cost_price ? Number(r.cost_price) : null),
    unit: r.unit || 'piece',
    servings: r.servings || null,
    pieces: r.pieces || null,
    portion_size: r.portion_size || null,
    included_items: r.included_items || null,
    ingredients: r.ingredients || null,
    allergens: r.allergens || null,
    delivery_time: r.delivery_time || null,
    is_vegetarian: Boolean(r.is_vegetarian ?? r.is_veg ?? true),
    is_vegan: Boolean(r.is_vegan ?? false),
    is_gluten_free: Boolean(r.is_gluten_free ?? false),
    spice_level: Number(r.spice_level) || 0,
    preparation_time: Number(r.preparation_time) || 15,
    image: r.image || r.image_url || null,
    is_active: Boolean(r.is_active ?? true),
    is_available: Boolean(r.is_available ?? true),
    stock_quantity: Number(r.stock_quantity) || 0,
    track_inventory: Boolean(r.track_inventory ?? false),
    packaging_big_qty: Number(r.packaging_big_qty) || 0,
    packaging_small_qty: Number(r.packaging_small_qty) || 0,
    sort_order: Number(r.sort_order) || 0,
    tags: r.tags || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at || null,
  };
}

export function mapCategoryRow(r: any): Category {
  return {
    id: r.id,
    restaurant_id: r.restaurant_id,
    name: r.name,
    slug: r.slug,
    description: r.description || null,
    display_order: Number(r.display_order) || 0,
    is_active: Boolean(r.is_active ?? true),
    created_at: r.created_at,
    updated_at: r.updated_at,
    product_count: Number(r.product_count) || 0,
  };
}

export class ProductRepository {
  async findByRestaurant(restaurantId: string, filter: ProductsFilter = {}): Promise<Product[]> {
    const conditions: string[] = ['restaurant_id = $1'];
    const params: any[] = [restaurantId];
    let paramIdx = 2;

    if (filter.deletedOnly) {
      conditions.push('deleted_at IS NOT NULL');
    } else if (!filter.includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (filter.category_id) {
      conditions.push(`category_id = $${paramIdx++}`);
      params.push(filter.category_id);
    }

    if (filter.is_active !== undefined) {
      conditions.push(`is_active = $${paramIdx++}`);
      params.push(filter.is_active);
    }

    if (filter.is_available !== undefined) {
      conditions.push(`is_available = $${paramIdx++}`);
      params.push(filter.is_available);
    }

    if (filter.search) {
      conditions.push(`(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`);
      params.push(`%${filter.search}%`);
      paramIdx++;
    }

    if (filter.low_stock) {
      conditions.push('stock_quantity > 0 AND stock_quantity <= 5');
    }

    let queryStr = `
      SELECT * FROM public.products
      WHERE ${conditions.join(' AND ')}
      ORDER BY sort_order ASC, name ASC
    `;

    if (filter.pageSize) {
      const offset = ((filter.page ?? 1) - 1) * filter.pageSize;
      queryStr += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
      params.push(filter.pageSize, offset);
    }

    try {
      const res = await query(queryStr, params);
      return res.rows.map(mapProductRow);
    } catch (e) {
      console.error('findByRestaurant error:', e);
      return [];
    }
  }

  async findById(id: string, includeDeleted = false): Promise<Product | null> {
    const conditions = ['id = $1'];
    if (!includeDeleted) conditions.push('deleted_at IS NULL');

    try {
      const res = await query(
        `SELECT * FROM public.products WHERE ${conditions.join(' AND ')} LIMIT 1`,
        [id]
      );
      if (res.rows.length === 0) return null;
      return mapProductRow(res.rows[0]);
    } catch (e) {
      console.error('findById error:', e);
      return null;
    }
  }

  async create(restaurantId: string, data: ProductFormData): Promise<Product | null> {
    try {
      const slugBase = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
      const slug = `${slugBase}-${Date.now().toString(36)}`;
      const price = Number(data.price) || 0;
      const comparePrice = data.compare_at_price ? Number(data.compare_at_price) : null;
      const costPrice = data.cost_per_unit ? Number(data.cost_per_unit) : null;
      const isVeg = Boolean(data.is_vegetarian ?? true);

      const res = await query(`
        INSERT INTO public.products (
          restaurant_id, category_id, name, slug, description, full_description,
          price, compare_at_price, cost_per_unit, unit,
          servings, pieces, portion_size, included_items, ingredients, allergens, delivery_time,
          is_vegetarian, is_vegan, is_gluten_free, spice_level, preparation_time,
          image, image_url, is_active, is_available, stock_quantity, track_inventory,
          packaging_big_qty, packaging_small_qty, tags,
          is_veg, compare_price, cost_price, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, $23, $24, $25, $26, $27,
          $28, $29, $30,
          $18, $8, $9, NOW(), NOW()
        )
        RETURNING *;
      `, [
        restaurantId,
        data.category_id || null,
        data.name.trim(),
        slug,
        data.description?.trim() || null,
        data.full_description?.trim() || null,
        price,
        comparePrice,
        costPrice,
        data.unit || 'piece',
        data.servings || null,
        data.pieces || null,
        data.portion_size || null,
        data.included_items || null,
        data.ingredients || null,
        data.allergens || null,
        data.delivery_time || null,
        isVeg,
        Boolean(data.is_vegan),
        Boolean(data.is_gluten_free),
        Number(data.spice_level) || 0,
        Number(data.preparation_time) || 15,
        data.image || null,
        data.is_active !== undefined ? Boolean(data.is_active) : true,
        data.is_available !== undefined ? Boolean(data.is_available) : true,
        Number(data.stock_quantity) || 0,
        Boolean(data.track_inventory),
        Number(data.packaging_big_qty) || 0,
        Number(data.packaging_small_qty) || 0,
        data.tags || null,
      ]);

      if (res.rows.length === 0) return null;
      return mapProductRow(res.rows[0]);
    } catch (e) {
      console.error('ProductRepository.create error:', e);
      return null;
    }
  }

  async update(id: string, restaurantId: string, data: Partial<ProductFormData>): Promise<Product | null> {
    try {
      const updates: Record<string, any> = {};
      if (data.name !== undefined) {
        updates.name = data.name.trim();
        updates.slug = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`;
      }
      if (data.description !== undefined) updates.description = data.description?.trim() || null;
      if (data.full_description !== undefined) updates.full_description = data.full_description?.trim() || null;
      if (data.price !== undefined) updates.price = Number(data.price);
      if (data.compare_at_price !== undefined) {
        updates.compare_at_price = data.compare_at_price ? Number(data.compare_at_price) : null;
        updates.compare_price = updates.compare_at_price;
      }
      if (data.cost_per_unit !== undefined) {
        updates.cost_per_unit = data.cost_per_unit ? Number(data.cost_per_unit) : null;
        updates.cost_price = updates.cost_per_unit;
      }
      if (data.unit !== undefined) updates.unit = data.unit;
      if (data.servings !== undefined) updates.servings = data.servings;
      if (data.pieces !== undefined) updates.pieces = data.pieces;
      if (data.portion_size !== undefined) updates.portion_size = data.portion_size;
      if (data.included_items !== undefined) updates.included_items = data.included_items;
      if (data.ingredients !== undefined) updates.ingredients = data.ingredients;
      if (data.allergens !== undefined) updates.allergens = data.allergens;
      if (data.delivery_time !== undefined) updates.delivery_time = data.delivery_time;
      if (data.category_id !== undefined) updates.category_id = data.category_id || null;
      if (data.is_vegetarian !== undefined) {
        updates.is_vegetarian = Boolean(data.is_vegetarian);
        updates.is_veg = updates.is_vegetarian;
      }
      if (data.is_vegan !== undefined) updates.is_vegan = Boolean(data.is_vegan);
      if (data.is_gluten_free !== undefined) updates.is_gluten_free = Boolean(data.is_gluten_free);
      if (data.spice_level !== undefined) updates.spice_level = Number(data.spice_level);
      if (data.preparation_time !== undefined) updates.preparation_time = Number(data.preparation_time);
      if (data.image !== undefined) {
        updates.image = data.image;
        updates.image_url = data.image;
      }
      if (data.stock_quantity !== undefined) updates.stock_quantity = Number(data.stock_quantity);
      if (data.track_inventory !== undefined) updates.track_inventory = Boolean(data.track_inventory);
      if (data.packaging_big_qty !== undefined) updates.packaging_big_qty = Number(data.packaging_big_qty);
      if (data.packaging_small_qty !== undefined) updates.packaging_small_qty = Number(data.packaging_small_qty);
      if (data.is_available !== undefined) updates.is_available = Boolean(data.is_available);
      if (data.is_active !== undefined) updates.is_active = Boolean(data.is_active);
      if (data.tags !== undefined) updates.tags = data.tags;

      const keys = Object.keys(updates);
      if (keys.length === 0) return this.findById(id);

      const setClauses = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
      const values = Object.values(updates);

      const whereClause = restaurantId ? 'WHERE id = $1 AND restaurant_id = $2' : 'WHERE id = $1';
      const whereParams = restaurantId ? [id, restaurantId] : [id];

      const res = await query(`
        UPDATE public.products
        SET ${setClauses}, updated_at = NOW()
        ${whereClause}
        RETURNING *;
      `, [...whereParams, ...values]);

      if (res.rows.length === 0) return null;
      return mapProductRow(res.rows[0]);
    } catch (e) {
      console.error('ProductRepository.update error:', e);
      return null;
    }
  }

  async softDelete(id: string, restaurantId: string): Promise<boolean> {
    try {
      const res = await query(`
        UPDATE public.products
        SET deleted_at = NOW(), is_active = false, updated_at = NOW()
        WHERE id = $1 AND restaurant_id = $2;
      `, [id, restaurantId]);
      return (res.rowCount ?? 0) > 0;
    } catch (e) {
      console.error('softDelete error:', e);
      return false;
    }
  }

  async restore(id: string, restaurantId: string): Promise<boolean> {
    try {
      const res = await query(`
        UPDATE public.products
        SET deleted_at = NULL, is_active = true, updated_at = NOW()
        WHERE id = $1 AND restaurant_id = $2;
      `, [id, restaurantId]);
      return (res.rowCount ?? 0) > 0;
    } catch (e) {
      console.error('restore error:', e);
      return false;
    }
  }

  async hasOrderHistory(id: string): Promise<boolean> {
    try {
      const res = await query('SELECT id FROM public.order_items WHERE product_id = $1 LIMIT 1', [id]);
      return res.rows.length > 0;
    } catch (e) {
      console.error('hasOrderHistory error:', e);
      return false;
    }
  }

  async hardDelete(id: string, restaurantId: string): Promise<boolean> {
    try {
      const hasHistory = await this.hasOrderHistory(id);
      if (hasHistory) return false;
      const res = await query('DELETE FROM public.products WHERE id = $1 AND restaurant_id = $2', [id, restaurantId]);
      return (res.rowCount ?? 0) > 0;
    } catch (e) {
      console.error('hardDelete error:', e);
      return false;
    }
  }

  async updateStock(id: string, restaurantId: string, quantity: number): Promise<Product | null> {
    try {
      const res = await query(`
        UPDATE public.products
        SET stock_quantity = $1, updated_at = NOW()
        WHERE id = $2 AND restaurant_id = $3
        RETURNING *;
      `, [quantity, id, restaurantId]);
      if (res.rows.length === 0) return null;
      return mapProductRow(res.rows[0]);
    } catch (e) {
      console.error('updateStock error:', e);
      return null;
    }
  }
}

export class CategoryRepository {
  async findByRestaurant(restaurantId: string, includeInactive = false): Promise<Category[]> {
    try {
      const condition = includeInactive ? '' : 'AND c.is_active = true';
      const res = await query(`
        SELECT 
          c.id, c.restaurant_id, c.name, c.slug, c.description, c.display_order, c.is_active, c.created_at, c.updated_at,
          COUNT(p.id)::int AS product_count
        FROM public.categories c
        LEFT JOIN public.products p ON p.category_id = c.id AND p.deleted_at IS NULL
        WHERE c.restaurant_id = $1 ${condition}
        GROUP BY c.id
        ORDER BY c.display_order ASC, c.name ASC;
      `, [restaurantId]);
      return res.rows.map(mapCategoryRow);
    } catch (e) {
      console.error('CategoryRepository.findByRestaurant error:', e);
      return [];
    }
  }

  async findById(id: string): Promise<Category | null> {
    try {
      const res = await query(`
        SELECT id, restaurant_id, name, slug, description, display_order, is_active, created_at, updated_at
        FROM public.categories
        WHERE id = $1
        LIMIT 1;
      `, [id]);
      if (res.rows.length === 0) return null;
      return mapCategoryRow(res.rows[0]);
    } catch (e) {
      console.error('CategoryRepository.findById error:', e);
      return null;
    }
  }

  async create(restaurantId: string, data: CategoryFormData): Promise<Category | null> {
    try {
      const countRes = await query('SELECT COUNT(*)::int AS count FROM public.categories WHERE restaurant_id = $1', [restaurantId]);
      const nextOrder = data.display_order ?? ((countRes.rows[0]?.count || 0) + 1);
      const slugBase = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cat';
      const slug = `${slugBase}-${Date.now().toString(36)}`;

      const res = await query(`
        INSERT INTO public.categories (restaurant_id, name, slug, description, display_order, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, restaurant_id, name, slug, description, display_order, is_active, created_at, updated_at;
      `, [
        restaurantId,
        data.name.trim(),
        slug,
        data.description?.trim() || null,
        nextOrder,
        data.is_active ?? true,
      ]);

      if (res.rows.length === 0) return null;
      return mapCategoryRow(res.rows[0]);
    } catch (e) {
      console.error('CategoryRepository.create error:', e);
      return null;
    }
  }

  async update(id: string, restaurantId: string, data: Partial<CategoryFormData>): Promise<Category | null> {
    try {
      const updates: Record<string, any> = {};
      if (data.name !== undefined) {
        updates.name = data.name.trim();
        updates.slug = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`;
      }
      if (data.description !== undefined) updates.description = data.description?.trim() || null;
      if (data.display_order !== undefined) updates.display_order = Number(data.display_order);
      if (data.is_active !== undefined) updates.is_active = Boolean(data.is_active);

      const keys = Object.keys(updates);
      if (keys.length === 0) return this.findById(id);

      const setClauses = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
      const values = Object.values(updates);

      const res = await query(`
        UPDATE public.categories
        SET ${setClauses}, updated_at = NOW()
        WHERE id = $1 AND restaurant_id = $2
        RETURNING *;
      `, [id, restaurantId, ...values]);

      if (res.rows.length === 0) return null;
      return mapCategoryRow(res.rows[0]);
    } catch (e) {
      console.error('CategoryRepository.update error:', e);
      return null;
    }
  }

  async delete(id: string, restaurantId: string): Promise<boolean> {
    try {
      await query('UPDATE public.products SET category_id = NULL WHERE category_id = $1 AND restaurant_id = $2', [id, restaurantId]);
      const res = await query('DELETE FROM public.categories WHERE id = $1 AND restaurant_id = $2', [id, restaurantId]);
      return (res.rowCount ?? 0) > 0;
    } catch (e) {
      console.error('CategoryRepository.delete error:', e);
      return false;
    }
  }

  async reorder(ids: string[]): Promise<boolean> {
    try {
      for (let i = 0; i < ids.length; i++) {
        await query('UPDATE public.categories SET display_order = $1, updated_at = NOW() WHERE id = $2', [i + 1, ids[i]]);
      }
      return true;
    } catch (e) {
      console.error('CategoryRepository.reorder error:', e);
      return false;
    }
  }
}

export const productRepository = new ProductRepository();
export const categoryRepository = new CategoryRepository();
