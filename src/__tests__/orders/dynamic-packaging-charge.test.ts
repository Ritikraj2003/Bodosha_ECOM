import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/features/cart/store';

describe('Dynamic Packaging Charge Tests', () => {
  beforeEach(() => {
    const store = useCartStore.getState();
    store.clearCart();
    store.setPricing({
      deliveryFee: 10,
      maintenanceFee: 1,
      packagingBigPrice: 3,
      packagingSmallPrice: 2,
    });
    store.setOrderType('room_delivery');
  });

  it('calculates 0 for empty cart', () => {
    const store = useCartStore.getState();
    expect(store.packagingCharge()).toBe(0);
    expect(store.total()).toBe(0);
  });

  it('Chicken Thali (1 big + 1 small @ ₹3 & ₹2) with Qty 3 = ₹15', () => {
    const store = useCartStore.getState();
    store.addItem({
      id: 'thali-chicken',
      name: 'Chicken Thali',
      price: 70,
      veg: false,
      image: '/chicken-thali.jpg',
      packagingBigQty: 1,
      packagingSmallQty: 1,
    }, 3);

    expect(store.subtotal()).toBe(210); // 70 * 3
    // Per unit: 1*3 + 1*2 = 5. Qty 3 -> 15.
    expect(store.packagingCharge()).toBe(15);
    expect(store.maintenanceFee()).toBe(1);
    expect(store.deliveryFee()).toBe(10);
    expect(store.total()).toBe(210 + 10 + 1 + 15); // 236
  });

  it('Veg Thali (1 big + 0 small @ ₹3 & ₹2) with Qty 1 = ₹3', () => {
    const store = useCartStore.getState();
    store.addItem({
      id: 'thali-veg',
      name: 'Veg Thali',
      price: 60,
      veg: true,
      image: '/veg-thali.jpg',
      packagingBigQty: 1,
      packagingSmallQty: 0,
    }, 1);

    expect(store.subtotal()).toBe(60);
    // Per unit: 1*3 + 0*2 = 3. Qty 1 -> 3.
    expect(store.packagingCharge()).toBe(3);
    expect(store.total()).toBe(60 + 10 + 1 + 3); // 74
  });

  it('Chicken (5 pcs) Gravy (0 big + 1 small @ ₹3 & ₹2) with Qty 2 = ₹4', () => {
    const store = useCartStore.getState();
    store.addItem({
      id: 'gravy-chicken',
      name: 'Chicken (5 pcs) Gravy',
      price: 40,
      veg: false,
      image: '/gravy.jpg',
      packagingBigQty: 0,
      packagingSmallQty: 1,
    }, 2);

    expect(store.subtotal()).toBe(80);
    // Per unit: 0*3 + 1*2 = 2. Qty 2 -> 4.
    expect(store.packagingCharge()).toBe(4);
    expect(store.total()).toBe(80 + 10 + 1 + 4); // 95
  });

  it('Combined Cart: Chicken Thali (3) + Veg Thali (1) + Chicken Gravy (2) = ₹22 packaging charge', () => {
    const store = useCartStore.getState();

    // 1. Chicken Thali x 3: 3 * (1*3 + 1*2) = 15
    store.addItem({
      id: 'thali-chicken',
      name: 'Chicken Thali',
      price: 70,
      veg: false,
      image: '/chicken-thali.jpg',
      packagingBigQty: 1,
      packagingSmallQty: 1,
    }, 3);

    // 2. Veg Thali x 1: 1 * (1*3 + 0*2) = 3
    store.addItem({
      id: 'thali-veg',
      name: 'Veg Thali',
      price: 60,
      veg: true,
      image: '/veg-thali.jpg',
      packagingBigQty: 1,
      packagingSmallQty: 0,
    }, 1);

    // 3. Chicken Gravy x 2: 2 * (0*3 + 1*2) = 4
    store.addItem({
      id: 'gravy-chicken',
      name: 'Chicken (5 pcs) Gravy',
      price: 40,
      veg: false,
      image: '/gravy.jpg',
      packagingBigQty: 0,
      packagingSmallQty: 1,
    }, 2);

    const expectedSubtotal = (70 * 3) + (60 * 1) + (40 * 2); // 210 + 60 + 80 = 350
    const expectedPackaging = 15 + 3 + 4; // 22

    expect(store.subtotal()).toBe(expectedSubtotal);
    expect(store.packagingCharge()).toBe(expectedPackaging);
    expect(store.deliveryFee()).toBe(10);
    expect(store.maintenanceFee()).toBe(1);
    expect(store.total()).toBe(expectedSubtotal + 10 + 1 + expectedPackaging); // 383
  });

  it('dynamically adapts when admin changes big/small packet prices (e.g. big=₹5, small=₹3)', () => {
    const store = useCartStore.getState();
    store.setPricing({
      deliveryFee: 10,
      maintenanceFee: 1,
      packagingBigPrice: 5,
      packagingSmallPrice: 3,
    });

    store.addItem({
      id: 'thali-chicken',
      name: 'Chicken Thali',
      price: 70,
      veg: false,
      image: '/chicken-thali.jpg',
      packagingBigQty: 1,
      packagingSmallQty: 1,
    }, 2);

    // 2 * (1*5 + 1*3) = 2 * 8 = 16
    expect(store.packagingCharge()).toBe(16);
  });
});
