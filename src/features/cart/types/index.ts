export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  veg: boolean;
  image: string;
  packagingBigQty?: number;
  packagingSmallQty?: number;
}

export interface CartPricing {
  deliveryFee: number;
  maintenanceFee: number;
  packagingCharge?: number;
  packagingBigPrice?: number;
  packagingSmallPrice?: number;
}

export interface CartState {
  items: CartItem[];
  lastAddedAt: number | null;
  lastViewedAt: number | null;
  lastAddedRect: { left: number; top: number; width: number; height: number } | null;
  pricing: CartPricing;
  orderType: 'room_delivery' | 'takeaway';
}

export interface CartStore extends CartState {
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  setLastAddedRect: (rect: { left: number; top: number; width: number; height: number } | null) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  markCartViewed: () => void;
  setPricing: (pricing: CartPricing) => void;
  setOrderType: (orderType: 'room_delivery' | 'takeaway') => void;
  syncPrices: (menuItems: Array<{ id: string; name: string; price: number; img?: string; veg?: boolean; packagingBigQty?: number; packagingSmallQty?: number }>) => void;
  totalItems: () => number;
  subtotal: () => number;
  deliveryFee: () => number;
  maintenanceFee: () => number;
  packagingCharge: () => number;
  total: () => number;
}
