import { createAdminClient } from '@/infrastructure/supabase/admin';
import type {
  DashboardStats, AdminStudent, AdminMerchant, AdminOrder, AdminUser,
  CreditAccountAdmin, PaymentAdmin, AuditEntry, SystemSetting,
  PaginatedResponse, AdminFilter, ActivityEntry, DeliveryPartnerAdmin,
} from '../types';
import { notifyOrderStatusPush, sendPushToUser, sendPushToDeliveryPartners } from '@/lib/push';

export class AdminRepository {
  async getDashboardStats(): Promise<DashboardStats | null> {
    const admin = createAdminClient();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0,0,0,0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
      const weekStartStr = weekStart.toISOString();
      const monthStartStr = monthStart.toISOString();

      const nonTerminal = ['pending', 'accepted', 'preparing', 'ready', 'assigned', 'out_for_delivery'];

      const safeQuery = async <T>(promise: PromiseLike<T>, fallback: T): Promise<T> => {
        try {
          const res = await promise;
          if (res && typeof res === 'object' && 'error' in (res as Record<string, unknown>) && (res as Record<string, unknown>).error) {
            return fallback;
          }
          return res ?? fallback;
        } catch {
          return fallback;
        }
      };

      type CountResult = { count: number | null };
      type DataResult<R> = { data: R[] | null };

      const [
        { count: totalUsers },
        { count: totalStudents },
        { count: totalMerchants },
        { count: totalRestaurants },
        { count: totalOrders },
        { data: revenueRows },
        { data: todayRevenueRows },
        { data: weeklyRevenueRows },
        { data: monthlyRevenueRows },
        { data: activeOrdersRows },
        { data: completedOrdersRows },
        { data: cancelledOrdersRows },
        { data: bnplData },
        { data: repaidData },
        { data: overdueRows },
        { data: activeMerchantRows },
        { count: pendingApprovals },
        { data: activityRows },
      ] = await Promise.all([
        safeQuery<CountResult>(admin.from('profiles').select('*', { count: 'exact', head: true }).is('deleted_at', null), { count: 0 }),
        safeQuery<CountResult>(admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').is('deleted_at', null), { count: 0 }),
        safeQuery<CountResult>(admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'merchant').is('deleted_at', null), { count: 0 }),
        safeQuery<CountResult>(admin.from('restaurants').select('*', { count: 'exact', head: true }).is('deleted_at', null), { count: 0 }),
        safeQuery<CountResult>(admin.from('orders').select('*', { count: 'exact', head: true }).is('deleted_at', null), { count: 0 }),
        safeQuery<DataResult<{ total: number }>>(admin.from('orders').select('total').in('status', ['completed', 'delivered']).is('deleted_at', null), { data: [] }),
        safeQuery<DataResult<{ total: number }>>(admin.from('orders').select('total').in('status', ['completed', 'delivered']).is('deleted_at', null).gte('created_at', today), { data: [] }),
        safeQuery<DataResult<{ total: number }>>(admin.from('orders').select('total').in('status', ['completed', 'delivered']).is('deleted_at', null).gte('created_at', weekStartStr), { data: [] }),
        safeQuery<DataResult<{ total: number }>>(admin.from('orders').select('total').in('status', ['completed', 'delivered']).is('deleted_at', null).gte('created_at', monthStartStr), { data: [] }),
        safeQuery<DataResult<{ id: string }>>(admin.from('orders').select('id').in('status', nonTerminal).is('deleted_at', null), { data: [] }),
        safeQuery<DataResult<{ id: string }>>(admin.from('orders').select('id').in('status', ['completed', 'delivered']).is('deleted_at', null), { data: [] }),
        safeQuery<DataResult<{ id: string }>>(admin.from('orders').select('id').eq('status', 'cancelled').is('deleted_at', null), { data: [] }),
        safeQuery<DataResult<{ outstanding: number; credit_limit: number }>>(admin.from('credit_accounts').select('outstanding, credit_limit').is('deleted_at', null), { data: [] }),
        safeQuery<DataResult<{ amount: number }>>(admin.from('credit_transactions').select('amount').eq('type', 'repayment'), { data: [] }),
        safeQuery<DataResult<{ credit_account_id: string }>>(admin.from('credit_repayments').select('credit_account_id').eq('status', 'pending').lt('due_date', today), { data: [] }),
        safeQuery<DataResult<{ owner_id: string }>>(admin.from('restaurants').select('owner_id').eq('status', 'active').is('deleted_at', null), { data: [] }),
        safeQuery<CountResult>(admin.from('restaurants').select('*', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null), { count: 0 }),
        safeQuery<DataResult<{ id: string; action: string; table_name: string; record_id: string | null; created_at: string; changed_by: string | null }>>(admin.from('audit_logs').select('id, action, table_name, record_id, created_at, changed_by').order('created_at', { ascending: false }).limit(10), { data: [] }),
      ]);

      const totalRevenue = (revenueRows ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
      const todayRevenue = (todayRevenueRows ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
      const weeklyRevenue = (weeklyRevenueRows ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
      const monthlyRevenue = (monthlyRevenueRows ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
      const bnplOutstanding = (bnplData ?? []).reduce((s, r) => s + Number(r.outstanding || 0), 0);
      const totalCreditIssued = (bnplData ?? []).reduce((s, r) => s + Number(r.credit_limit || 0), 0);
      const totalRepaid = (repaidData ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
      const activeMerchantIds = new Set((activeMerchantRows ?? []).map((r) => r.owner_id));
      const overdueAccountIds = new Set((overdueRows ?? []).map((r) => r.credit_account_id));
      const overdueCount = overdueAccountIds.size;

      // Populate user names for audit logs safely
      const changedByUsers = Array.from(new Set((activityRows ?? []).map((r) => r.changed_by).filter(Boolean))) as string[];
      let userNameMap = new Map<string, string>();
      if (changedByUsers.length > 0) {
        const { data: userProfiles } = await safeQuery<DataResult<{ id: string; full_name: string }>>(
          admin.from('profiles').select('id, full_name').in('id', changedByUsers),
          { data: [] }
        );
        userNameMap = new Map((userProfiles ?? []).map((u) => [u.id, u.full_name]));
      }

      const recentActivity: ActivityEntry[] = (activityRows ?? []).map((r) => {
        const userId = r.changed_by ?? undefined;
        return {
          id: r.id,
          action: r.action,
          entity_type: r.table_name,
          entity_id: r.record_id ?? '',
          user_name: (userId && userNameMap.get(userId)) || 'System',
          created_at: r.created_at,
        };
      });

      return {
        total_users: totalUsers ?? 0,
        total_students: totalStudents ?? 0,
        total_merchants: totalMerchants ?? 0,
        total_restaurants: totalRestaurants ?? 0,
        total_orders: totalOrders ?? 0,
        active_orders: (activeOrdersRows ?? []).length,
        completed_orders: (completedOrdersRows ?? []).length,
        cancelled_orders: (cancelledOrdersRows ?? []).length,
        total_revenue: totalRevenue,
        today_revenue: todayRevenue,
        weekly_revenue: weeklyRevenue,
        monthly_revenue: monthlyRevenue,
        bnpl_outstanding: bnplOutstanding,
        total_credit_issued: totalCreditIssued,
        total_credit_repaid: totalRepaid,
        total_overdue_accounts: overdueCount,
        active_merchants: activeMerchantIds.size,
        pending_merchant_approvals: pendingApprovals ?? 0,
        recent_activity: recentActivity,
      };
    } catch (e) {
      console.error('getDashboardStats error:', e);
      return null;
    }
  }

  async getStudents(filter: AdminFilter = {}): Promise<PaginatedResponse<AdminStudent>> {
    const admin = createAdminClient();
    const { search, status, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc' } = filter;
    let query = admin
      .from('profiles')
      .select('*, credit_account:credit_accounts(*)', { count: 'exact' })
      .eq('role', 'student')
      .is('deleted_at', null);
    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'suspended') query = query.eq('is_active', false);
    if (search && search.trim()) {
      const clean = search.trim().replace(/[%,\(\)]/g, '');
      if (clean) {
        query = query.or(
          `full_name.ilike.%${clean}%,email.ilike.%${clean}%,phone.ilike.%${clean}%`,
        );
      }
    }
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await query.range(from, to);
    const students = (data ?? []) as unknown as AdminStudent[];
    if (students.length > 0) {
      const userIds = students.map(s => s.id);
      const { data: walletsData } = await admin.from('wallets').select('*').in('user_id', userIds);
      if (walletsData) {
        students.forEach(s => {
          s.wallet = walletsData.find(w => w.user_id === s.id) || null;
        });
      }
    }

    return {
      data: students,
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async getUsers(filter: AdminFilter = {}): Promise<PaginatedResponse<AdminUser>> {
    const admin = createAdminClient();
    const { search, status, role, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc' } = filter;
    let query = admin
      .from('profiles')
      .select('id, email, full_name, phone, role, is_active, created_at', { count: 'exact' })
      .is('deleted_at', null);
    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'suspended') query = query.eq('is_active', false);
    if (role && role !== 'all') query = query.eq('role', role);
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
      );
    }
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await query.range(from, to);
    return {
      data: (data ?? []) as unknown as AdminUser[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async getStudentById(id: string): Promise<AdminStudent | null> {
    const admin = createAdminClient();
    const { data } = await admin
      .from('profiles')
      .select('*, credit_account:credit_accounts(*)')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    
    const student = data as unknown as AdminStudent | null;
    if (student) {
      const { data: walletData } = await admin.from('wallets').select('*').eq('user_id', id).maybeSingle();
      student.wallet = (walletData as unknown as AdminStudent['wallet']) || null;
    }

    return student;
  }

  async updateStudentStatus(id: string, isActive: boolean): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async resetStudentVerification(id: string): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('credit_accounts')
      .update({ verification_status: 'pending' })
      .eq('user_id', id);
    if (error) throw new Error(error.message);
  }

  async getMerchants(filter: AdminFilter = {}): Promise<PaginatedResponse<AdminMerchant>> {
    const admin = createAdminClient();
    const { search, status, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc' } = filter;
    let query = admin
      .from('profiles')
      .select('*, restaurant:restaurants(*)', { count: 'exact' })
      .eq('role', 'merchant')
      .is('deleted_at', null);
    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'suspended') query = query.eq('is_active', false);
    if (search && search.trim()) {
      const clean = search.trim().replace(/[%,\(\)]/g, '');
      if (clean) {
        query = query.or(
          `full_name.ilike.%${clean}%,email.ilike.%${clean}%,phone.ilike.%${clean}%`,
        );
      }
    }
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await query.range(from, to);
    return {
      data: (data ?? []) as unknown as AdminMerchant[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async getMerchantById(id: string): Promise<AdminMerchant | null> {
    const admin = createAdminClient();
    const { data } = await admin
      .from('profiles')
      .select('*, restaurant:restaurants(*)')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    return data as unknown as AdminMerchant | null;
  }

  async approveMerchant(merchantId: string, restaurantId: string): Promise<void> {
    const admin = createAdminClient();
    const { error: rError } = await admin
      .from('restaurants')
      .update({ status: 'active' })
      .eq('id', restaurantId);
    if (rError) throw new Error(rError.message);
    const { error: pError } = await admin
      .from('profiles')
      .update({ is_active: true })
      .eq('id', merchantId);
    if (pError) throw new Error(pError.message);
  }

  async rejectMerchant(merchantId: string, restaurantId: string): Promise<void> {
    const admin = createAdminClient();
    const { error: rError } = await admin
      .from('restaurants')
      .update({ status: 'closed' })
      .eq('id', restaurantId);
    if (rError) throw new Error(rError.message);
    const { error: pError } = await admin
      .from('profiles')
      .update({ is_active: false })
      .eq('id', merchantId);
    if (pError) throw new Error(pError.message);
  }

  async updateMerchantStatus(id: string, isActive: boolean): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async updateCommission(merchantId: string, commissionRate: number): Promise<void> {
    const admin = createAdminClient();
    const { data: restaurants } = await admin
      .from('restaurants')
      .select('id')
      .eq('owner_id', merchantId);
    if (!restaurants || restaurants.length === 0) throw new Error('No restaurant found');
    for (const r of restaurants) {
      const { error } = await admin
        .from('restaurant_settings')
        .upsert({ restaurant_id: r.id, commission_rate: commissionRate }, { onConflict: 'restaurant_id' });
      if (error) throw new Error(error.message);
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
    const admin = createAdminClient();
    const { search, status, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc', fromDate, toDate, restaurantId } = filter;
    let query = admin
      .from('orders')
      .select('*, order_items(*), user:profiles!user_id(full_name, email, phone), restaurant:restaurants!restaurant_id(name), delivery_partner:profiles!delivery_partner_id(full_name, phone)', { count: 'exact' })
      .is('deleted_at', null);
    if (status && status !== 'all') query = query.eq('status', status);
    if (search) {
      query = query.or(
        `tracking_code.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%`,
      );
    }
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);
    if (restaurantId) query = query.eq('restaurant_id', restaurantId);
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await query.range(from, to);
    return {
      data: (data ?? []) as unknown as AdminOrder[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async getOrderById(id: string): Promise<AdminOrder | null> {
    const admin = createAdminClient();
    const { data } = await admin
      .from('orders')
      .select('*, order_items(*), user:profiles!user_id(full_name, email, phone), restaurant:restaurants!restaurant_id(name), delivery_partner:profiles!delivery_partner_id(full_name, phone)')
      .eq('id', id)
      .single();
    return data as unknown as AdminOrder | null;
  }

  async updateOrderStatus(orderId: string, status: string, reason?: string): Promise<void> {
    const admin = createAdminClient();
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
    const updateData: Record<string, unknown> = {
      status,
      status_history: statusHistory,
    };
    if (reason && (status === 'cancelled' || status === 'declined')) {
      updateData.cancellation_reason = reason;
    }
    if (status === 'accepted') updateData.accepted_at = new Date().toISOString();
    if (status === 'preparing') updateData.prepared_at = new Date().toISOString();
    if (status === 'ready') updateData.prepared_at = order.prepared_at ?? new Date().toISOString();
    if (status === 'completed' || status === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
      updateData.payment_status = 'confirmed';
    }
    if (status === 'cancelled' || status === 'declined') {
      updateData.cancelled_at = new Date().toISOString();
      if (order.payment_method === 'cod') {
        updateData.payment_status = 'failed';
      } else if (order.payment_status === 'confirmed') {
        const { processOrderRefundIfEligible } = await import('@/features/orders/actions/customer');
        const refundRes = await processOrderRefundIfEligible(order, reason || 'Cancelled by store admin');
        if (refundRes.refunded) {
          updateData.payment_status = 'refunded';
        }
      }
    }
    const { error } = await admin.from('orders').update(updateData).eq('id', orderId);
    if (error) throw new Error(error.message);

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
        body: `Food is packed and ready for delivery pickup from Dilip Da kitchen.`,
        url: `/dashboard/delivery`,
        tag: `delivery-ready-${order.id}`,
      }).catch((err) => console.error('Error sending delivery partner push:', err));
    }

    // Also update delivery assignments if transitioning to a terminal status
    if (status === 'completed' || status === 'delivered' || status === 'cancelled' || status === 'declined') {
      const assignmentStatus = (status === 'delivered' || status === 'completed') ? 'delivered' : 'failed';
      // Find the assignment if any
      const { data: assignment } = await admin
        .from('delivery_assignments')
        .select('id, delivery_partner_id')
        .eq('order_id', orderId)
        .maybeSingle();

      if (assignment) {
        await admin
          .from('delivery_assignments')
          .update({ status: assignmentStatus, delivered_at: new Date().toISOString() })
          .eq('id', assignment.id);
        
        await admin
          .from('delivery_partners')
          .update({ is_available: true })
          .eq('id', assignment.delivery_partner_id);
      }
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
    const admin = createAdminClient();
    const { search, status, paymentMethodGroup, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc', fromDate, toDate } = filter;
    let query = admin
      .from('payments')
      .select('*, order:orders!order_id!inner(tracking_code, status, customer_name, customer_phone, customer_email, user_id, order_items(id, product_name, quantity, unit_price, subtotal))', { count: 'exact' });
    if (status && status !== 'all') query = query.eq('status', status);
    if (paymentMethodGroup && paymentMethodGroup !== 'all') {
      if (paymentMethodGroup === 'online') {
        query = query.in('payment_method', ['razorpay', 'upi', 'phonepe', 'gpay', 'online']);
      } else if (paymentMethodGroup === 'wallet') {
        query = query.in('payment_method', ['wallet', 'bnpl']);
      } else if (paymentMethodGroup === 'cod') {
        query = query.in('payment_method', ['cod', 'cash', 'collected']).in('order.status', ['delivered', 'completed']);
      }
    }
    if (search) {
      query = query.or(
        `gateway_payment_id.ilike.%${search}%,gateway_order_id.ilike.%${search}%,order.tracking_code.ilike.%${search}%,order.customer_name.ilike.%${search}%,order.customer_phone.ilike.%${search}%,order.customer_email.ilike.%${search}%`,
      );
    }
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await query.range(from, to);

    // Fetch user profiles & credit account references for payments that have user_id
    const userIds = Array.from(new Set((data ?? []).map((p) => p.user_id || p.order?.user_id).filter(Boolean))) as string[];
    let userMap = new Map<string, { full_name: string; email: string; phone: string | null }>();
    let creditMap = new Map<string, { available_credit: number; credit_limit: number }>();

    if (userIds.length > 0) {
      const [{ data: profiles }, { data: credits }] = await Promise.all([
        admin.from('profiles').select('id, full_name, email, phone').in('id', userIds),
        admin.from('credit_accounts').select('user_id, available_credit, credit_limit').in('user_id', userIds),
      ]);

      if (profiles) {
        userMap = new Map(profiles.map((u) => [u.id, { full_name: u.full_name, email: u.email, phone: u.phone ?? null }]));
      }
      if (credits) {
        creditMap = new Map(credits.map((c) => [c.user_id, { available_credit: Number(c.available_credit), credit_limit: Number(c.credit_limit) }]));
      }
    }

    const paymentsWithDetails = (data ?? []).map((p) => {
      const uid = p.user_id || p.order?.user_id;
      const userProfile = uid ? userMap.get(uid) : undefined;
      const creditAcc = uid ? creditMap.get(uid) : undefined;
      const walletRef = creditAcc
        ? `BNPL Credit (Avail: ₹${creditAcc.available_credit.toLocaleString('en-IN')})`
        : p.user_id
          ? `User Wallet (${p.user_id.slice(0, 8)})`
          : 'N/A';

      return {
        ...p,
        user: userProfile ? { full_name: userProfile.full_name, email: userProfile.email, phone: userProfile.phone } : null,
        wallet_info: walletRef,
      };
    });

    const validPayments = paymentsWithDetails.filter((p) => {
      const isCod = ['cod', 'cash', 'collected'].includes(p.payment_method);
      if (isCod) {
        return p.order?.status === 'delivered' || p.order?.status === 'completed';
      }
      return true;
    });

    return {
      data: validPayments as unknown as PaymentAdmin[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async processRefund(paymentId: string, amount: number, reason: string): Promise<void> {
    const admin = createAdminClient();
    const { data: payment, error: fetchError } = await admin
      .from('payments')
      .select('id, order_id, amount, refund_amount, status, payment_method')
      .eq('id', paymentId)
      .single();
    if (fetchError || !payment) throw new Error('Payment not found');
    if (payment.status !== 'confirmed') throw new Error('Only confirmed payments can be refunded');
    const currentRefunded = payment.refund_amount ?? 0;
    const newRefunded = currentRefunded + amount;
    if (newRefunded > payment.amount) throw new Error('Refund amount exceeds payment amount');
    const newStatus = newRefunded >= payment.amount ? 'refunded' : 'partially_refunded';
    const { error } = await admin
      .from('payments')
      .update({ refund_amount: newRefunded, status: newStatus })
      .eq('id', paymentId);
    if (error) throw new Error(error.message);
    if (payment.payment_method === 'bnpl') {
      const { data: order } = await admin
        .from('orders')
        .select('*, credit_transactions(*)')
        .eq('id', payment.order_id)
        .single();
      if (order) {
        const { data: creditTx } = await admin
          .from('credit_transactions')
          .select('credit_account_id')
          .eq('order_id', payment.order_id)
          .eq('type', 'purchase')
          .single();
        if (creditTx) {
          await admin
            .from('credit_accounts')
            .update({
              available_credit: admin.rpc('', {}).then,
            })
            .eq('id', creditTx.credit_account_id);
        }
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
    const admin = createAdminClient();
    const { search, page = 1, pageSize = 50, sortBy = 'created_at', sortOrder = 'desc', fromDate, toDate, tableName } = filter;
    let query = admin
      .from('audit_logs')
      .select('*, profile:profiles!changed_by(full_name)', { count: 'exact' });
    if (tableName) query = query.eq('table_name', tableName);
    if (search) {
      query = query.or(
        `table_name.ilike.%${search}%,action.ilike.%${search}%,record_id::text.ilike.%${search}%`,
      );
    }
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await query.range(from, to);
    const rawEntries = (data ?? []) as unknown as AuditEntry[];
    const entries = rawEntries.map((e) => {
      const entry = e as unknown as Record<string, unknown>;
      const profile = entry.profile as Record<string, unknown> | undefined;
      return { ...e, changed_by_name: (profile?.full_name as string) ?? null };
    });
    return {
      data: entries,
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async getSystemSettings(): Promise<SystemSetting[]> {
    const admin = createAdminClient();
    const fullSelect = 'id, key, value, type, is_secret, description, updated_by, created_at, updated_at';
    const baseSelect = 'id, key, value, type, description, updated_by, created_at, updated_at';

    // Try the full select first (is_secret exists after 20260811120000).
    const { data, error } = await admin
      .from('system_settings')
      .select(fullSelect)
      .order('key', { ascending: true });

    if (error && String(error.message).toLowerCase().includes('is_secret')) {
      // Fresh/legacy DB without is_secret column (migration not applied).
      // Fall back to the base columns and synthesize is_secret=false so the
      // settings page still renders and remains editable.
      const { data: fallback } = await admin
        .from('system_settings')
        .select(baseSelect)
        .order('key', { ascending: true });
      return ((fallback ?? []) as Array<Record<string, unknown>>).map((r) => ({
        ...r,
        is_secret: false,
      })) as unknown as SystemSetting[];
    }

    return (data ?? []) as SystemSetting[];
  }

  async updateSystemSetting(id: string, value: string, updatedBy: string): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('system_settings')
      .update({ value, updated_by: updatedBy, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async createAuditLog(entry: {
    table_name: string;
    record_id?: string | null;
    action: string;
    old_data?: Record<string, unknown> | null;
    new_data?: Record<string, unknown> | null;
    changed_by?: string | null;
  }): Promise<void> {
    const admin = createAdminClient();
    await admin.from('audit_logs').insert({
      table_name: entry.table_name,
      record_id: entry.record_id,
      action: entry.action,
      old_data: entry.old_data ?? null,
      new_data: entry.new_data ?? null,
      changed_by: entry.changed_by,
    });
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
