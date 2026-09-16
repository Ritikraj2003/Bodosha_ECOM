export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  full_description?: string | null;
  price: number;
  compare_at_price: number | null;
  cost_per_unit: number | null;
  unit: 'piece' | 'plate' | 'kg' | 'g' | 'ml' | 'l' | 'dozen' | 'box';
  servings?: string | null;
  pieces?: string | null;
  portion_size?: string | null;
  included_items?: string[] | null;
  ingredients?: string[] | null;
  allergens?: string[] | null;
  delivery_time?: string | null;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  spice_level: number;
  preparation_time: number;
  image: string | null;
  is_active: boolean;
  is_available: boolean;
  stock_quantity: number;
  track_inventory: boolean;
  packaging_big_qty: number;
  packaging_small_qty: number;
  sort_order: number;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProductFormData {
  name: string;
  description?: string | null;
  full_description?: string | null;
  price: number;
  compare_at_price?: number | null;
  cost_per_unit?: number | null;
  unit?: 'piece' | 'plate' | 'kg' | 'g' | 'ml' | 'l' | 'dozen' | 'box';
  servings?: string | null;
  pieces?: string | null;
  portion_size?: string | null;
  included_items?: string[] | null;
  ingredients?: string[] | null;
  allergens?: string[] | null;
  delivery_time?: string | null;
  category_id?: string | null;
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_gluten_free?: boolean;
  spice_level?: number;
  preparation_time?: number;
  image?: string | null;
  stock_quantity?: number;
  track_inventory?: boolean;
  packaging_big_qty?: number;
  packaging_small_qty?: number;
  is_available?: boolean;
  is_active?: boolean;
  tags?: string[] | null;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_count?: number;
}

export interface CategoryFormData {
  name: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
}

export interface ProductsFilter {
  category_id?: string;
  is_active?: boolean;
  is_available?: boolean;
  search?: string;
  low_stock?: boolean;
  includeDeleted?: boolean;
  deletedOnly?: boolean;
  page?: number;
  pageSize?: number;
}
