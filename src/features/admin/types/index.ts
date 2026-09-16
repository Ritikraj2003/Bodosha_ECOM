export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface DashboardStats {
  total_users: number;
  total_students: number;
  total_merchants: number;
  total_restaurants: number;
  total_orders: number;
  active_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  total_revenue: number;
  today_revenue: number;
  weekly_revenue: number;
  monthly_revenue: number;
  bnpl_outstanding: number;
  total_credit_issued: number;
  total_credit_repaid: number;
  total_overdue_accounts: number;
  active_merchants: number;
  pending_merchant_approvals: number;
  recent_activity: ActivityEntry[];
}

export interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_name: string;
  created_at: string;
}

export interface AdminStudent {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  credit_account: {
    id: string;
    credit_limit: number;
    available_credit: number;
    outstanding: number;
    status: string;
    verification_status: string;
  } | null;
  wallet: {
    id: string;
    balance: number;
    status: string;
  } | null;
}

export interface AdminMerchant {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    is_open: boolean;
    city: string;
    commission_rate: number;
  } | null;
}

export interface AdminOrder {
  id: string;
  tracking_code: string;
  user_id: string | null;
  restaurant_id: string;
  status: string;
  status_history?: Array<Record<string, unknown>> | null;
  subtotal: number;
  delivery_fee: number;
  tax_amount: number;
  total: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  payment_method: string | null;
  payment_status: string;
  delivery_address: Record<string, unknown> | null;
  cancellation_reason: string | null;
  order_type: string | null;
  prepared_at?: string | null;
  accepted_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  delivery_slot_id?: string | null;
  delivery_slot_label?: string | null;
  delivery_slot_time?: string | null;
  delivery_slot_date?: string | null;
  delivery_slot_cutoff?: string | null;
  pickup_qr_token?: string | null;
  pickup_qr_expires_at?: string | null;
  created_at: string;
  updated_at: string;
  restaurant_name?: string;
  customer_name_display?: string;
  order_items?: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  user?: { full_name: string; email: string; phone?: string | null } | null;
  restaurant?: { name: string } | null;
  delivery_partner?: { full_name: string; phone: string | null } | null;
}

export interface CreditAccountAdmin {
  id: string;
  user_id: string;
  credit_limit: number;
  available_credit: number;
  outstanding: number;
  status: string;
  verification_status: string;
  credit_score: number | null;
  interest_rate: number;
  late_fee_rate: number;
  due_days: number;
  last_repayment_at: string | null;
  activated_at: string | null;
  created_at: string;
  user: { full_name: string; email: string } | null;
}

export interface PaymentAdmin {
  id: string;
  order_id: string;
  user_id: string | null;
  amount: number;
  currency: string;
  payment_method: string;
  gateway: string;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  status: string;
  failure_reason: string | null;
  refund_amount: number | null;
  created_at: string;
  order?: {
    tracking_code: string;
    status: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    user_id?: string | null;
    order_items?: Array<{
      id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
    }> | null;
  } | null;
  user?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  wallet_info?: string | null;
}

export interface DeliveryPartnerAdmin {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  vehicle_type: string;
  license_plate: string | null;
  is_available: boolean;
  is_online: boolean;
  rating: number | null;
  total_deliveries: number;
  deliveries_in_range: number;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  changed_by_name?: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  type: string;
  is_secret: boolean;
  has_value?: boolean;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminFilter {
  search?: string;
  status?: string;
  role?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  paymentMethodGroup?: 'online' | 'wallet' | 'cod' | 'all';
  fromDate?: string;
  toDate?: string;
}

export type EntityType = 'user' | 'student' | 'merchant' | 'restaurant' | 'order' | 'payment' | 'credit_account' | 'credit_transaction' | 'system_setting' | 'audit_log';
export type AdminAction = 'create' | 'update' | 'delete' | 'suspend' | 'unsuspend' | 'verify' | 'approve' | 'reject' | 'freeze' | 'unfreeze' | 'waive' | 'refund' | 'force_update';
