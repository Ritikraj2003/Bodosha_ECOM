import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveAuthoritativeLineItems, validateAndQuoteOrder } from '@/features/orders/actions/customer';
import { useCartStore } from '@/features/cart/store';
import type { CartItem } from '@/features/cart/types';

// Mock Supabase service client
const mockSelect = vi.fn();
const mockIn = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect.mockReturnValue({
    in: mockIn,
  }),
}));

vi.mock('@/infrastructure/supabase/service', () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock('@/lib/settings', () => ({
  getNumericSetting: vi.fn(async (key: string, def: number) => {
    if (key === 'delivery_fee') return 20;
    if (key === 'maintenance_fee') return 1;
    if (key === 'packaging_big_packet_price') return 3;
    if (key === 'packaging_small_packet_price') return 2;
    return def;
  }),
  getBooleanSetting: vi.fn(async () => false),
  getSetting: vi.fn(async () => null),
  getPaymentMethodAvailability: vi.fn(async () => [{ id: 'cod', enabled: true, configured: true }]),
}));

vi.mock('@/features/auth/actions', () => ({
  getServerSession: vi.fn(async () => ({ user: { id: 'user-123', email: 'test@example.com' } })),
}));

describe('Authoritative Price Integrity Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recalculates item price from DB when client sends older/tampered price (e.g. ₹100 client vs ₹120 DB)', async () => {
    const testProductId = '00000000-0000-0000-0000-000000000001';
    mockIn.mockResolvedValueOnce({
      data: [
        {
          id: testProductId,
          name: 'Authoritative Chicken Biryani',
          price: 120,
          is_active: true,
          is_available: true,
          deleted_at: null,
        },
      ],
      error: null,
    });

    const clientCartItems: CartItem[] = [
      {
        id: testProductId,
        name: 'Older Biryani Name',
        price: 100, // Client had old price 100
        quantity: 2,
        veg: false,
        image: '/biryani.jpg',
      },
    ];

    const result = await resolveAuthoritativeLineItems(clientCartItems);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.priceChanged).toBe(true);
      expect(result.lineItems[0].product_price).toBe(120);
      expect(result.lineItems[0].unit_price).toBe(120);
      expect(result.lineItems[0].subtotal).toBe(240); // 120 * 2
      expect(result.subtotal).toBe(240);
    }
  });

  it('rejects order when a product is marked unavailable or out of stock in DB', async () => {
    const testProductId = '00000000-0000-0000-0000-000000000002';
    mockIn.mockResolvedValueOnce({
      data: [
        {
          id: testProductId,
          name: 'Mutton Biryani',
          price: 250,
          is_active: true,
          is_available: false, // SOLD OUT
          deleted_at: null,
        },
      ],
      error: null,
    });

    const clientCartItems: CartItem[] = [
      {
        id: testProductId,
        name: 'Mutton Biryani',
        price: 250,
        quantity: 1,
        veg: false,
        image: '/mutton.jpg',
      },
    ];

    const result = await resolveAuthoritativeLineItems(clientCartItems);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('sold out');
    }
  });

  it('rejects order when product is deactivated or deleted in DB', async () => {
    const testProductId = '00000000-0000-0000-0000-000000000003';
    mockIn.mockResolvedValueOnce({
      data: [
        {
          id: testProductId,
          name: 'Seasonal Special',
          price: 150,
          is_active: false, // Inactive
          is_available: true,
          deleted_at: null,
        },
      ],
      error: null,
    });

    const clientCartItems: CartItem[] = [
      {
        id: testProductId,
        name: 'Seasonal Special',
        price: 150,
        quantity: 1,
        veg: false,
        image: '/special.jpg',
      },
    ];

    const result = await resolveAuthoritativeLineItems(clientCartItems);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('no longer available');
    }
  });

  it('validateAndQuoteOrder computes authoritative subtotal, zero delivery fee for takeaway, and maintenance fee', async () => {
    const testProductId = '00000000-0000-0000-0000-000000000001';
    mockIn.mockResolvedValueOnce({
      data: [
        {
          id: testProductId,
          name: 'Chicken Thali',
          price: 120,
          is_active: true,
          is_available: true,
          deleted_at: null,
          packaging_big_qty: 1,
          packaging_small_qty: 1,
        },
      ],
      error: null,
    });

    const quote = await validateAndQuoteOrder({
      items: [
        {
          id: testProductId,
          name: 'Chicken Thali',
          price: 100,
          quantity: 2,
          veg: false,
          image: '/thali.jpg',
          packagingBigQty: 1,
          packagingSmallQty: 1,
        },
      ],
      orderType: 'takeaway',
    });

    expect(quote.success).toBe(true);
    if (quote.success && quote.data) {
      expect(quote.data.subtotal).toBe(240);
      expect(quote.data.deliveryFee).toBe(0); // Takeaway = free delivery
      expect(quote.data.maintenanceFee).toBe(1);
      expect(quote.data.packagingCharge).toBe(10); // 2 * (1*3 + 1*2) = 10
      expect(quote.data.total).toBe(251); // 240 + 0 + 1 + 10
      expect(quote.data.priceChanged).toBe(true);
    }
  });

  it('calculates total with dynamic packagingCharge in useCartStore', () => {
    const store = useCartStore.getState();
    store.clearCart();
    store.setPricing({ deliveryFee: 15, maintenanceFee: 2, packagingBigPrice: 3, packagingSmallPrice: 2 });
    store.setOrderType('room_delivery');

    store.addItem({
      id: 'prod-102',
      name: 'Paneer Butter Masala',
      price: 150,
      veg: true,
      image: '/paneer.jpg',
      packagingBigQty: 2,
      packagingSmallQty: 2,
    }, 1);

    expect(store.subtotal()).toBe(150);
    expect(store.deliveryFee()).toBe(15);
    expect(store.maintenanceFee()).toBe(2);
    expect(store.packagingCharge()).toBe(10); // 1 * (2*3 + 2*2) = 10
    expect(store.total()).toBe(177); // 150 + 15 + 2 + 10
  });

  it('Zustand cart syncPrices updates stored cart items when fresh menu prices are received', () => {
    const store = useCartStore.getState();
    store.clearCart();

    // Add item at old price 100
    store.addItem({
      id: 'prod-101',
      name: 'Chicken Roll',
      price: 100,
      veg: false,
      image: '/roll.jpg',
    }, 2);

    expect(store.subtotal()).toBe(200);

    // Sync with fresh menu where price is 125
    store.syncPrices([
      {
        id: 'prod-101',
        name: 'Chicken Roll Special',
        price: 125,
        img: '/roll-new.jpg',
        veg: false,
      },
    ]);

    const updatedItems = useCartStore.getState().items;
    expect(updatedItems[0].price).toBe(125);
    expect(updatedItems[0].name).toBe('Chicken Roll Special');
    expect(useCartStore.getState().subtotal()).toBe(250); // 125 * 2
  });
});
