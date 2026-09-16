'use server';

import { getServerSession } from '@/features/auth/actions';
import { createServiceClient } from '@/infrastructure/supabase/service';

export async function getUserFavoriteIds(): Promise<{ success: boolean; data?: string[]; error?: string }> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const { data, error } = await supabase
    .from('favorites')
    .select('item_id')
    .eq('user_id', user.id);
  if (error) return { success: false, error: error.message };

  return { success: true, data: (data ?? []).map((row) => row.item_id) };
}

export async function addFavoriteItem(itemId: string): Promise<{ success: boolean; error?: string }> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const { error } = await supabase
    .from('favorites')
    .upsert({ user_id: user.id, item_id: itemId }, { onConflict: 'user_id,item_id' });
  if (error) return { success: false, error: error.message };

  return { success: true };
}

export async function removeFavoriteItem(itemId: string): Promise<{ success: boolean; error?: string }> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('item_id', itemId);
  if (error) return { success: false, error: error.message };

  return { success: true };
}
