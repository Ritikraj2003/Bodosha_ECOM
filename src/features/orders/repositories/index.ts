import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import type { Order, OrderStatus, OrdersFilter, OrdersResponse, PaymentStatus } from '../types';
import { notifyOrderStatusPush, sendPushToDeliveryPartners } from '@/lib/push';

export class OrderRepository {
  async findById(orderId: string): Promise<Order | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();
    return data;
  }

  async findByRestaurant(restaurantId: string, filter: OrdersFilter = {}): Promise<OrdersResponse> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return { orders: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    const { status, search, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc' } = filter;
    let query = supabase
      .from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .eq('restaurant_id', restaurantId);
    if (status && status !== 'all') query = query.eq('status', status);
    if (search) query = query.or(`tracking_code.ilike.%${search}%,customer_name.ilike.%${search}%`);
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
    const { data, count } = await query;
    if (!data) return { orders: [], total: 0, page, pageSize, totalPages: 0 };
    return {
      orders: data as unknown as Order[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async updateStatus(orderId: string, status: OrderStatus, note?: string): Promise<Order | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const order = await this.findById(orderId);
    if (!order) return null;
    const historyEntry = { status, timestamp: new Date().toISOString(), note: note ?? null };
    const existingHistory = (order.status_history ?? []) as Array<Record<string, unknown>>;
    const statusHistory = [...existingHistory, historyEntry];
    const timestamps: Partial<Record<string, string>> = {};
    if (status === 'accepted') timestamps.accepted_at = new Date().toISOString();
    if (status === 'preparing') timestamps.prepared_at = new Date().toISOString();
    if (status === 'completed' || status === 'delivered') timestamps.delivered_at = new Date().toISOString();
    if (status === 'cancelled') timestamps.cancelled_at = new Date().toISOString();
    if (status === 'declined') timestamps.cancelled_at = new Date().toISOString();
    let paymentStatus: PaymentStatus | undefined = (status === 'completed' || status === 'delivered') ? 'confirmed' :
      (status === 'cancelled' || status === 'declined') && order.payment_method === 'cod' ? 'failed' : undefined;

    if ((status === 'cancelled' || status === 'declined') && order.payment_status === 'confirmed' && order.payment_method !== 'cod') {
      const { processOrderRefundIfEligible } = await import('@/features/orders/actions/customer');
      const refundRes = await processOrderRefundIfEligible(order as any, note || 'Cancelled by merchant');
      if (refundRes.refunded) {
        paymentStatus = 'refunded';
      }
    }

    const updateData: Record<string, unknown> = {
      status,
      status_history: statusHistory,
      ...timestamps,
    };
    if (paymentStatus) updateData.payment_status = paymentStatus;
    if (note && (status === 'cancelled' || status === 'declined')) updateData.cancellation_reason = note;
    const { data } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select('*, order_items(*)')
      .single();

    if (data?.user_id) {
      notifyOrderStatusPush({
        userId: data.user_id,
        orderId: data.id,
        trackingCode: data.tracking_code,
        status,
        note,
      }).catch((err) => console.error('Error sending order status push:', err));
    }

    // When order is marked ready, notify all Delivery Partners
    if (status === 'ready' && data) {
      sendPushToDeliveryPartners({
        title: `🛵 Order #${data.tracking_code} is Ready!`,
        body: `Food is packed and ready for delivery pickup from Dilip Da kitchen.`,
        url: `/dashboard/delivery`,
        tag: `delivery-ready-${data.id}`,
      }).catch((err) => console.error('Error sending delivery partner push:', err));
    }

    if (data && (status === 'completed' || status === 'delivered' || status === 'cancelled' || status === 'declined')) {
      const assignmentStatus = (status === 'delivered' || status === 'completed') ? 'delivered' : 'failed';
      const { createServiceClient } = await import('@/infrastructure/supabase/service');
      const serviceClient = createServiceClient();
      if (serviceClient) {
        const { data: assignment } = await serviceClient
          .from('delivery_assignments')
          .select('id, delivery_partner_id')
          .eq('order_id', orderId)
          .maybeSingle();

        if (assignment) {
          await serviceClient
            .from('delivery_assignments')
            .update({ status: assignmentStatus, delivered_at: new Date().toISOString() })
            .eq('id', assignment.id);
          
          await serviceClient
            .from('delivery_partners')
            .update({ is_available: true })
            .eq('id', assignment.delivery_partner_id);
        }
      }
    }

    return data as unknown as Order | null;
  }

  async getOrderCountByStatus(restaurantId: string, status: OrderStatus): Promise<number> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return 0;
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('status', status);
    return count ?? 0;
  }

  async getTodaysRevenue(restaurantId: string): Promise<number> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('orders')
      .select('total')
      .eq('restaurant_id', restaurantId)
      .in('status', ['completed', 'delivered'])
      .gte('created_at', today);
    return (data ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0);
  }

  async getRecentOrders(restaurantId: string, limit = 10): Promise<Order[]> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as unknown as Order[];
  }
}

export const orderRepository = new OrderRepository();
