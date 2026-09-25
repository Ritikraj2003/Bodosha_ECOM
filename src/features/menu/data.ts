export interface MenuItem {
  id: string;
  name: string;
  price: number;
  desc: string;
  fullDesc?: string;
  veg: boolean;
  popular: boolean;
  img: string;
  rating?: number;
  category?: string;
  servings?: string;
  pieces?: string;
  portionSize?: string;
  includedItems?: string[];
  ingredients?: string[];
  allergens?: string[];
  prepTime?: number;
  deliveryTime?: string;
  spiceLevel?: number;
  unit?: string;
  packagingBigQty?: number;
  packagingSmallQty?: number;
  isAvailable?: boolean;
  compare_at_price?: number | null;
}

export interface MenuSection {
  category: string;
  items: MenuItem[];
}

export const menuSections: MenuSection[] = [];

