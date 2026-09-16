import { createServiceClient } from '@/infrastructure/supabase/service';
import type { DeliveryAssignment, DeliveryPartnerRow } from '../types';
import type { Order } from '@/features/orders/types';

const ORDER_EMBED = 'orders!delivery_assignments_order_id_fkey(*, order_items(*))';

// Delivery partners must never receive the OTP value or hash — it is shown only to the customer
function sanitizeAssignment<T extends { otp_value?: unknown; otp_hash?: unknown }>(row: T): Omit<T, 'otp_value' | 'otp_hash'> {
  const { otp_value, otp_hash, ...safe } = row;
  void otp_value;
  void otp_hash;
  return safe;
}

export const deliveryRepository = {
  async getPartnerByUserId(userId: string) {
    const supabase = createServiceClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('delivery_partners')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    return data as DeliveryPartnerRow | null;
  },

  async getActiveAssignments(partnerId: string) {
    const supabase = createServiceClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from('delivery_assignments')
      .select(`*, ${ORDER_EMBED}`)
      .eq('delivery_partner_id', partnerId)
      .in('status', ['assigned', 'picked_up', 'in_transit'])
      .order('assigned_at', { ascending: false });
    return (data ?? []).map(sanitizeAssignment) as Array<Omit<DeliveryAssignment, 'otp_value' | 'otp_hash'> & { orders: Order | null }>;
  },

  async getDeliveredToday(partnerId: string) {
    const supabase = createServiceClient();
    if (!supabase) return { count: 0, value: 0, rows: [] };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('delivery_assignments')
      .select(`*, ${ORDER_EMBED}`)
      .eq('delivery_partner_id', partnerId)
      .eq('status', 'delivered')
      .gte('delivered_at', startOfDay.toISOString())
      .order('delivered_at', { ascending: false })
      .limit(50);
    const rows = (data ?? []).map(sanitizeAssignment) as Array<Omit<DeliveryAssignment, 'otp_value' | 'otp_hash'> & { orders: Order | null }>;
    return {
      count: rows.length,
      value: rows.reduce((sum, r) => sum + Number(r.orders?.total ?? 0), 0),
      rows,
    };
  },

  async getDeliveredHistory(partnerId: string, limit = 500) {
    const supabase = createServiceClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from('delivery_assignments')
      .select(`*, ${ORDER_EMBED}`)
      .eq('delivery_partner_id', partnerId)
      .eq('status', 'delivered')
      .not('delivered_at', 'is', null)
      .order('delivered_at', { ascending: false })
      .limit(limit);
    return (data ?? []).map(sanitizeAssignment) as Array<Omit<DeliveryAssignment, 'otp_value' | 'otp_hash'> & { orders: Order | null }>;
  },

  async getDeliveryStats(partnerId: string) {
    const empty = { today: { count: 0, value: 0 }, week: { count: 0, value: 0 }, total: { count: 0, value: 0 } };
    const supabase = createServiceClient();
    if (!supabase) return empty;
    const { data } = await supabase
      .from('delivery_assignments')
      .select('delivered_at, orders!delivery_assignments_order_id_fkey(total)')
      .eq('delivery_partner_id', partnerId)
      .eq('status', 'delivered')
      .not('delivered_at', 'is', null)
      .limit(2000);
    const rows = (data ?? []) as Array<{ delivered_at: string | null; orders: Array<{ total: number | string }> | null }>;

    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startWeek = new Date(startToday);
    const dow = startWeek.getDay();
    startWeek.setDate(startWeek.getDate() - (dow === 0 ? 6 : dow - 1));

    const stats = {
      today: { count: 0, value: 0 },
      week: { count: 0, value: 0 },
      total: { count: 0, value: 0 },
    };
    for (const row of rows) {
      if (!row.delivered_at) continue;
      const ts = new Date(row.delivered_at).getTime();
      const value = Number(row.orders?.[0]?.total ?? 0);
      stats.total.count += 1;
      stats.total.value += value;
      if (ts >= startToday.getTime()) {
        stats.today.count += 1;
        stats.today.value += value;
      }
      if (ts >= startWeek.getTime()) {
        stats.week.count += 1;
        stats.week.value += value;
      }
    }
    return stats;
  },

  async getAssignmentByOrderId(orderId: string) {
    const supabase = createServiceClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('delivery_assignments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    return data as DeliveryAssignment | null;
  },

  async getOrderByTrackingCode(trackingCode: string) {
    const supabase = createServiceClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('tracking_code', trackingCode)
      .maybeSingle();
    return data as Order | null;
  },
};
