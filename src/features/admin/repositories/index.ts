import { createAdminClient } from '@/infrastructure/supabase/admin';
import { query } from '@/infrastructure/db';
import type {
  DashboardStats, AdminStudent, AdminMerchant, AdminOrder, AdminUser,
  CreditAccountAdmin, PaymentAdmin, AuditEntry, SystemSetting,
  PaginatedResponse, AdminFilter, ActivityEntry, DeliveryPartnerAdmin,
} from '../types';
import { notifyOrderStatusPush, sendPushToUser, sendPushToDeliveryPartners } from '@/lib/push';

export class AdminRepository {
  async getDashboardStats(filter?: { fromDate?: string; toDate?: string }): Promise<DashboardStats | null> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const fromDate = filter?.fromDate || null;
      const toDate = filter?.toDate || null;
      const fromDateStr = fromDate ? fromDate.slice(0, 10) : null;
      const toDateStr = toDate ? toDate.slice(0, 10) : null;

      const statsRes = await query(`
        SELECT
          (SELECT COUNT(*) FROM public.users WHERE deleted_at IS NULL)::int AS total_users,
          (SELECT COUNT(*) FROM public.users WHERE role = 'student' AND deleted_at IS NULL)::int AS total_students,
          (SELECT COUNT(*) FROM public.users WHERE role = 'merchant' AND deleted_at IS NULL)::int AS total_merchants,
          (SELECT COUNT(*) FROM public.restaurants WHERE deleted_at IS NULL)::int AS total_restaurants,
          (SELECT COUNT(*) FROM public.orders WHERE ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at <= $2))::int AS total_orders,
          (SELECT COUNT(*) FROM public.orders WHERE status IN ('pending', 'accepted', 'preparing', 'ready', 'assigned', 'out_for_delivery') AND ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at <= $2))::int AS active_orders,
          (SELECT COUNT(*) FROM public.orders WHERE status IN ('completed', 'delivered') AND ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at <= $2))::int AS completed_orders,
          (SELECT COUNT(*) FROM public.orders WHERE status = 'cancelled' AND ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at <= $2))::int AS cancelled_orders,
          (SELECT COALESCE(SUM(total_amount), 0) FROM public.orders WHERE status IN ('completed', 'delivered') AND ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at <= $2))::numeric AS total_revenue,
          (SELECT COALESCE(SUM(total_amount), 0) FROM public.orders WHERE status IN ('completed', 'delivered') AND created_at >= $3)::numeric AS today_revenue,
          (SELECT COALESCE(SUM(total_amount), 0) FROM public.orders WHERE status IN ('completed', 'delivered') AND created_at >= $4)::numeric AS weekly_revenue,
          (SELECT COALESCE(SUM(total_amount), 0) FROM public.orders WHERE status IN ('completed', 'delivered') AND created_at >= $5)::numeric AS monthly_revenue,
          (SELECT COALESCE(SUM(used_credit), 0) FROM public.credit_accounts)::numeric AS bnpl_outstanding,
          (SELECT COALESCE(SUM(credit_limit), 0) FROM public.credit_accounts)::numeric AS total_credit_issued,
          (SELECT COALESCE(SUM(amount), 0) FROM public.credit_repayments WHERE status = 'paid')::numeric AS total_credit_repaid,
          (SELECT COUNT(*) FROM public.credit_repayments WHERE status = 'pending' AND due_date < $3)::int AS total_overdue_accounts,
          (SELECT COUNT(*) FROM public.restaurants WHERE is_active = true AND deleted_at IS NULL)::int AS active_merchants,
          (SELECT COUNT(*) FROM public.restaurants WHERE is_active = false AND deleted_at IS NULL)::int AS pending_merchant_approvals,
          (SELECT COALESCE(SUM(amount), 0) FROM public.expense_transactions WHERE type = 'expense' AND ($6::date IS NULL OR transaction_date >= $6) AND ($7::date IS NULL OR transaction_date <= $7))::numeric AS total_expenses;
      `, [fromDate, toDate, today, weekStart.toISOString(), monthStart.toISOString(), fromDateStr, toDateStr]);

      const s = statsRes.rows[0] || {};

      const activityRes = await query(`
        SELECT a.id, a.action, a.table_name, a.record_id, a.created_at, a.user_id AS changed_by,
               u.full_name AS user_name
        FROM public.audit_logs a
        LEFT JOIN public.users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
        LIMIT 10
      `);

      const recentActivity: ActivityEntry[] = (activityRes.rows || []).map((r: any) => ({
        id: r.id,
        action: r.action,
        entity_type: r.table_name,
        entity_id: r.record_id ?? '',
        user_name: r.user_name || 'System',
        created_at: r.created_at,
      }));

      // Order type stats
      const orderTypeRes = await query(`
        SELECT COALESCE(order_type, 'room_delivery') AS type, COUNT(*)::int AS count
        FROM public.orders
        WHERE ($1::timestamptz IS NULL OR created_at >= $1)
          AND ($2::timestamptz IS NULL OR created_at <= $2)
        GROUP BY COALESCE(order_type, 'room_delivery')
      `, [fromDate, toDate]);

      const orderTypeLabels: Record<string, string> = {
        room_delivery: 'Hostel Delivery',
        takeaway: 'Take Away',
        in_store: 'In Store',
        dine_in: 'Dine In',
      };

      const orderTypeCounts: Record<string, number> = {
        room_delivery: 0,
        takeaway: 0,
        in_store: 0,
        dine_in: 0,
      };

      for (const row of orderTypeRes.rows || []) {
        const key = row.type || 'room_delivery';
        orderTypeCounts[key] = (orderTypeCounts[key] || 0) + Number(row.count || 0);
      }

      const order_type_stats = Object.entries(orderTypeCounts).map(([type, count]) => ({
        type,
        label: orderTypeLabels[type] || type,
        count,
      }));

      // Payment type stats
      const paymentTypeRes = await query(`
        SELECT COALESCE(payment_method, 'cash') AS method, COUNT(*)::int AS count
        FROM public.orders
        WHERE ($1::timestamptz IS NULL OR created_at >= $1)
          AND ($2::timestamptz IS NULL OR created_at <= $2)
        GROUP BY COALESCE(payment_method, 'cash')
      `, [fromDate, toDate]);

      const paymentMethodLabels: Record<string, string> = {
        cash: 'Cash / COD',
        upi: 'UPI',
        razorpay: 'Online',
        wallet: 'Wallet',
      };

      const paymentMethodCounts: Record<string, number> = {
        cash: 0,
        upi: 0,
        razorpay: 0,
        wallet: 0,
      };

      for (const row of paymentTypeRes.rows || []) {
        let m = row.method;
        if (m === 'cod') m = 'cash';
        if (m === 'online') m = 'razorpay';
        if (paymentMethodCounts[m] !== undefined) {
          paymentMethodCounts[m] += Number(row.count || 0);
        } else {
          paymentMethodCounts[m] = Number(row.count || 0);
        }
      }

      const payment_type_stats = Object.entries(paymentMethodCounts).map(([method, count]) => ({
        category: paymentMethodLabels[method] || method.toUpperCase(),
        value: count,
      }));

      return {
        total_users: s.total_users ?? 0,
        total_students: s.total_students ?? 0,
        total_merchants: s.total_merchants ?? 0,
        total_restaurants: s.total_restaurants ?? 0,
        total_orders: s.total_orders ?? 0,
        active_orders: s.active_orders ?? 0,
        completed_orders: s.completed_orders ?? 0,
        cancelled_orders: s.cancelled_orders ?? 0,
        total_revenue: Number(s.total_revenue || 0),
        today_revenue: Number(s.today_revenue || 0),
        weekly_revenue: Number(s.weekly_revenue || 0),
        monthly_revenue: Number(s.monthly_revenue || 0),
        bnpl_outstanding: Number(s.bnpl_outstanding || 0),
        total_credit_issued: Number(s.total_credit_issued || 0),
        total_credit_repaid: Number(s.total_credit_repaid || 0),
        total_overdue_accounts: s.total_overdue_accounts ?? 0,
        active_merchants: s.active_merchants ?? 0,
        pending_merchant_approvals: s.pending_merchant_approvals ?? 0,
        total_expenses: Number(s.total_expenses || 0),
        recent_activity: recentActivity,
        order_type_stats,
        payment_type_stats,
      };
    } catch (e) {
      console.error('getDashboardStats error:', e);
      return null;
    }
  }

  async getStudents(filter: AdminFilter = {}): Promise<PaginatedResponse<AdminStudent>> {
    const { search, status, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc' } = filter;

    const whereClauses: string[] = ["u.deleted_at IS NULL", "u.role = 'student'"];
    const params: any[] = [];
    let paramIdx = 1;

    if (status === 'active') {
      whereClauses.push(`u.is_active = true`);
    } else if (status === 'suspended') {
      whereClauses.push(`u.is_active = false`);
    }

    if (search && search.trim()) {
      whereClauses.push(`(u.full_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx} OR u.phone ILIKE $${paramIdx})`);
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }

    const whereStr = `WHERE ${whereClauses.join(' AND ')}`;
    const safeSort = ['created_at', 'full_name', 'email'].includes(sortBy) ? `u.${sortBy}` : 'u.created_at';
    const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countRes = await query(`
      SELECT COUNT(*)::int AS total
      FROM public.users u
      ${whereStr}
    `, params);
    const total = countRes.rows[0]?.total ?? 0;

    const offset = (page - 1) * pageSize;
    const dataParams = [...params, pageSize, offset];
    const dataRes = await query(`
      SELECT 
        u.*,
        to_jsonb(ca.*) AS credit_account,
        to_jsonb(w.*) AS wallet
      FROM public.users u
      LEFT JOIN public.credit_accounts ca ON ca.user_id = u.id
      LEFT JOIN public.wallets w ON w.user_id = u.id
      ${whereStr}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, dataParams);

    return {
      data: dataRes.rows as unknown as AdminStudent[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getUsers(filter: AdminFilter = {}): Promise<PaginatedResponse<AdminUser>> {
    const { search, status, role, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc' } = filter;

    const whereClauses: string[] = ["deleted_at IS NULL AND COALESCE(is_deleted, false) = false AND role != 'student'"];
    const params: any[] = [];
    let paramIdx = 1;

    if (status === 'active') {
      whereClauses.push(`is_active = true`);
    } else if (status === 'suspended') {
      whereClauses.push(`is_active = false`);
    } else if (status === 'deleted') {
      whereClauses[0] = "(is_deleted = true OR deleted_at IS NOT NULL) AND role != 'student'";
    }

    if (role && role !== 'all') {
      whereClauses.push(`role = $${paramIdx++}`);
      params.push(role);
    }

    if (search && search.trim()) {
      whereClauses.push(`(full_name ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR phone ILIKE $${paramIdx})`);
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const safeSort = ['created_at', 'full_name', 'email', 'role'].includes(sortBy) ? sortBy : 'created_at';
    const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countRes = await query(`
      SELECT COUNT(*)::int AS total
      FROM public.users
      ${whereStr}
    `, params);
    const total = countRes.rows[0]?.total ?? 0;

    const offset = (page - 1) * pageSize;
    const dataParams = [...params, pageSize, offset];
    const dataRes = await query(`
      SELECT id, email, full_name, phone, role, is_active, is_deleted, deleted_at, created_at
      FROM public.users
      ${whereStr}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, dataParams);

    return {
      data: dataRes.rows as unknown as AdminUser[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getStudentById(id: string): Promise<AdminStudent | null> {
    const res = await query(`
      SELECT 
        u.*,
        to_jsonb(ca.*) AS credit_account,
        to_jsonb(w.*) AS wallet
      FROM public.users u
      LEFT JOIN public.credit_accounts ca ON ca.user_id = u.id
      LEFT JOIN public.wallets w ON w.user_id = u.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      LIMIT 1
    `, [id]);
    return (res.rows[0] as unknown as AdminStudent) ?? null;
  }

  async updateStudentStatus(id: string, isActive: boolean): Promise<void> {
    await query(`UPDATE public.users SET is_active = $1, updated_at = NOW() WHERE id = $2`, [isActive, id]);
    await query(`UPDATE public.profiles SET is_active = $1, updated_at = NOW() WHERE id = $2`, [isActive, id]);
  }

  async resetStudentVerification(id: string): Promise<void> {
    await query(`UPDATE public.credit_accounts SET verification_status = 'pending', updated_at = NOW() WHERE user_id = $1`, [id]);
  }

  async getMerchants(filter: AdminFilter = {}): Promise<PaginatedResponse<AdminMerchant>> {
    const { search, status, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc' } = filter;

    const whereClauses: string[] = ["u.deleted_at IS NULL", "u.role = 'merchant'"];
    const params: any[] = [];
    let paramIdx = 1;

    if (status === 'active') {
      whereClauses.push(`u.is_active = true`);
    } else if (status === 'suspended') {
      whereClauses.push(`u.is_active = false`);
    }

    if (search && search.trim()) {
      whereClauses.push(`(u.full_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx} OR u.phone ILIKE $${paramIdx})`);
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }

    const whereStr = `WHERE ${whereClauses.join(' AND ')}`;
    const safeSort = ['created_at', 'full_name', 'email'].includes(sortBy) ? `u.${sortBy}` : 'u.created_at';
    const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countRes = await query(`
      SELECT COUNT(*)::int AS total
      FROM public.users u
      ${whereStr}
    `, params);
    const total = countRes.rows[0]?.total ?? 0;

    const offset = (page - 1) * pageSize;
    const dataParams = [...params, pageSize, offset];
    const dataRes = await query(`
      SELECT 
        u.*,
        to_jsonb(r.*) AS restaurant
      FROM public.users u
      LEFT JOIN public.restaurants r ON r.owner_id = u.id
      ${whereStr}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, dataParams);

    return {
      data: dataRes.rows as unknown as AdminMerchant[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getMerchantById(id: string): Promise<AdminMerchant | null> {
    const res = await query(`
      SELECT 
        u.*,
        to_jsonb(r.*) AS restaurant
      FROM public.users u
      LEFT JOIN public.restaurants r ON r.owner_id = u.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      LIMIT 1
    `, [id]);
    return (res.rows[0] as unknown as AdminMerchant) ?? null;
  }

  async approveMerchant(merchantId: string, restaurantId: string): Promise<void> {
    await query(`UPDATE public.restaurants SET status = 'active', updated_at = NOW() WHERE id = $1`, [restaurantId]);
    await query(`UPDATE public.users SET is_active = true, updated_at = NOW() WHERE id = $1`, [merchantId]);
    await query(`UPDATE public.profiles SET is_active = true, updated_at = NOW() WHERE id = $1`, [merchantId]);
  }

  async rejectMerchant(merchantId: string, restaurantId: string): Promise<void> {
    await query(`UPDATE public.restaurants SET status = 'closed', updated_at = NOW() WHERE id = $1`, [restaurantId]);
    await query(`UPDATE public.users SET is_active = false, updated_at = NOW() WHERE id = $1`, [merchantId]);
    await query(`UPDATE public.profiles SET is_active = false, updated_at = NOW() WHERE id = $1`, [merchantId]);
  }

  async updateMerchantStatus(id: string, isActive: boolean): Promise<void> {
    await query(`UPDATE public.users SET is_active = $1, updated_at = NOW() WHERE id = $2`, [isActive, id]);
    await query(`UPDATE public.profiles SET is_active = $1, updated_at = NOW() WHERE id = $2`, [isActive, id]);
  }

  async updateCommission(merchantId: string, commissionRate: number): Promise<void> {
    const res = await query(`SELECT id FROM public.restaurants WHERE owner_id = $1`, [merchantId]);
    if (res.rows.length === 0) throw new Error('No restaurant found');
    for (const r of res.rows) {
      await query(`
        INSERT INTO public.restaurant_settings (restaurant_id, commission_rate)
        VALUES ($1, $2)
        ON CONFLICT (restaurant_id) DO UPDATE SET commission_rate = EXCLUDED.commission_rate, updated_at = NOW()
      `, [r.id, commissionRate]);
    }
  }

  async getAvailableDeliveryPartners(): Promise<Array<{
    id: string;
    full_name: string | null;
    phone: string | null;
    vehicle_type: string;
    total_deliveries: number;
    rating: number | null;
  }>> {
    const admin = createAdminClient();
    const { data } = await admin
      .from('delivery_partners')
      .select('id, vehicle_type, total_deliveries, rating, profile:profiles!delivery_partners_id_fkey(full_name, phone)')
      .eq('is_available', true)
      .order('total_deliveries', { ascending: false });
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      vehicle_type: string;
      total_deliveries: number;
      rating: number | null;
      profile: Array<{ full_name: string | null; phone: string | null }> | null;
    }>;
    return rows.map((p) => ({
      id: p.id,
      full_name: p.profile?.[0]?.full_name ?? null,
      phone: p.profile?.[0]?.phone ?? null,
      vehicle_type: p.vehicle_type,
      total_deliveries: p.total_deliveries,
      rating: p.rating,
    }));
  }

  async assignDeliveryPartner(orderId: string, partnerId: string): Promise<void> {
    const admin = createAdminClient();

    const { data: order } = await admin
      .from('orders')
      .select('id, user_id, tracking_code, status, delivery_partner_id')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) throw new Error('Order not found');
    if (order.status !== 'ready') throw new Error('Order must be ready before assigning a partner');
    if (order.delivery_partner_id === partnerId) return;

    const { data: partner } = await admin
      .from('delivery_partners')
      .select('id, is_available')
      .eq('id', partnerId)
      .maybeSingle();
    if (!partner) throw new Error('Delivery partner not found');
    if (!partner.is_available) throw new Error('Delivery partner is not available');

    const { data: existing } = await admin
      .from('delivery_assignments')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('delivery_assignments')
        .update({ delivery_partner_id: partnerId, status: 'assigned', assigned_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from('delivery_assignments')
        .insert({ order_id: orderId, delivery_partner_id: partnerId, status: 'assigned' });
      if (error) throw new Error(error.message);
    }

    const { error: orderError } = await admin
      .from('orders')
      .update({ status: 'assigned', delivery_partner_id: partnerId })
      .eq('id', orderId);
    if (orderError) throw new Error(orderError.message);

    const { error: partnerError } = await admin
      .from('delivery_partners')
      .update({ is_available: false })
      .eq('id', partnerId);
    if (partnerError) throw new Error(partnerError.message);

    // Dispatch Native Web Push to customer
    if (order.user_id) {
      notifyOrderStatusPush({
        userId: order.user_id,
        orderId: order.id,
        trackingCode: order.tracking_code,
        status: 'assigned',
      }).catch((err) => console.error('Error sending assigned push to customer:', err));
    }

    // Dispatch Native Web Push to the assigned Delivery Partner
    if (partnerId) {
      sendPushToUser(partnerId, {
        title: `📦 Order #${order.tracking_code} Assigned to You!`,
        body: `You have been assigned to deliver order #${order.tracking_code}. Click to view details and start delivery.`,
        url: `/dashboard/delivery`,
        tag: `delivery-assigned-${order.id}`,
      }).catch((err) => console.error('Error sending assigned push to partner:', err));
    }
  }

  async getOrders(filter: AdminFilter & { restaurantId?: string } = {}): Promise<PaginatedResponse<AdminOrder>> {
    const { search, status, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc', fromDate, toDate, restaurantId, tab, statuses } = filter;

    const whereClauses: string[] = ['o.deleted_at IS NULL'];
    const params: any[] = [];
    let paramIdx = 1;

    if (statuses && statuses.length > 0) {
      whereClauses.push(`o.status = ANY($${paramIdx++})`);
      params.push(statuses);
    } else if (status && status !== 'all') {
      whereClauses.push(`o.status = $${paramIdx++}`);
      params.push(status);
    } else if (tab === 'running') {
      whereClauses.push(`o.status IN ('placed', 'pending', 'confirmed', 'accepted', 'preparing', 'ready', 'assigned', 'out_for_delivery')`);
    } else if (tab === 'history') {
      whereClauses.push(`o.status IN ('delivered', 'completed', 'cancelled')`);
    }
    if (search && search.trim()) {
      whereClauses.push(`(o.tracking_code ILIKE $${paramIdx} OR u.full_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx} OR u.phone ILIKE $${paramIdx})`);
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }
    if (fromDate) {
      whereClauses.push(`o.created_at >= $${paramIdx++}`);
      params.push(fromDate);
    }
    if (toDate) {
      whereClauses.push(`o.created_at <= $${paramIdx++}`);
      params.push(toDate);
    }
    if (restaurantId) {
      whereClauses.push(`o.restaurant_id = $${paramIdx++}`);
      params.push(restaurantId);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const safeSort = ['created_at', 'total_amount', 'status'].includes(sortBy) ? sortBy : 'created_at';
    const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countRes = await query(`
      SELECT COUNT(*)::int AS total
      FROM public.orders o
      LEFT JOIN public.users u ON o.user_id = u.id
      ${whereStr}
    `, params);
    const total = countRes.rows[0]?.total ?? 0;

    const offset = (page - 1) * pageSize;
    const dataParams = [...params, pageSize, offset];
    const dataRes = await query(`
      SELECT 
        o.*,
        COALESCE(o.total_amount, 0) AS total,
        json_build_object('full_name', u.full_name, 'email', u.email, 'phone', u.phone) as user,
        json_build_object('name', r.name) as restaurant,
        json_build_object('full_name', dp.full_name, 'phone', dp.phone) as delivery_partner,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.product_price,
            'subtotal', oi.item_total
          )) FROM public.order_items oi WHERE oi.order_id = o.id), '[]'::json
        ) as order_items
      FROM public.orders o
      LEFT JOIN public.users u ON o.user_id = u.id
      LEFT JOIN public.restaurants r ON o.restaurant_id = r.id
      LEFT JOIN public.users dp ON o.delivery_partner_id = dp.id
      ${whereStr}
      ORDER BY o.${safeSort} ${safeOrder}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, dataParams);

    return {
      data: dataRes.rows as unknown as AdminOrder[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getOrderTabCounts(filter: { search?: string; fromDate?: string; toDate?: string; restaurantId?: string } = {}): Promise<{ running: number; history: number }> {
    const { search, fromDate, toDate, restaurantId } = filter;
    const whereClauses: string[] = ['o.deleted_at IS NULL'];
    const params: any[] = [];
    let paramIdx = 1;

    if (search && search.trim()) {
      whereClauses.push(`(o.tracking_code ILIKE $${paramIdx} OR u.full_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx} OR u.phone ILIKE $${paramIdx})`);
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }
    if (fromDate) {
      whereClauses.push(`o.created_at >= $${paramIdx++}`);
      params.push(fromDate);
    }
    if (toDate) {
      whereClauses.push(`o.created_at <= $${paramIdx++}`);
      params.push(toDate);
    }
    if (restaurantId) {
      whereClauses.push(`o.restaurant_id = $${paramIdx++}`);
      params.push(restaurantId);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const res = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE o.status IN ('placed', 'pending', 'confirmed', 'accepted', 'preparing', 'ready', 'assigned', 'out_for_delivery'))::int AS running,
        COUNT(*) FILTER (WHERE o.status IN ('delivered', 'completed', 'cancelled'))::int AS history
      FROM public.orders o
      LEFT JOIN public.users u ON o.user_id = u.id
      ${whereStr}
    `, params);

    return {
      running: res.rows[0]?.running ?? 0,
      history: res.rows[0]?.history ?? 0,
    };
  }

  async getOrderById(id: string): Promise<AdminOrder | null> {
    const res = await query(`
      SELECT 
        o.*,
        COALESCE(o.total_amount, 0) AS total,
        json_build_object('full_name', u.full_name, 'email', u.email, 'phone', u.phone) as user,
        json_build_object('name', r.name) as restaurant,
        json_build_object('full_name', dp.full_name, 'phone', dp.phone) as delivery_partner,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.product_price,
            'subtotal', oi.item_total
          )) FROM public.order_items oi WHERE oi.order_id = o.id), '[]'::json
        ) as order_items
      FROM public.orders o
      LEFT JOIN public.users u ON o.user_id = u.id
      LEFT JOIN public.restaurants r ON o.restaurant_id = r.id
      LEFT JOIN public.users dp ON o.delivery_partner_id = dp.id
      WHERE o.id = $1
      LIMIT 1
    `, [id]);
    return (res.rows[0] as unknown as AdminOrder) ?? null;
  }

  async updateOrderStatus(orderId: string, status: string, reason?: string): Promise<void> {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');
    const historyEntry = {
      status,
      timestamp: new Date().toISOString(),
      note: reason ?? null,
      changed_by: 'admin',
    };
    const existingHistory = (order.status_history ?? []) as Array<Record<string, unknown>>;
    const statusHistory = [...existingHistory, historyEntry];

    await query(`
      UPDATE public.orders
      SET status = $1,
          status_history = $2,
          cancellation_reason = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE cancellation_reason END,
          delivered_at = CASE WHEN $1 IN ('completed', 'delivered') THEN NOW() ELSE delivered_at END,
          cancelled_at = CASE WHEN $1 IN ('cancelled', 'declined') THEN NOW() ELSE cancelled_at END,
          updated_at = NOW()
      WHERE id = $4
    `, [status, JSON.stringify(statusHistory), reason || null, orderId]);

    // Dispatch Native Web Push to customer
    if (order.user_id) {
      notifyOrderStatusPush({
        userId: order.user_id,
        orderId: order.id,
        trackingCode: order.tracking_code,
        status,
        note: reason,
      }).catch((err) => console.error('Error sending admin order push:', err));
    }

    // When order is marked ready, notify all Delivery Partners
    if (status === 'ready') {
      sendPushToDeliveryPartners({
        title: `🛵 Order #${order.tracking_code} is Ready!`,
        body: `Food is packed and ready for delivery pickup from Bodosa kitchen.`,
        url: `/dashboard/delivery`,
        tag: `delivery-ready-${order.id}`,
      }).catch((err) => console.error('Error sending delivery partner push:', err));
    }

    // Also update delivery assignments if transitioning to a terminal status
    if (status === 'completed' || status === 'delivered' || status === 'cancelled' || status === 'declined') {
      const assignmentStatus = (status === 'delivered' || status === 'completed') ? 'delivered' : 'failed';
      try {
        const assignRes = await query(
          `SELECT id, delivery_partner_id FROM public.delivery_assignments WHERE order_id = $1 LIMIT 1`,
          [orderId]
        );
        const assignment = assignRes.rows[0];

        if (assignment) {
          await query(
            `UPDATE public.delivery_assignments SET status = $1, delivered_at = NOW() WHERE id = $2`,
            [assignmentStatus, assignment.id]
          );

          await query(
            `UPDATE public.delivery_partners SET is_available = true WHERE id = $1`,
            [assignment.delivery_partner_id]
          );
        }
      } catch { }
    }
  }

  async getCreditAccounts(filter: AdminFilter = {}): Promise<PaginatedResponse<CreditAccountAdmin>> {
    const admin = createAdminClient();
    const { search, status, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc' } = filter;
    let query = admin
      .from('credit_accounts')
      .select('*, user:profiles!user_id(full_name, email)', { count: 'exact' })
      .is('deleted_at', null);
    if (status && status !== 'all') query = query.eq('status', status);
    if (search) {
      query = query.or(
        `user.full_name.ilike.%${search}%,user.email.ilike.%${search}%`,
      );
    }
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await query.range(from, to);
    return {
      data: (data ?? []) as unknown as CreditAccountAdmin[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async getCreditAccountById(id: string): Promise<CreditAccountAdmin | null> {
    const admin = createAdminClient();
    const { data } = await admin
      .from('credit_accounts')
      .select('*, user:profiles!user_id(full_name, email)')
      .eq('id', id)
      .single();
    return data as unknown as CreditAccountAdmin | null;
  }

  async updateCreditLimit(accountId: string, newLimit: number): Promise<CreditAccountAdmin> {
    const admin = createAdminClient();
    const account = await this.getCreditAccountById(accountId);
    if (!account) throw new Error('Account not found');
    const diff = newLimit - account.credit_limit;
    const { data, error } = await admin
      .from('credit_accounts')
      .update({
        credit_limit: newLimit,
        available_credit: Math.max(0, account.available_credit + diff),
        outstanding: Math.max(0, account.outstanding),
      })
      .eq('id', accountId)
      .select('*, user:profiles!user_id(full_name, email)')
      .single();
    if (error) throw new Error(error.message);
    return data as unknown as CreditAccountAdmin;
  }

  async updateCreditStatus(accountId: string, status: string): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('credit_accounts')
      .update({ status })
      .eq('id', accountId);
    if (error) throw new Error(error.message);
  }

  async waiveLateFee(repaymentId: string): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('credit_repayments')
      .update({ late_fee_applied: 0 })
      .eq('id', repaymentId);
    if (error) throw new Error(error.message);
  }

  async getCreditTransactions(accountId: string, limit = 50, offset = 0) {
    const admin = createAdminClient();
    const { data, count } = await admin
      .from('credit_transactions')
      .select('*', { count: 'exact' })
      .eq('credit_account_id', accountId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    return { data: data ?? [], total: count ?? 0 };
  }

  async getPayments(filter: AdminFilter = {}): Promise<PaginatedResponse<PaymentAdmin>> {
    const {
      search,
      status,
      paymentMethodGroup,
      page = 1,
      pageSize = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
      fromDate,
      toDate,
    } = filter;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Status filter
    if (status && status !== 'all') {
      if (status === 'confirmed') {
        conditions.push(`p.status IN ('confirmed', 'collected')`);
      } else if (status === 'pending') {
        conditions.push(`p.status IN ('pending', 'processing')`);
      } else if (status === 'refunded') {
        conditions.push(`(p.status IN ('refunded', 'partially_refunded') OR COALESCE(p.refund_amount, 0) > 0)`);
      } else if (status === 'failed') {
        conditions.push(`p.status IN ('failed', 'cancelled')`);
      } else {
        conditions.push(`p.status = $${paramIndex++}`);
        values.push(status);
      }
    }

    // Payment method group filter
    if (paymentMethodGroup && paymentMethodGroup !== 'all') {
      if (paymentMethodGroup === 'online') {
        conditions.push(`LOWER(p.payment_method) IN ('razorpay', 'upi', 'phonepe', 'gpay', 'online', 'card', 'netbanking')`);
      } else if (paymentMethodGroup === 'wallet') {
        conditions.push(`LOWER(p.payment_method) IN ('wallet', 'bnpl')`);
      } else if (paymentMethodGroup === 'cod') {
        conditions.push(`LOWER(p.payment_method) IN ('cod', 'cash', 'collected')`);
      }
    }

    // Search filter
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(`(
        p.id::text ILIKE $${paramIndex} OR
        COALESCE(p.gateway_payment_id, '') ILIKE $${paramIndex} OR
        COALESCE(p.gateway_order_id, '') ILIKE $${paramIndex} OR
        COALESCE(o.tracking_code, '') ILIKE $${paramIndex} OR
        COALESCE(o.customer_name, '') ILIKE $${paramIndex} OR
        COALESCE(o.customer_phone, '') ILIKE $${paramIndex} OR
        COALESCE(o.customer_email, '') ILIKE $${paramIndex} OR
        COALESCE(u.full_name, '') ILIKE $${paramIndex} OR
        COALESCE(u.phone, '') ILIKE $${paramIndex} OR
        COALESCE(u.email, '') ILIKE $${paramIndex}
      )`);
      values.push(term);
      paramIndex++;
    }

    // Date filters
    if (fromDate) {
      conditions.push(`p.created_at >= $${paramIndex++}`);
      values.push(fromDate);
    }
    if (toDate) {
      conditions.push(`p.created_at <= $${paramIndex++}`);
      values.push(toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSortCols: Record<string, string> = {
      created_at: 'p.created_at',
      amount: 'p.amount',
      status: 'p.status',
      payment_method: 'p.payment_method',
    };
    const sortCol = allowedSortCols[sortBy] || 'p.created_at';
    const sortDir = sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const limit = Math.max(1, Number(pageSize) || 50);
    const offset = (Math.max(1, Number(page) || 1) - 1) * limit;

    const sql = `
      SELECT
        p.id,
        p.order_id,
        p.amount,
        p.currency,
        p.payment_method,
        p.status,
        p.gateway_order_id,
        p.gateway_payment_id,
        p.error_description AS failure_reason,
        COALESCE(p.refund_amount, 0) AS refund_amount,
        p.created_at,
        o.user_id AS order_user_id,
        o.tracking_code,
        o.status AS order_status,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        u.full_name AS user_full_name,
        u.email AS user_email,
        u.phone AS user_phone,
        (ca.credit_limit - ca.used_credit) AS available_credit,
        ca.credit_limit,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'subtotal', oi.subtotal
          ))
          FROM public.order_items oi WHERE oi.order_id = p.order_id),
          '[]'::json
        ) AS order_items,
        COUNT(*) OVER() AS full_count
      FROM public.payments p
      LEFT JOIN public.orders o ON p.order_id = o.id
      LEFT JOIN public.users u ON o.user_id = u.id
      LEFT JOIN public.credit_accounts ca ON o.user_id = ca.user_id
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    values.push(limit, offset);

    const res = await query(sql, values);
    const rows = res.rows || [];
    const total = rows.length > 0 ? parseInt(rows[0].full_count, 10) : 0;

    const data: PaymentAdmin[] = rows.map((r: any) => {
      const uid = r.order_user_id || null;
      const walletRef = r.credit_limit != null
        ? `BNPL Credit (Avail: ₹${Number(r.available_credit ?? 0).toLocaleString('en-IN')})`
        : uid
          ? `User Wallet (${String(uid).slice(0, 8)})`
          : 'N/A';

      const gateway = ['razorpay', 'upi', 'phonepe', 'gpay'].includes(r.payment_method?.toLowerCase())
        ? r.payment_method.toUpperCase()
        : r.payment_method?.toUpperCase() || 'DIRECT';

      return {
        id: r.id,
        order_id: r.order_id,
        user_id: uid,
        amount: Number(r.amount ?? 0),
        currency: r.currency || 'INR',
        payment_method: r.payment_method,
        gateway,
        gateway_order_id: r.gateway_order_id ?? null,
        gateway_payment_id: r.gateway_payment_id ?? null,
        status: r.status,
        failure_reason: r.failure_reason ?? null,
        refund_amount: r.refund_amount != null ? Number(r.refund_amount) : 0,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        order: r.tracking_code ? {
          tracking_code: r.tracking_code,
          status: r.order_status,
          customer_name: r.customer_name ?? null,
          customer_phone: r.customer_phone ?? null,
          customer_email: r.customer_email ?? null,
          user_id: uid,
          order_items: Array.isArray(r.order_items) ? r.order_items : [],
        } : null,
        user: r.user_full_name || r.user_email ? {
          full_name: r.user_full_name ?? null,
          email: r.user_email ?? null,
          phone: r.user_phone ?? null,
        } : null,
        wallet_info: walletRef,
      };
    });

    return {
      data,
      total,
      page: Number(page) || 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async processRefund(paymentId: string, amount: number, reason: string): Promise<void> {
    const res = await query(`
      SELECT id, order_id, amount, refund_amount, status, payment_method
      FROM public.payments
      WHERE id = $1
    `, [paymentId]);

    if (!res.rows[0]) throw new Error('Payment not found');
    const payment = res.rows[0];

    if (payment.status !== 'confirmed' && payment.status !== 'collected') {
      throw new Error('Only confirmed payments can be refunded');
    }

    const currentRefunded = Number(payment.refund_amount || 0);
    const paymentAmount = Number(payment.amount);
    const newRefunded = currentRefunded + amount;
    if (newRefunded > paymentAmount) throw new Error('Refund amount exceeds payment amount');
    const newStatus = newRefunded >= paymentAmount ? 'refunded' : 'partially_refunded';

    await query(`
      UPDATE public.payments
      SET refund_amount = $1, status = $2, updated_at = NOW()
      WHERE id = $3
    `, [newRefunded, newStatus, paymentId]);

    if (payment.payment_method === 'bnpl' && payment.order_id) {
      const creditTxRes = await query(`
        SELECT credit_account_id
        FROM public.credit_transactions
        WHERE order_id = $1 AND type = 'purchase'
        LIMIT 1
      `, [payment.order_id]);
      if (creditTxRes.rows[0]?.credit_account_id) {
        await query(`
          UPDATE public.credit_accounts
          SET used_credit = GREATEST(0, used_credit - $1), updated_at = NOW()
          WHERE id = $2
        `, [amount, creditTxRes.rows[0].credit_account_id]);
      }
    }

    await this.createAuditLog({
      table_name: 'payments',
      record_id: paymentId,
      action: 'refund',
      new_data: { refund_amount: newRefunded, status: newStatus, reason },
      old_data: { refund_amount: currentRefunded, status: payment.status },
    });
  }

  async getAuditLogs(filter: AdminFilter & { tableName?: string } = {}): Promise<PaginatedResponse<AuditEntry>> {
    const { search, page = 1, pageSize = 50, sortBy = 'created_at', sortOrder = 'desc', fromDate, toDate, tableName } = filter;

    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (tableName) {
      whereClauses.push(`a.table_name = $${paramIdx++}`);
      params.push(tableName);
    }
    if (fromDate) {
      whereClauses.push(`a.created_at >= $${paramIdx++}`);
      params.push(fromDate);
    }
    if (toDate) {
      whereClauses.push(`a.created_at <= $${paramIdx++}`);
      params.push(toDate);
    }
    if (search && search.trim()) {
      whereClauses.push(`(a.table_name ILIKE $${paramIdx} OR a.action ILIKE $${paramIdx} OR a.record_id ILIKE $${paramIdx})`);
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const safeSort = ['created_at', 'action', 'table_name'].includes(sortBy) ? `a.${sortBy}` : 'a.created_at';
    const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countRes = await query(`
      SELECT COUNT(*)::int AS total
      FROM public.audit_logs a
      ${whereStr}
    `, params);
    const total = countRes.rows[0]?.total ?? 0;

    const offset = (page - 1) * pageSize;
    const dataParams = [...params, pageSize, offset];
    const dataRes = await query(`
      SELECT 
        a.id,
        a.user_id,
        a.action,
        a.table_name,
        a.record_id,
        a.old_data,
        a.new_data,
        a.ip_address,
        a.created_at,
        a.user_id AS changed_by,
        u.full_name AS changed_by_name
      FROM public.audit_logs a
      LEFT JOIN public.users u ON a.user_id = u.id
      ${whereStr}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, dataParams);

    return {
      data: dataRes.rows as unknown as AuditEntry[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getSystemSettings(): Promise<SystemSetting[]> {
    const res = await query(`
      SELECT id, key, value, type, is_secret, description, updated_by, created_at, updated_at
      FROM public.system_settings
      ORDER BY key ASC
    `);
    return res.rows as SystemSetting[];
  }

  async updateSystemSetting(id: string, value: string, updatedBy: string): Promise<void> {
    await query(`
      UPDATE public.system_settings
      SET value = $1, 
          updated_by = CASE WHEN ($2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN $2::uuid ELSE NULL END, 
          updated_at = NOW()
      WHERE id::text = $3 OR key = $3
    `, [value, updatedBy, id]);
  }

  async createAuditLog(entry: {
    table_name: string;
    record_id?: string | null;
    action: string;
    old_data?: Record<string, unknown> | null;
    new_data?: Record<string, unknown> | null;
    changed_by?: string | null;
  }): Promise<void> {
    try {
      const isUuid = (val?: string | null) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

      await query(`
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        entry.table_name,
        isUuid(entry.record_id) ? entry.record_id : null,
        entry.action,
        entry.old_data ? JSON.stringify(entry.old_data) : null,
        entry.new_data ? JSON.stringify(entry.new_data) : null,
        isUuid(entry.changed_by) ? entry.changed_by : null,
      ]);
    } catch (e) {
      console.warn('createAuditLog failed:', e);
    }
  }

  async getUserOrderHistory(userId: string, page = 1, pageSize = 20): Promise<PaginatedResponse<AdminOrder>> {
    const admin = createAdminClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await admin
      .from('orders')
      .select('*, order_items(*), user:profiles!user_id(full_name, email), restaurant:restaurants!restaurant_id(name), delivery_partner:profiles!delivery_partner_id(full_name, phone)', { count: 'exact' })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    return {
      data: (data ?? []) as unknown as AdminOrder[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async getStudentCreditHistory(userId: string) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('credit_accounts')
      .select('*, credit_transactions(*)')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();
    return data as unknown as (CreditAccountAdmin & { credit_transactions: Array<Record<string, unknown>> }) | null;
  }

  async getMerchantRevenue(merchantId: string) {
    const admin = createAdminClient();
    const { data: restaurants } = await admin
      .from('restaurants')
      .select('id, name')
      .eq('owner_id', merchantId);
    if (!restaurants || restaurants.length === 0) return null;
    const restaurantIds = restaurants.map((r: { id: string }) => r.id);
    const { data: orders } = await admin
      .from('orders')
      .select('id, total, status, created_at')
      .in('restaurant_id', restaurantIds)
      .in('status', ['completed', 'delivered'])
      .order('created_at', { ascending: false });
    return { restaurants, orders: orders ?? [] };
  }

  async getMerchantAnalytics(merchantId: string) {
    const admin = createAdminClient();
    const { data: restaurants } = await admin
      .from('restaurants')
      .select('id, name, status, is_open, created_at')
      .eq('owner_id', merchantId);
    return restaurants ?? [];
  }

  async getStudentPaymentHistory(userId: string, page = 1, pageSize = 20) {
    const admin = createAdminClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await admin
      .from('payments')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);
    return { data: data ?? [], total: count ?? 0 };
  }

  async bulkUpdateStudentStatus(userIds: string[], isActive: boolean): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .update({ is_active: isActive })
      .in('id', userIds);
    if (error) throw new Error(error.message);
  }

  async bulkUpdateMerchantStatus(userIds: string[], isActive: boolean): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .update({ is_active: isActive })
      .in('id', userIds);
    if (error) throw new Error(error.message);
  }

  async getLowStockProducts(threshold: number) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('products')
      .select('*, restaurant:restaurants!restaurant_id(name)')
      .eq('track_inventory', true)
      .lte('stock_quantity', threshold)
      .eq('is_active', true);
    return data ?? [];
  }

  async getRecentPayments(limit = 20) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('payments')
      .select('*, order:orders!order_id(tracking_code)')
      .order('created_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  }

  /**
   * Delivery partners with the number of completed deliveries inside the
   * given date range (based on `delivery_assignments.delivered_at`).
   */
  async getDeliveryPartners(filter: AdminFilter = {}): Promise<DeliveryPartnerAdmin[]> {
    const admin = createAdminClient();
    const { fromDate, toDate } = filter;

    let assignmentQuery = admin
      .from('delivery_assignments')
      .select('delivery_partner_id, delivered_at')
      .eq('status', 'delivered');
    if (fromDate) assignmentQuery = assignmentQuery.gte('delivered_at', fromDate);
    if (toDate) assignmentQuery = assignmentQuery.lte('delivered_at', toDate);

    const [{ data: partners }, { data: deliveries }, { data: profiles }] = await Promise.all([
      admin
        .from('delivery_partners')
        .select('id, vehicle_type, license_plate, is_available, is_online, rating, total_deliveries, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      assignmentQuery,
      admin.from('profiles').select('id, full_name, email, phone').eq('role', 'delivery'),
    ]);

    const profileMap = new Map<string, { full_name?: string | null; email?: string | null; phone?: string | null }>(
      ((profiles ?? []) as Array<Record<string, unknown>>).map((p) => [
        String(p.id),
        {
          full_name: (p.full_name as string | null) ?? null,
          email: (p.email as string | null) ?? null,
          phone: (p.phone as string | null) ?? null,
        },
      ]),
    );

    const rangeCounts = new Map<string, number>();
    for (const d of (deliveries ?? []) as Array<Record<string, unknown>>) {
      const pid = String(d.delivery_partner_id ?? '');
      rangeCounts.set(pid, (rangeCounts.get(pid) ?? 0) + 1);
    }

    return ((partners ?? []) as Array<Record<string, unknown>>)
      .map((p) => {
        const profile = profileMap.get(String(p.id));
        return {
          id: String(p.id),
          name: profile?.full_name ?? null,
          email: profile?.email ?? null,
          phone: profile?.phone ?? null,
          vehicle_type: String(p.vehicle_type ?? 'bike'),
          license_plate: (p.license_plate as string | null) ?? null,
          is_available: p.is_available === true,
          is_online: p.is_online === true,
          rating: p.rating == null ? null : Number(p.rating),
          total_deliveries: Number(p.total_deliveries ?? 0),
          deliveries_in_range: rangeCounts.get(String(p.id)) ?? 0,
          created_at: String(p.created_at ?? ''),
        } as DeliveryPartnerAdmin;
      })
      .sort((a, b) => b.deliveries_in_range - a.deliveries_in_range || b.total_deliveries - a.total_deliveries);
  }
}

export const adminRepository = new AdminRepository();
