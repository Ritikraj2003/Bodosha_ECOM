import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { groupDeliveriesByDay, dayKey, dayLabel } from '@/features/delivery/lib/history';
import type { DeliveryHistoryEntry } from '@/features/delivery/types';

function entry(id: string, deliveredAt: string | null, total: number, trackingCode: string): DeliveryHistoryEntry {
  return {
    assignment: {
      id,
      order_id: `order-${id}`,
      delivery_partner_id: 'partner-1',
      status: 'delivered',
      assigned_at: '',
      picked_up_at: null,
      delivered_at: deliveredAt,
      delivery_notes: null,
      customer_rating: null,
      qr_token_hash: null,
      otp_value: null,
      otp_hash: null,
      otp_expires_at: null,
      otp_verified_at: null,
      otp_attempts: 0,
    },
    order: deliveredAt
      ? ({
          tracking_code: trackingCode,
          total: String(total),
          order_items: [{ quantity: 1, unit_price: String(total), name: 'Test' }],
        } as unknown as DeliveryHistoryEntry['order'])
      : null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 3, 10, 0)); // Mon 3 Aug 2026, local
});

afterEach(() => {
  vi.useRealTimers();
});

describe('delivery history day grouping', () => {
  it('computes the local day key', () => {
    expect(dayKey(new Date(2026, 7, 3, 23, 59))).toBe('2026-08-03');
    expect(dayKey(new Date(2026, 7, 15, 0, 1))).toBe('2026-08-15');
  });

  it('labels today, yesterday and older dates', () => {
    expect(dayLabel('2026-08-03')).toBe('Today');
    expect(dayLabel('2026-08-02')).toBe('Yesterday');
    expect(dayLabel('2026-07-28')).toMatch(/Tue/i);
  });

  it('groups entries by day, newest day first', () => {
    const entries = [
      entry('a', new Date(2026, 7, 1, 9, 0).toISOString(), 100, 'DD-A'),
      entry('b', new Date(2026, 7, 3, 12, 0).toISOString(), 250, 'DD-B'),
      entry('c', new Date(2026, 7, 3, 18, 30).toISOString(), 50, 'DD-C'),
      entry('d', new Date(2026, 7, 2, 15, 0).toISOString(), 75, 'DD-D'),
    ];
    const groups = groupDeliveriesByDay(entries);
    expect(groups.map((g) => g.key)).toEqual(['2026-08-03', '2026-08-02', '2026-08-01']);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Yesterday');
  });

  it('sums the total value per day', () => {
    const entries = [
      entry('a', new Date(2026, 7, 3, 12, 0).toISOString(), 250, 'DD-A'),
      entry('b', new Date(2026, 7, 3, 18, 30).toISOString(), 50, 'DD-B'),
      entry('c', new Date(2026, 7, 2, 15, 0).toISOString(), 75, 'DD-C'),
    ];
    const groups = groupDeliveriesByDay(entries);
    expect(groups[0].totalValue).toBe(300);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].totalValue).toBe(75);
  });

  it('skips entries without a delivered time', () => {
    const groups = groupDeliveriesByDay([entry('a', null, 100, 'DD-A')]);
    expect(groups).toHaveLength(0);
  });
});
