export interface Restaurant {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  cuisine_type: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  cover_image: string | null;
  logo_url: string | null;
  opening_time: string;
  closing_time: string;
  delivery_fee: number;
  min_order_amount: number;
  delivery_radius_km: number | null;
  is_active: boolean;
  is_open: boolean;
  status: 'pending' | 'active' | 'suspended' | 'closed';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RestaurantSettings {
  id: string;
  restaurant_id: string;
  prep_time_minutes: number;
  max_orders_slot: number;
  allow_preorder: boolean;
  allow_scheduled: boolean;
  gst_number: string | null;
  fssai_license: string | null;
  bank_account: string | null;
  upi_id: string | null;
  commission_rate: number;
  created_at: string;
  updated_at: string;
}

export interface MerchantDashboard {
  today_orders: number;
  pending_orders: number;
  preparing_orders: number;
  ready_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  today_revenue: number;
  weekly_revenue: number;
  monthly_revenue: number;
  average_order_value: number;
  active_products: number;
  low_stock_items: number;
  total_customers: number;
  popular_products: Array<{ id: string; name: string; count: number; revenue: number }>;
  recent_activity: Array<{
    id: string;
    type: 'order' | 'product' | 'payment';
    message: string;
    created_at: string;
  }>;
}

export interface RevenueOverview {
  daily: Array<{ date: string; revenue: number; orders: number }>;
  weekly: Array<{ week: string; revenue: number; orders: number }>;
  monthly: Array<{ month: string; revenue: number; orders: number }>;
}
