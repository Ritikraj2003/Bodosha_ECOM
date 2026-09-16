import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCustomerDeliveryInfo, startPickupByTrackingCode, generateOtpForOrder } from '@/features/delivery/actions';
import { getStatusButtons } from '@/lib/notifications';

// Mock dependencies
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({
  maybeSingle: mockMaybeSingle,
  eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })),
  select: vi.fn(() => ({ maybeSingle: mockMaybeSingle })),
}));
const mockSelect = vi.fn(() => ({
  eq: mockEq,
}));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock('@/infrastructure/supabase/service', () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock('@/features/auth/actions', () => ({
  getServerSession: vi.fn(async () => ({ user: { id: 'cust-123', email: 'cust@example.com' } })),
  getServerProfile: vi.fn(async () => ({ profile: { role: 'delivery' } })),
}));

const mockGetAssignmentByOrderId = vi.fn(async () => null as unknown as import('@/features/delivery/types').DeliveryAssignment | null);

vi.mock('@/features/delivery/repositories', () => ({
  deliveryRepository: {
    getAssignmentByOrderId: () => mockGetAssignmentByOrderId(),
  },
}));

describe('Order Type Delivery Isolation Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCustomerDeliveryInfo returns hasDelivery: false and null assignment/partner for takeaway orders', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'ord-takeaway-1',
        user_id: 'cust-123',
        status: 'ready',
        payment_method: 'upi',
        payment_status: 'confirmed',
        delivery_partner_id: null,
        total: 150,
        order_type: 'takeaway',
      },
      error: null,
    });

    const res = await getCustomerDeliveryInfo('ord-takeaway-1');
    expect(res.success).toBe(true);
    if (res.success && res.data) {
      expect(res.data.hasDelivery).toBe(false);
      expect(res.data.assignment).toBeNull();
      expect(res.data.partner).toBeNull();
      expect(res.data.orderStatus).toBe('ready');
    }
  });

  it('startPickupByTrackingCode rejects takeaway and in-store orders', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'ord-takeaway-2',
        status: 'ready',
        delivery_partner_id: null,
        order_type: 'takeaway',
      },
      error: null,
    });

    const res = await startPickupByTrackingCode('DD-TAKEAWAY1');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Takeaway and in-store orders cannot be claimed');
  });

  it('generateOtpForOrder rejects takeaway orders', async () => {
    mockGetAssignmentByOrderId.mockResolvedValueOnce({
      delivery_partner_id: 'cust-123',
      otp_verified_at: null,
    });

    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'ord-takeaway-3',
        status: 'out_for_delivery',
        payment_method: 'upi',
        payment_status: 'confirmed',
        tracking_code: 'DD-TEST123',
        order_type: 'takeaway',
      },
      error: null,
    });

    const res = await generateOtpForOrder('ord-takeaway-3');
    expect(res.success).toBe(false);
    expect(res.error).toContain('not applicable for takeaway');
  });

  it('getStatusButtons for takeaway returns direct collected/complete button on ready', () => {
    const takeawayButtons = getStatusButtons('ord-1', 'ready', 'takeaway');
    expect(takeawayButtons.length).toBe(1);
    expect(takeawayButtons[0][0].text).toContain('Collected / Complete');
    expect(takeawayButtons[0][0].callback_data).toBe('delivered:ord-1');

    // For delivery orders, ready status allows out_for_delivery
    const deliveryButtons = getStatusButtons('ord-2', 'ready', 'room_delivery');
    expect(deliveryButtons.length).toBe(1);
    const actions = deliveryButtons[0].map((b) => b.text);
    expect(actions).toContain('🚚 Out for Delivery');
  });
});
