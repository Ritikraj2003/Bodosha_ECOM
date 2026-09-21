import { createServiceClient } from '@/infrastructure/supabase/service';
import { query } from '@/infrastructure/db';
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
  async getPartnerByUserId(userId: string): Promise<DeliveryPartnerRow | null> {
    try {
      const res = await query<DeliveryPartnerRow>(
        `SELECT 
           id,
           user_id,
           COALESCE(vehicle_type, 'Bike') AS vehicle_type,
           license_plate,
           COALESCE(is_available, true) AS is_available,
           COALESCE(is_online, true) AS is_online,
           COALESCE(total_deliveries, 0) AS total_deliveries,
           COALESCE(rating, 5.0) AS rating
         FROM public.delivery_partners 
         WHERE user_id = $1 OR id = $1 LIMIT 1`,
        [userId]
      );
      if (res.rows[0]) return res.rows[0];

      // Auto-provision if user exists and has delivery role
      const userRes = await query<{ role: string }>(
        `SELECT role FROM public.users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      if (userRes.rows[0]?.role === 'delivery') {
        const insertRes = await query<DeliveryPartnerRow>(
          `INSERT INTO public.delivery_partners (id, user_id, vehicle_type, vehicle_no, license_plate, is_available, is_online, total_deliveries, rating, created_at, updated_at)
           VALUES ($1, $1, 'Bike', null, null, true, true, 0, 5.0, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, is_available = true, updated_at = NOW()
           RETURNING id, user_id, vehicle_type, license_plate, is_available, is_online, total_deliveries, rating`,
          [userId]
        );
        return insertRes.rows[0] || null;
      }

      return null;
    } catch (err) {
      console.error('getPartnerByUserId error:', err);
      return null;
    }
  },

  async updatePartnerVehicle(userId: string, vehicleType: string, licensePlate: string | null): Promise<DeliveryPartnerRow | null> {
    try {
      const cleanPlate = (licensePlate || '').trim().toUpperCase() || null;
      const cleanType = (vehicleType || '').trim() || 'Bike';

      const res = await query<DeliveryPartnerRow>(
        `INSERT INTO public.delivery_partners (id, user_id, vehicle_type, vehicle_no, license_plate, is_available, is_online, total_deliveries, rating, created_at, updated_at)
         VALUES ($1, $1, $2, $3, $3, true, true, 0, 5.0, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET 
           user_id = EXCLUDED.user_id,
           vehicle_type = EXCLUDED.vehicle_type,
           vehicle_no = EXCLUDED.vehicle_no,
           license_plate = EXCLUDED.license_plate,
           is_available = true,
           updated_at = NOW()
         RETURNING id, user_id, vehicle_type, license_plate, is_available, is_online, total_deliveries, rating`,
        [userId, cleanType, cleanPlate]
      );
      return res.rows[0] || null;
    } catch (err) {
      console.error('updatePartnerVehicle error:', err);
      return null;
    }
  },

  async getActiveAssignments(partnerId: string) {
    try {
      const res = await query<any>(
        `SELECT 
           da.*,
           to_jsonb(o.*) || jsonb_build_object(
             'total', COALESCE(o.total, o.total_amount, 0),
             'order_items', COALESCE(
               (SELECT jsonb_agg(jsonb_build_object(
                 'id', oi.id,
                 'product_name', oi.product_name,
                 'quantity', oi.quantity,
                 'unit_price', oi.product_price,
                 'subtotal', oi.item_total
               )) FROM public.order_items oi WHERE oi.order_id = o.id),
               '[]'::jsonb
             )
           ) AS orders
         FROM public.delivery_assignments da
         LEFT JOIN public.orders o ON o.id = da.order_id
         WHERE da.delivery_partner_id = $1
           AND da.status IN ('assigned', 'picked_up', 'in_transit')
         ORDER BY da.assigned_at DESC`,
        [partnerId]
      );
      return (res.rows || []).map(sanitizeAssignment) as Array<Omit<DeliveryAssignment, 'otp_value' | 'otp_hash'> & { orders: Order | null }>;
    } catch (err) {
      console.error('getActiveAssignments error:', err);
      return [];
    }
  },

  async getDeliveredToday(partnerId: string) {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const res = await query<any>(
        `SELECT 
           da.*,
           to_jsonb(o.*) || jsonb_build_object(
             'total', COALESCE(o.total, o.total_amount, 0),
             'order_items', COALESCE(
               (SELECT jsonb_agg(jsonb_build_object(
                 'id', oi.id,
                 'product_name', oi.product_name,
                 'quantity', oi.quantity,
                 'unit_price', oi.product_price,
                 'subtotal', oi.item_total
               )) FROM public.order_items oi WHERE oi.order_id = o.id),
               '[]'::jsonb
             )
           ) AS orders
         FROM public.delivery_assignments da
         LEFT JOIN public.orders o ON o.id = da.order_id
         WHERE da.delivery_partner_id = $1
           AND da.status = 'delivered'
           AND COALESCE(da.delivered_at, da.completed_at) >= $2
         ORDER BY COALESCE(da.delivered_at, da.completed_at) DESC
         LIMIT 50`,
        [partnerId, startOfDay.toISOString()]
      );
      const rows = (res.rows || []).map(sanitizeAssignment) as Array<Omit<DeliveryAssignment, 'otp_value' | 'otp_hash'> & { orders: Order | null }>;
      return {
        count: rows.length,
        value: rows.reduce((sum, r) => sum + Number(r.orders?.total ?? 0), 0),
        rows,
      };
    } catch (err) {
      console.error('getDeliveredToday error:', err);
      return { count: 0, value: 0, rows: [] };
    }
  },

  async getDeliveredHistory(partnerId: string, limit = 500) {
    try {
      const res = await query<any>(
        `SELECT 
           da.*,
           to_jsonb(o.*) || jsonb_build_object(
             'total', COALESCE(o.total, o.total_amount, 0),
             'order_items', COALESCE(
               (SELECT jsonb_agg(jsonb_build_object(
                 'id', oi.id,
                 'product_name', oi.product_name,
                 'quantity', oi.quantity,
                 'unit_price', oi.product_price,
                 'subtotal', oi.item_total
               )) FROM public.order_items oi WHERE oi.order_id = o.id),
               '[]'::jsonb
             )
           ) AS orders
         FROM public.delivery_assignments da
         LEFT JOIN public.orders o ON o.id = da.order_id
         WHERE da.delivery_partner_id = $1
           AND da.status = 'delivered'
           AND (da.delivered_at IS NOT NULL OR da.completed_at IS NOT NULL)
         ORDER BY COALESCE(da.delivered_at, da.completed_at) DESC
         LIMIT $2`,
        [partnerId, limit]
      );
      return (res.rows || []).map(sanitizeAssignment) as Array<Omit<DeliveryAssignment, 'otp_value' | 'otp_hash'> & { orders: Order | null }>;
    } catch (err) {
      console.error('getDeliveredHistory error:', err);
      return [];
    }
  },

  async getDeliveryStats(partnerId: string) {
    const stats = {
      today: { count: 0, value: 0 },
      week: { count: 0, value: 0 },
      total: { count: 0, value: 0 },
    };
    try {
      const res = await query<{ delivered_at: string | null; total: number | string }>(
        `SELECT 
           COALESCE(da.delivered_at, da.completed_at) AS delivered_at,
           COALESCE(o.delivery_fee, 0) AS total
         FROM public.delivery_assignments da
         LEFT JOIN public.orders o ON o.id = da.order_id
         WHERE da.delivery_partner_id = $1
           AND da.status = 'delivered'
           AND (da.delivered_at IS NOT NULL OR da.completed_at IS NOT NULL)
         LIMIT 2000`,
        [partnerId]
      );
      const rows = res.rows || [];

      const now = new Date();
      const startToday = new Date(now);
      startToday.setHours(0, 0, 0, 0);
      const startWeek = new Date(startToday);
      const dow = startWeek.getDay();
      startWeek.setDate(startWeek.getDate() - (dow === 0 ? 6 : dow - 1));

      for (const row of rows) {
        if (!row.delivered_at) continue;
        const ts = new Date(row.delivered_at).getTime();
        const value = Number(row.total ?? 0);
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
    } catch (err) {
      console.error('getDeliveryStats error:', err);
      return stats;
    }
  },

  async getAssignmentByOrderId(orderId: string) {
    try {
      const res = await query<DeliveryAssignment>(
        `SELECT * FROM public.delivery_assignments WHERE order_id = $1 LIMIT 1`,
        [orderId]
      );
      return res.rows[0] || null;
    } catch {
      return null;
    }
  },

  async getOrderByTrackingCode(trackingCode: string) {
    try {
      const res = await query<Order>(
        `SELECT * FROM public.orders WHERE tracking_code = $1 LIMIT 1`,
        [trackingCode]
      );
      return res.rows[0] || null;
    } catch {
      return null;
    }
  },
};
