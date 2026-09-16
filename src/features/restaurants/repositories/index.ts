import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { createServiceClient } from '@/infrastructure/supabase/service';
import type { Restaurant, RestaurantSettings, MerchantDashboard, RevenueOverview } from '../types';

const RESTAURANT_COLUMNS = 'id, owner_id, name, slug, description, cuisine_type, phone, email, address_line1, address_line2, city, state, postal_code, latitude, longitude, cover_image, logo_url, opening_time, closing_time, delivery_fee, min_order_amount, delivery_radius_km, is_active, is_open, status, created_at, updated_at, deleted_at';

const SETTINGS_COLUMNS = 'id, restaurant_id, prep_time_minutes, max_orders_slot, allow_preorder, allow_scheduled, gst_number, fssai_license, bank_account, upi_id, commission_rate, created_at, updated_at';

export class RestaurantRepository {
  async findByOwnerId(ownerId: string): Promise<Restaurant | null> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return null;
    const { data } = await supabase
      .from('restaurants')
      .select(RESTAURANT_COLUMNS)
      .eq('owner_id', ownerId)
      .is('deleted_at', null)
      .maybeSingle();
    return data;
  }

  async findById(id: string): Promise<Restaurant | null> {
    const supabase = createServiceClient() ?? (await createServerSupabaseClient());
    if (!supabase) return null;
    const { data } = await supabase
      .from('restaurants')
      .select(RESTAURANT_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    return data;
  }

  async getSettings(restaurantId: string): Promise<RestaurantSettings | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('restaurant_settings')
      .select(SETTINGS_COLUMNS)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    return data;
  }

  async updateSettings(restaurantId: string, updates: Partial<RestaurantSettings>): Promise<RestaurantSettings | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('restaurant_settings')
      .update(updates)
      .eq('restaurant_id', restaurantId)
      .select(SETTINGS_COLUMNS)
      .single();
    return data;
  }

  async getDashboard(restaurantId: string): Promise<MerchantDashboard | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.rpc('get_merchant_dashboard', { p_restaurant_id: restaurantId });
    return data as MerchantDashboard | null;
  }

  async getRevenueOverview(restaurantId: string, days = 30): Promise<RevenueOverview> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return { daily: [], weekly: [], monthly: [] };
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data: orders } = await supabase
      .from('orders')
      .select('created_at, total, status')
      .eq('restaurant_id', restaurantId)
      .in('status', ['completed', 'delivered'])
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    if (!orders) return { daily: [], weekly: [], monthly: [] };
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
      const r = o.total ?? 0;
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
  }
}

export const restaurantRepository = new RestaurantRepository();
