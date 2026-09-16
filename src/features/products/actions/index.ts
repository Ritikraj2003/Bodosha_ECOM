'use server';

import { getServerSession } from '@/features/auth/actions';
import { restaurantRepository } from '@/features/restaurants/repositories';
import { createServiceClient } from '@/infrastructure/supabase/service';
import { productRepository, categoryRepository } from '../repositories';
import type { Product, ProductFormData, Category, CategoryFormData, ProductsFilter } from '../types';
import { revalidatePath } from 'next/cache';

function revalidateMenu() {
  try {
    revalidatePath('/', 'page');
    revalidatePath('/menu', 'page');
    revalidatePath('/cart', 'page');
    revalidatePath('/checkout', 'page');
    revalidatePath('/api/menu');
  } catch (err) {
    console.error('Failed to revalidate menu caches:', err);
  }
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  archived?: boolean;
}

async function getMerchantRestaurantId(): Promise<string | null> {
  const supabase = createServiceClient();
  const { user } = await getServerSession();

  // 1. Try finding restaurant by user ID if logged in
  if (user?.id) {
    const restaurant = await restaurantRepository.findByOwnerId(user.id);
    if (restaurant?.id) return restaurant.id;
  }

  // 2. Fallback: Query first active restaurant in DB using service client (bypasses RLS)
  if (supabase) {
    const { data } = await supabase.from('restaurants').select('id').is('deleted_at', null).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }

  // 3. Fallback: If DB has 0 restaurants, create a default restaurant using service client
  const fallbackSupabase = supabase ?? (await (await import('@/infrastructure/supabase/server')).createServerSupabaseClient());
  if (!fallbackSupabase) return null;

  const ownerId = user?.id || '00000000-0000-0000-0000-000000000000';
  const { data: newRest, error: createErr } = await fallbackSupabase.from('restaurants').insert({
    owner_id: ownerId,
    name: 'Dilip Da Main',
    slug: `dilip-da-main-${Date.now().toString(36)}`,
    address_line1: 'Near CIT Kokrajhar',
    city: 'Kokrajhar',
    state: 'Assam',
    postal_code: '783370',
    opening_time: '08:00',
    closing_time: '22:00',
    delivery_fee: 20,
    min_order_amount: 50,
    is_active: true,
    is_open: true,
    status: 'active'
  }).select('id').single();

  if (createErr) {
    console.error('Failed to create default restaurant:', createErr);
  }
  return newRest?.id ?? null;
}

export async function getProducts(filter: ProductsFilter = {}): Promise<ApiResponse<Product[]>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const products = await productRepository.findByRestaurant(restaurantId, filter);
  return { success: true, data: products };
}

export async function getProduct(productId: string): Promise<ApiResponse<Product>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const product = await productRepository.findById(productId);
  if (!product || product.restaurant_id !== restaurantId) return { success: false, error: 'Product not found' };
  return { success: true, data: product };
}

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { createAdminClient } from '@/infrastructure/supabase/admin';

const PBUCKET = 'product-images';

/**
 * Persist a product image. Uploads to Supabase Storage (works on serverless
 * hosts like Vercel where the local filesystem is read-only), falling back to
 * the local `public/uploads` directory in case the bucket does not exist yet.
 */
export async function processImageFile(file: File | null): Promise<string | undefined> {
  if (!file || typeof file === 'string' || file.size === 0) return undefined;
  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileExt = path.extname(file.name) || '.jpg';
    const cleanBaseName = path.basename(file.name, fileExt).toLowerCase().replace(/[^a-z0-9]/g, '-');
    const fileName = `product-${cleanBaseName}-${Date.now()}${fileExt}`;

    // Prefer Supabase Storage so uploads survive across serverless instances.
    try {
      const admin = createAdminClient();
      const { error } = await admin.storage.from(PBUCKET).upload(fileName, buffer, {
        contentType: file.type || 'image/jpeg',
        cacheControl: '3600',
        upsert: true,
      });
      if (!error) {
        const { data } = admin.storage.from(PBUCKET).getPublicUrl(fileName);
        if (data?.publicUrl) return data.publicUrl;
      } else {
        console.error('Storage upload failed, falling back to local:', error.message);
      }
    } catch (err) {
      console.error('Storage upload threw, falling back to local:', err);
    }

    // Fallback: local filesystem (for local dev / non-serverless hosting).
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const filePath = path.join(uploadsDir, fileName);
    await writeFile(filePath, buffer);
    return `/uploads/${fileName}`;
  } catch (err) {
    console.error('Failed to save product image file:', err);
    return undefined;
  }
}

export async function createProduct(data: ProductFormData): Promise<ApiResponse<Product>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const product = await productRepository.create(restaurantId, data);
  if (!product) return { success: false, error: 'Failed to create product' };
  revalidateMenu();
  return { success: true, data: product };
}

export async function createProductFromFormData(formData: FormData): Promise<ApiResponse<Product>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };

  const name = (formData.get('name') as string)?.trim();
  const price = Number(formData.get('price'));

  if (!name) return { success: false, error: 'Product name is required' };
  if (!price || price <= 0) return { success: false, error: 'Product price must be greater than 0' };

  let imagePath: string | undefined = (formData.get('image') as string) || undefined;
  const file = (formData.get('file') || formData.get('image_file')) as File | null;
  if (file && file instanceof File && file.size > 0) {
    const uploadedPath = await processImageFile(file);
    if (uploadedPath) imagePath = uploadedPath;
  }

  const description = (formData.get('description') as string)?.trim() || undefined;
  const full_description = (formData.get('full_description') as string)?.trim() || undefined;
  const servings = (formData.get('servings') as string)?.trim() || undefined;
  const pieces = (formData.get('pieces') as string)?.trim() || undefined;
  const portion_size = (formData.get('portion_size') as string)?.trim() || undefined;
  const delivery_time = (formData.get('delivery_time') as string)?.trim() || undefined;
  const unit = (formData.get('unit') as 'piece' | 'plate' | 'kg' | 'g' | 'ml' | 'l' | 'dozen' | 'box') || undefined;

  const includedItemsStr = formData.get('included_items') as string;
  const included_items = includedItemsStr
    ? includedItemsStr.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    : undefined;

  const ingredientsStr = formData.get('ingredients') as string;
  const ingredients = ingredientsStr
    ? ingredientsStr.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const allergensStr = formData.get('allergens') as string;
  const allergens = allergensStr
    ? allergensStr.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const category_id = (formData.get('category_id') as string) || undefined;
  const is_vegetarian = formData.get('is_vegetarian') === 'true' || formData.get('is_vegetarian') === 'on';
  const is_vegan = formData.get('is_vegan') === 'true' || formData.get('is_vegan') === 'on';
  const is_gluten_free = formData.get('is_gluten_free') === 'true' || formData.get('is_gluten_free') === 'on';
  const is_available = formData.has('is_available') ? (formData.get('is_available') === 'true' || formData.get('is_available') === 'on') : true;
  const is_active = formData.has('is_active') ? (formData.get('is_active') === 'true' || formData.get('is_active') === 'on') : true;
  const compare_at_price = formData.get('compare_at_price') ? Number(formData.get('compare_at_price')) : undefined;
  const cost_per_unit = formData.get('cost_per_unit') ? Number(formData.get('cost_per_unit')) : undefined;
  const preparation_time = formData.get('preparation_time') ? Number(formData.get('preparation_time')) : 15;
  const stock_quantity = formData.get('stock_quantity') ? Number(formData.get('stock_quantity')) : 0;
  const track_inventory = formData.get('track_inventory') === 'true' || formData.get('track_inventory') === 'on';
  const packaging_big_qty = formData.get('packaging_big_qty') ? Math.max(0, parseInt(String(formData.get('packaging_big_qty')), 10) || 0) : 0;
  const packaging_small_qty = formData.get('packaging_small_qty') ? Math.max(0, parseInt(String(formData.get('packaging_small_qty')), 10) || 0) : 0;
  const tagsString = formData.get('tags') as string;
  const tags = tagsString ? tagsString.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

  const productData: ProductFormData = {
    name,
    price,
    description,
    full_description,
    servings,
    pieces,
    portion_size,
    included_items,
    ingredients,
    allergens,
    delivery_time,
    unit,
    category_id,
    image: imagePath,
    is_vegetarian,
    is_vegan,
    is_gluten_free,
    is_available,
    is_active,
    compare_at_price,
    cost_per_unit,
    preparation_time,
    stock_quantity,
    track_inventory,
    packaging_big_qty,
    packaging_small_qty,
    tags,
  };

  const product = await productRepository.create(restaurantId, productData);
  if (!product) return { success: false, error: 'Failed to create product' };
  revalidateMenu();
  return { success: true, data: product };
}

export async function updateProduct(productId: string, data: Partial<ProductFormData>): Promise<ApiResponse<Product>> {
  const existing = await productRepository.findById(productId);
  if (!existing) return { success: false, error: 'Product not found' };
  const product = await productRepository.update(productId, existing.restaurant_id, data);
  if (!product) return { success: false, error: 'Failed to update product' };
  revalidateMenu();
  return { success: true, data: product };
}

export async function updateProductFromFormData(productId: string, formData: FormData): Promise<ApiResponse<Product>> {
  const existing = await productRepository.findById(productId);
  if (!existing) return { success: false, error: 'Product not found' };

  let imagePath: string | null | undefined = existing.image;
  const file = (formData.get('file') || formData.get('image_file')) as File | null;
  if (file && file instanceof File && file.size > 0) {
    const uploadedPath = await processImageFile(file);
    if (uploadedPath) imagePath = uploadedPath;
  } else if (formData.has('image')) {
    const rawImage = (formData.get('image') as string)?.trim();
    imagePath = rawImage ? rawImage : null;
  }

  const name = formData.has('name') ? ((formData.get('name') as string)?.trim() || existing.name) : existing.name;
  const price = formData.has('price') && formData.get('price') ? Number(formData.get('price')) : existing.price;
  const description = formData.has('description') ? ((formData.get('description') as string)?.trim() || null) : existing.description;
  const full_description = formData.has('full_description') ? ((formData.get('full_description') as string)?.trim() || null) : existing.full_description;
  const servings = formData.has('servings') ? ((formData.get('servings') as string)?.trim() || null) : existing.servings;
  const pieces = formData.has('pieces') ? ((formData.get('pieces') as string)?.trim() || null) : existing.pieces;
  const portion_size = formData.has('portion_size') ? ((formData.get('portion_size') as string)?.trim() || null) : existing.portion_size;
  const delivery_time = formData.has('delivery_time') ? ((formData.get('delivery_time') as string)?.trim() || null) : existing.delivery_time;
  const unit = formData.has('unit') ? ((formData.get('unit') as 'piece' | 'plate' | 'kg' | 'g' | 'ml' | 'l' | 'dozen' | 'box') || 'piece') : existing.unit;

  const included_items = formData.has('included_items')
    ? (formData.get('included_items') as string).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    : existing.included_items;

  const ingredients = formData.has('ingredients')
    ? (formData.get('ingredients') as string).split(',').map((s) => s.trim()).filter(Boolean)
    : existing.ingredients;

  const allergens = formData.has('allergens')
    ? (formData.get('allergens') as string).split(',').map((s) => s.trim()).filter(Boolean)
    : existing.allergens;

  const category_id = formData.has('category_id') ? ((formData.get('category_id') as string)?.trim() || null) : existing.category_id;
  const is_vegetarian = formData.has('is_vegetarian') ? (formData.get('is_vegetarian') === 'true' || formData.get('is_vegetarian') === 'on') : existing.is_vegetarian;
  const is_vegan = formData.has('is_vegan') ? (formData.get('is_vegan') === 'true' || formData.get('is_vegan') === 'on') : existing.is_vegan;
  const is_gluten_free = formData.has('is_gluten_free') ? (formData.get('is_gluten_free') === 'true' || formData.get('is_gluten_free') === 'on') : existing.is_gluten_free;
  const is_available = formData.has('is_available') ? (formData.get('is_available') === 'true' || formData.get('is_available') === 'on') : existing.is_available;
  const is_active = formData.has('is_active') ? (formData.get('is_active') === 'true' || formData.get('is_active') === 'on') : existing.is_active;
  const compare_at_price = formData.has('compare_at_price') ? (formData.get('compare_at_price') ? Number(formData.get('compare_at_price')) : null) : existing.compare_at_price;
  const preparation_time = formData.has('preparation_time') && formData.get('preparation_time') ? Number(formData.get('preparation_time')) : existing.preparation_time;
  const stock_quantity = formData.has('stock_quantity') && formData.get('stock_quantity') ? Number(formData.get('stock_quantity')) : existing.stock_quantity;
  const packaging_big_qty = formData.has('packaging_big_qty') ? Math.max(0, parseInt(String(formData.get('packaging_big_qty')), 10) || 0) : existing.packaging_big_qty;
  const packaging_small_qty = formData.has('packaging_small_qty') ? Math.max(0, parseInt(String(formData.get('packaging_small_qty')), 10) || 0) : existing.packaging_small_qty;

  const productData: Partial<ProductFormData> = {
    name,
    price,
    description,
    full_description,
    servings,
    pieces,
    portion_size,
    included_items,
    ingredients,
    allergens,
    delivery_time,
    unit,
    category_id,
    image: imagePath,
    is_vegetarian,
    is_vegan,
    is_gluten_free,
    is_available,
    is_active,
    compare_at_price,
    preparation_time,
    stock_quantity,
    packaging_big_qty,
    packaging_small_qty,
  };

  const product = await productRepository.update(productId, existing.restaurant_id, productData);
  if (!product) return { success: false, error: 'Failed to update product' };
  revalidateMenu();
  return { success: true, data: product };
}

export async function archiveProduct(productId: string): Promise<ApiResponse<void>> {
  const existing = await productRepository.findById(productId, true);
  if (!existing) return { success: false, error: 'Product not found' };
  const ok = await productRepository.softDelete(productId, existing.restaurant_id);
  if (ok) revalidateMenu();
  return ok ? { success: true, archived: true } : { success: false, error: 'Failed to archive' };
}

export async function restoreProduct(productId: string): Promise<ApiResponse<void>> {
  const existing = await productRepository.findById(productId, true);
  if (!existing) return { success: false, error: 'Product not found' };
  const ok = await productRepository.restore(productId, existing.restaurant_id);
  if (ok) revalidateMenu();
  return ok ? { success: true } : { success: false, error: 'Failed to restore' };
}

export async function deleteProduct(productId: string): Promise<ApiResponse<void>> {
  const existing = await productRepository.findById(productId, true);
  if (!existing) return { success: false, error: 'Product not found' };
  const hasHistory = await productRepository.hasOrderHistory(productId);
  if (hasHistory) {
    const ok = await productRepository.softDelete(productId, existing.restaurant_id);
    if (ok) revalidateMenu();
    return ok
      ? { success: true, archived: true }
      : { success: false, error: 'Failed to archive product with order history' };
  }
  const ok = await productRepository.hardDelete(productId, existing.restaurant_id);
  if (ok) revalidateMenu();
  return ok ? { success: true, archived: false } : { success: false, error: 'Failed to delete product' };
}

export async function updateProductStock(productId: string, quantity: number): Promise<ApiResponse<Product>> {
  const existing = await productRepository.findById(productId);
  if (!existing) return { success: false, error: 'Product not found' };
  const product = await productRepository.updateStock(productId, existing.restaurant_id, quantity);
  if (!product) return { success: false, error: 'Failed to update stock' };
  revalidateMenu();
  return { success: true, data: product };
}

export async function getCategories(includeInactive = false): Promise<ApiResponse<Category[]>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const categories = await categoryRepository.findByRestaurant(restaurantId, includeInactive);
  const products = await productRepository.findByRestaurant(restaurantId);
  const counts: Record<string, number> = {};
  for (const p of products) {
    if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
  }
  const withCounts = categories.map((c) => ({ ...c, product_count: counts[c.id] ?? 0 }));
  return { success: true, data: withCounts };
}

export async function createCategory(data: CategoryFormData): Promise<ApiResponse<Category>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const category = await categoryRepository.create(restaurantId, data);
  if (!category) return { success: false, error: 'Failed to create category' };
  revalidateMenu();
  return { success: true, data: category };
}

export async function updateCategory(categoryId: string, data: Partial<CategoryFormData>): Promise<ApiResponse<Category>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const existing = await categoryRepository.findById(categoryId);
  if (!existing || existing.restaurant_id !== restaurantId) return { success: false, error: 'Category not found' };
  const category = await categoryRepository.update(categoryId, restaurantId, data);
  if (!category) return { success: false, error: 'Failed to update category' };
  revalidateMenu();
  return { success: true, data: category };
}

export async function deleteCategory(categoryId: string): Promise<ApiResponse<void>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const existing = await categoryRepository.findById(categoryId);
  if (!existing || existing.restaurant_id !== restaurantId) return { success: false, error: 'Category not found' };
  const ok = await categoryRepository.delete(categoryId, restaurantId);
  if (ok) revalidateMenu();
  return ok ? { success: true } : { success: false, error: 'Failed to delete category' };
}

export async function reorderCategories(ids: string[]): Promise<ApiResponse<void>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const ok = await categoryRepository.reorder(ids);
  if (ok) revalidateMenu();
  return ok ? { success: true } : { success: false, error: 'Failed to reorder' };
}
