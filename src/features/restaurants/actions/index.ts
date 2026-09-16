'use server';

import { restaurantRepository } from '../repositories';
import { getServerSession } from '@/features/auth/actions';
import type { MerchantDashboard, RevenueOverview, RestaurantSettings } from '../types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getMerchantRestaurant(): Promise<ApiResponse<{ id: string; name: string; slug: string; is_open: boolean }>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  const restaurant = await restaurantRepository.findByOwnerId(user.id);
  if (!restaurant) return { success: false, error: 'No restaurant found' };
  return { success: true, data: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug, is_open: restaurant.is_open } };
}

export async function getMerchantDashboard(): Promise<ApiResponse<MerchantDashboard>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  const restaurant = await restaurantRepository.findByOwnerId(user.id);
  if (!restaurant) return { success: false, error: 'No restaurant found' };
  const dashboard = await restaurantRepository.getDashboard(restaurant.id);
  if (!dashboard) return { success: false, error: 'Failed to load dashboard' };
  return { success: true, data: dashboard };
}

export async function getRevenueOverview(days = 30): Promise<ApiResponse<RevenueOverview>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  const restaurant = await restaurantRepository.findByOwnerId(user.id);
  if (!restaurant) return { success: false, error: 'No restaurant found' };
  const overview = await restaurantRepository.getRevenueOverview(restaurant.id, days);
  return { success: true, data: overview };
}

export async function getRestaurantSettings(): Promise<ApiResponse<RestaurantSettings>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  const restaurant = await restaurantRepository.findByOwnerId(user.id);
  if (!restaurant) return { success: false, error: 'No restaurant found' };
  const settings = await restaurantRepository.getSettings(restaurant.id);
  if (!settings) return { success: false, error: 'Settings not found' };
  return { success: true, data: settings };
}

export async function updateRestaurantSettings(updates: Partial<RestaurantSettings>): Promise<ApiResponse<RestaurantSettings>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  const restaurant = await restaurantRepository.findByOwnerId(user.id);
  if (!restaurant) return { success: false, error: 'No restaurant found' };
  const settings = await restaurantRepository.updateSettings(restaurant.id, updates);
  if (!settings) return { success: false, error: 'Failed to update settings' };
  return { success: true, data: settings };
}

export async function toggleRestaurantOpen(): Promise<ApiResponse<{ is_open: boolean }>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  const restaurant = await restaurantRepository.findByOwnerId(user.id);
  if (!restaurant) return { success: false, error: 'No restaurant found' };
  const supabase = await (await import('@/infrastructure/supabase/server')).createServerSupabaseClient();
  if (!supabase) return { success: false, error: 'Database error' };
  const { data } = await supabase
    .from('restaurants')
    .update({ is_open: !restaurant.is_open })
    .eq('id', restaurant.id)
    .select('is_open')
    .single();
  if (!data) return { success: false, error: 'Failed to toggle' };
  return { success: true, data: { is_open: data.is_open } };
}
