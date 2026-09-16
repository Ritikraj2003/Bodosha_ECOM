import { describe, it, expect } from 'vitest';
import type { CartItem } from '@/features/cart/types';
import type { Product } from '@/features/products/types';

describe('In-Store Packaging Charge Calculation Tests', () => {
  const sampleProducts: Product[] = [
    {
      id: 'prod-chicken-thali',
      name: 'Chicken Thali',
      slug: 'chicken-thali',
      price: 120,
      is_vegetarian: false,
      is_active: true,
      is_available: true,
      packaging_big_qty: 1,
      packaging_small_qty: 1,
      restaurant_id: 'rest-1',
      category_id: 'cat-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
    {
      id: 'prod-veg-thali',
      name: 'Veg Thali',
      slug: 'veg-thali',
      price: 90,
      is_vegetarian: true,
      is_active: true,
      is_available: true,
      packaging_big_qty: 1,
      packaging_small_qty: 0,
      restaurant_id: 'rest-1',
      category_id: 'cat-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
    {
      id: 'prod-chicken-gravy',
      name: 'Chicken Gravy (Single Cup)',
      slug: 'chicken-gravy',
      price: 45,
      is_vegetarian: false,
      is_active: true,
      is_available: true,
      packaging_big_qty: 0,
      packaging_small_qty: 1,
      restaurant_id: 'rest-1',
      category_id: 'cat-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
    {
      id: 'prod-water',
      name: 'Water Bottle',
      slug: 'water-bottle',
      price: 20,
      is_vegetarian: true,
      is_active: true,
      is_available: true,
      packaging_big_qty: 0,
      packaging_small_qty: 0,
      restaurant_id: 'rest-1',
      category_id: 'cat-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
  ];

  // Helper simulating the addToCart logic from InStorePage
  function addToInStoreCart(cart: CartItem[], product: Product, quantity = 1): CartItem[] {
    const existing = cart.find((i) => i.id === product.id);
    if (existing) {
      return cart.map((i) =>
        i.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
      );
    }
    return [
      ...cart,
      {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity,
        veg: product.is_vegetarian,
        image: product.image ?? '',
        packagingBigQty: Number(product.packaging_big_qty) || 0,
        packagingSmallQty: Number(product.packaging_small_qty) || 0,
      },
    ];
  }

  // Helper simulating the in-store financial calculation
  function calculateInStoreTotals(
    cart: CartItem[],
    isTakeaway: boolean,
    settings = {
      maintenanceFee: 1,
      packagingChargeEnabled: true,
      packagingBigPrice: 3,
      packagingSmallPrice: 2,
    }
  ) {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const maintenanceFee = subtotal > 0 ? settings.maintenanceFee : 0;

    const bigPacketPrice = settings.packagingBigPrice ?? 3;
    const smallPacketPrice = settings.packagingSmallPrice ?? 2;
    const isPackagingEnabled = settings.packagingChargeEnabled ?? true;

    const totalBigPackets = cart.reduce(
      (sum, item) => sum + (item.packagingBigQty ?? 0) * item.quantity,
      0
    );
    const totalSmallPackets = cart.reduce(
      (sum, item) => sum + (item.packagingSmallQty ?? 0) * item.quantity,
      0
    );

    const packagingCharge =
      subtotal > 0 && isTakeaway && isPackagingEnabled
        ? totalBigPackets * bigPacketPrice + totalSmallPackets * smallPacketPrice
        : 0;

    const totalFees = maintenanceFee + packagingCharge;
    const total = subtotal + totalFees;

    return {
      subtotal,
      maintenanceFee,
      packagingCharge,
      totalFees,
      total,
      totalBigPackets,
      totalSmallPackets,
    };
  }

  it('correctly populates packagingBigQty and packagingSmallQty when adding products to cart', () => {
    let cart: CartItem[] = [];
    cart = addToInStoreCart(cart, sampleProducts[0], 2); // Chicken Thali (1 big, 1 small)

    expect(cart.length).toBe(1);
    expect(cart[0].packagingBigQty).toBe(1);
    expect(cart[0].packagingSmallQty).toBe(1);
    expect(cart[0].quantity).toBe(2);
  });

  it('calculates ₹0 packaging charge for Dine-in counter orders even with packet-requiring items', () => {
    let cart: CartItem[] = [];
    cart = addToInStoreCart(cart, sampleProducts[0], 3); // 3x Chicken Thali
    cart = addToInStoreCart(cart, sampleProducts[1], 2); // 2x Veg Thali

    // isTakeaway = false (Dine-in)
    const result = calculateInStoreTotals(cart, false);

    expect(result.subtotal).toBe(120 * 3 + 90 * 2); // 360 + 180 = 540
    expect(result.packagingCharge).toBe(0);
    expect(result.maintenanceFee).toBe(1);
    expect(result.total).toBe(541);
    expect(result.totalBigPackets).toBe(3 * 1 + 2 * 1); // 5 big packets
    expect(result.totalSmallPackets).toBe(3 * 1 + 2 * 0); // 3 small packets
  });

  it('calculates exact packaging charge when Takeaway is enabled (1 Big @ ₹3, 1 Small @ ₹2)', () => {
    let cart: CartItem[] = [];
    cart = addToInStoreCart(cart, sampleProducts[0], 2); // 2x Chicken Thali: 2 big + 2 small = 2*3 + 2*2 = 10

    // isTakeaway = true
    const result = calculateInStoreTotals(cart, true);

    expect(result.subtotal).toBe(240);
    expect(result.totalBigPackets).toBe(2);
    expect(result.totalSmallPackets).toBe(2);
    expect(result.packagingCharge).toBe(10); // 2*3 + 2*2
    expect(result.maintenanceFee).toBe(1);
    expect(result.total).toBe(240 + 1 + 10); // 251
  });

  it('handles mixed cart with Chicken Thali, Veg Thali, Chicken Gravy, and Water Bottle for Takeaway', () => {
    let cart: CartItem[] = [];
    cart = addToInStoreCart(cart, sampleProducts[0], 3); // 3x Chicken Thali: 3 big, 3 small
    cart = addToInStoreCart(cart, sampleProducts[1], 1); // 1x Veg Thali: 1 big, 0 small
    cart = addToInStoreCart(cart, sampleProducts[2], 2); // 2x Chicken Gravy: 0 big, 2 small
    cart = addToInStoreCart(cart, sampleProducts[3], 4); // 4x Water: 0 big, 0 small

    const result = calculateInStoreTotals(cart, true);

    // Big packets: 3 + 1 + 0 + 0 = 4 big packets
    // Small packets: 3 + 0 + 2 + 0 = 5 small packets
    expect(result.totalBigPackets).toBe(4);
    expect(result.totalSmallPackets).toBe(5);

    // Packaging: 4 * 3 + 5 * 2 = 12 + 10 = 22
    expect(result.packagingCharge).toBe(22);

    // Subtotal: 3*120 + 1*90 + 2*45 + 4*20 = 360 + 90 + 90 + 80 = 620
    expect(result.subtotal).toBe(620);
    expect(result.maintenanceFee).toBe(1);
    expect(result.total).toBe(620 + 1 + 22); // 643
  });

  it('dynamically adapts when custom packet prices are set in admin settings (e.g. Big=₹5, Small=₹3)', () => {
    let cart: CartItem[] = [];
    cart = addToInStoreCart(cart, sampleProducts[0], 2); // 2 big + 2 small

    const customSettings = {
      maintenanceFee: 2,
      packagingChargeEnabled: true,
      packagingBigPrice: 5,
      packagingSmallPrice: 3,
    };

    const result = calculateInStoreTotals(cart, true, customSettings);

    // Packaging: 2*5 + 2*3 = 10 + 6 = 16
    expect(result.packagingCharge).toBe(16);
    expect(result.maintenanceFee).toBe(2);
    expect(result.total).toBe(240 + 2 + 16); // 258
  });

  it('respects packagingChargeEnabled = false setting', () => {
    let cart: CartItem[] = [];
    cart = addToInStoreCart(cart, sampleProducts[0], 2);

    const disabledSettings = {
      maintenanceFee: 1,
      packagingChargeEnabled: false,
      packagingBigPrice: 3,
      packagingSmallPrice: 2,
    };

    const result = calculateInStoreTotals(cart, true, disabledSettings);

    expect(result.packagingCharge).toBe(0);
    expect(result.total).toBe(240 + 1 + 0); // 241
  });
});
