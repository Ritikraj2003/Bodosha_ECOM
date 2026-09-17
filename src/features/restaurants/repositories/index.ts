import { query } from '@/infrastructure/db';
import type { Restaurant, RestaurantSettings, MerchantDashboard, RevenueOverview } from '../types';

export class RestaurantRepository {
  async findByOwnerId(ownerId: string): Promise<Restaurant | null> {
    const res = await query(`
      SELECT * FROM public.restaurants
      WHERE owner_id = $1 AND deleted_at IS NULL
      LIMIT 1
    `, [ownerId]);
    return (res.rows[0] as Restaurant) || null;
  }

  async findById(id: string): Promise<Restaurant | null> {
    const res = await query(`
      SELECT * FROM public.restaurants
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
    `, [id]);
    return (res.rows[0] as Restaurant) || null;
  }

  async getSettings(restaurantId: string): Promise<RestaurantSettings | null> {
    const res = await query(`
      SELECT * FROM public.restaurant_settings
      WHERE restaurant_id = $1
      LIMIT 1
    `, [restaurantId]);
    return (res.rows[0] as RestaurantSettings) || null;
  }

  async updateSettings(restaurantId: string, updates: Partial<RestaurantSettings>): Promise<RestaurantSettings | null> {
    const keys = Object.keys(updates);
    if (keys.length === 0) return this.getSettings(restaurantId);
    
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = Object.values(updates);
    const res = await query(`
      UPDATE public.restaurant_settings
      SET ${setClauses}, updated_at = NOW()
      WHERE restaurant_id = $1
      RETURNING *
    `, [restaurantId, ...values]);
    return (res.rows[0] as RestaurantSettings) || null;
  }

  async getDashboard(restaurantId: string): Promise<MerchantDashboard | null> {
    try {
      const statsRes = await query(`
        SELECT 
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(total), 0)::numeric AS total_revenue,
          COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed', 'preparing'))::int AS pending_orders,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders
        FROM public.orders
        WHERE restaurant_id = $1 AND deleted_at IS NULL;
      `, [restaurantId]);

      const topProds = await query(`
        SELECT 
          p.id, p.name, p.price,
          COUNT(oi.id)::int AS total_sold,
          COALESCE(SUM(oi.total_price), 0)::numeric AS total_revenue
        FROM public.order_items oi
        JOIN public.products p ON oi.product_id = p.id
        WHERE p.restaurant_id = $1
        GROUP BY p.id, p.name, p.price
        ORDER BY total_sold DESC
        LIMIT 5;
      `, [restaurantId]);

      const s = statsRes.rows[0] || {};
      return {
        total_orders: Number(s.total_orders) || 0,
        total_revenue: Number(s.total_revenue) || 0,
        pending_orders: Number(s.pending_orders) || 0,
        delivered_orders: Number(s.delivered_orders) || 0,
        popular_items: topProds.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          price: Number(r.price) || 0,
          total_sold: Number(r.total_sold) || 0,
          revenue: Number(r.total_revenue) || 0,
        })),
      } as unknown as MerchantDashboard;
    } catch (e) {
      console.error('getDashboard error:', e);
      return null;
    }
  }

  async getRevenueOverview(restaurantId: string, days = 30): Promise<RevenueOverview> {
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const res = await query(`
        SELECT created_at, total, status
        FROM public.orders
        WHERE restaurant_id = $1
          AND status IN ('completed', 'delivered')
          AND created_at >= $2
        ORDER BY created_at ASC;
      `, [restaurantId, since]);

      const orders = res.rows;
      const dailyMap = new Map<string, { revenue: number; orders: number }>();
      const weeklyMap = new Map<string, { revenue: number; orders: number }>();
      const monthlyMap = new Map<string, { revenue: number; orders: number }>();

      for (const o of orders) {
        const d = new Date(o.created_at);
        const day = d.toISOString().slice(0, 10);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const week = weekStart.toISOString().slice(0, 10);
        const month = d.toISOString().slice(0, 7);
        const r = Number(o.total) || 0;

        dailyMap.set(day, dailyMap.get(day) ?? { revenue: 0, orders: 0 });
        dailyMap.get(day)!.revenue += r;
        dailyMap.get(day)!.orders += 1;

        weeklyMap.set(week, weeklyMap.get(week) ?? { revenue: 0, orders: 0 });
        weeklyMap.get(week)!.revenue += r;
        weeklyMap.get(week)!.orders += 1;

        monthlyMap.set(month, monthlyMap.get(month) ?? { revenue: 0, orders: 0 });
        monthlyMap.get(month)!.revenue += r;
        monthlyMap.get(month)!.orders += 1;
      }

      return {
        daily: Array.from(dailyMap.entries()).map(([date, v]) => ({ date, ...v })),
        weekly: Array.from(weeklyMap.entries()).map(([week, v]) => ({ week, ...v })),
        monthly: Array.from(monthlyMap.entries()).map(([month, v]) => ({ month, ...v })),
      };
    } catch (e) {
      console.error('getRevenueOverview error:', e);
      return { daily: [], weekly: [], monthly: [] };
    }
  }
}

export const restaurantRepository = new RestaurantRepository();
