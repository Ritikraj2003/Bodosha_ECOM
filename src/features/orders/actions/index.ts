'use server';

import { orderRepository } from '../repositories';
import { canTransition } from '../types';
import type { Order, OrderStatus, OrdersFilter, OrdersResponse } from '../types';
import { getServerSession } from '@/features/auth/actions';
import { restaurantRepository } from '@/features/restaurants/repositories';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function getMerchantId(): Promise<string | null> {
  return getServerSession().then(({ user }) => {
    if (!user) return null;
    return user.id;
  });
}

async function getMerchantRestaurantId(): Promise<string | null> {
  const userId = await getMerchantId();
  if (!userId) return null;
  const restaurant = await restaurantRepository.findByOwnerId(userId);
  return restaurant?.id ?? null;
}

export async function getOrders(filter: OrdersFilter = {}): Promise<ApiResponse<OrdersResponse>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const result = await orderRepository.findByRestaurant(restaurantId, filter);
  return { success: true, data: result };
}

export async function getOrder(orderId: string): Promise<ApiResponse<Order>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const order = await orderRepository.findById(orderId);
  if (!order || order.restaurant_id !== restaurantId) return { success: false, error: 'Order not found' };
  return { success: true, data: order };
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus, note?: string): Promise<ApiResponse<Order>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const order = await orderRepository.findById(orderId);
  if (!order || order.restaurant_id !== restaurantId) return { success: false, error: 'Order not found' };
  if (!canTransition(order.status, newStatus)) {
    return { success: false, error: `Cannot transition from ${order.status} to ${newStatus}` };
  }
  const updated = await orderRepository.updateStatus(orderId, newStatus, note);
  if (!updated) return { success: false, error: 'Failed to update order' };
  return { success: true, data: updated };
}

export async function getOrderCounts(): Promise<ApiResponse<Record<string, number>>> {
  const restaurantId = await getMerchantRestaurantId();
  if (!restaurantId) return { success: false, error: 'Unauthorized' };
  const statuses: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];
  const counts: Record<string, number> = {};
  for (const s of statuses) {
    counts[s] = await orderRepository.getOrderCountByStatus(restaurantId, s);
  }
  return { success: true, data: counts };
}

export async function acceptOrder(orderId: string): Promise<ApiResponse<Order>> {
  return updateOrderStatus(orderId, 'accepted');
}

export async function declineOrder(orderId: string, reason?: string): Promise<ApiResponse<Order>> {
  return updateOrderStatus(orderId, 'declined', reason);
}

export async function markPreparing(orderId: string): Promise<ApiResponse<Order>> {
  return updateOrderStatus(orderId, 'preparing');
}

export async function markReady(orderId: string): Promise<ApiResponse<Order>> {
  return updateOrderStatus(orderId, 'ready');
}

export async function markCompleted(orderId: string): Promise<ApiResponse<Order>> {
  return updateOrderStatus(orderId, 'completed');
}

export async function cancelOrder(orderId: string, reason?: string): Promise<ApiResponse<Order>> {
  return updateOrderStatus(orderId, 'cancelled', reason);
}
