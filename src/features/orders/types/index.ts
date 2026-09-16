export type OrderStatus = 'pending' | 'accepted' | 'declined' | 'preparing' | 'ready' | 'assigned' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'assigned', 'out_for_delivery'];

export function isActiveOrder(status: OrderStatus): boolean {
  return ACTIVE_ORDER_STATUSES.includes(status);
}

export function isCompletedOrder(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'completed';
}

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';

export type PaymentMethod = 'razorpay' | 'bnpl' | 'cod' | 'cash' | 'upi' | 'wallet';

export type OrderType = 'room_delivery' | 'takeaway' | 'in_store' | 'dine_in';

export const ORDER_TYPES = [
  { id: 'room_delivery' as const, label: 'Hostel Delivery', icon: '🚚', description: 'Delivered to your hostel' },
  { id: 'takeaway' as const, label: 'Take Away', icon: '🥡', description: 'Pick up your order' },
  { id: 'in_store' as const, label: 'In Store', icon: '🏪', description: 'Counter POS order' },
] as const;

export function orderTypeLabel(type: OrderType | string | null | undefined): string {
  if (!type) return '';
  const found = ORDER_TYPES.find((ot) => ot.id === type);
  return found ? `${found.icon} ${found.label}` : type;
}

export function canPayOnDelivery(orderType: OrderType | string | null | undefined): boolean {
  return orderType === 'room_delivery' || !orderType;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  special_instructions: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  tracking_code: string;
  user_id: string | null;
  restaurant_id: string;
  delivery_address_id: string | null;
  delivery_partner_id: string | null;
  status: OrderStatus;
  status_history: Array<{ status: OrderStatus; timestamp: string; note?: string }> | null;
  subtotal: number;
  delivery_fee: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  delivery_address: Record<string, unknown> | null;
  delivery_notes: string | null;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  order_type: OrderType | null;
  delivery_slot_id?: string | null;
  delivery_slot_label?: string | null;
  delivery_slot_time?: string | null;
  delivery_slot_date?: string | null;
  delivery_slot_cutoff?: string | null;
  scheduled_at: string | null;
  accepted_at: string | null;
  prepared_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
}

export interface OrdersFilter {
  status?: OrderStatus | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'created_at' | 'total' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['accepted', 'declined'],
  accepted: ['preparing', 'cancelled'],
  declined: [],
  preparing: ['ready', 'cancelled'],
  ready: ['assigned', 'out_for_delivery', 'delivered', 'completed', 'cancelled'],
  assigned: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getOrderTimelineEvent(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    pending: 'Order placed',
    accepted: 'Order accepted',
    declined: 'Order declined',
    preparing: 'Preparing your food',
    ready: 'Order ready',
    assigned: 'Delivery partner assigned',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return map[status] ?? status;
}
