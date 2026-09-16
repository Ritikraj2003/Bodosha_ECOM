'use server';

import { getServerSession } from '@/features/auth/actions';
import { createServiceClient } from '@/infrastructure/supabase/service';

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

/**
 * Save or update a browser push subscription for the authenticated user.
 * Handled via UPSERT on endpoint so multiple devices are supported without duplicates.
 */
export async function savePushSubscription(
  subscription: PushSubscriptionPayload,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await getServerSession();
    if (!user) {
      return { success: false, error: 'Unauthorized: User not signed in' };
    }

    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return { success: false, error: 'Invalid subscription payload' };
    }

    const supabase = createServiceClient();
    if (!supabase) {
      return { success: false, error: 'Database service client unavailable' };
    }

    const { error } = await supabase
      .from('user_push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: userAgent || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('savePushSubscription upsert error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('savePushSubscription error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save subscription',
    };
  }
}

/**
 * Remove a browser push subscription (e.g. when user explicitly turns off notifications or signs out).
 */
export async function removePushSubscription(
  endpoint: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!endpoint) {
      return { success: true };
    }

    const supabase = createServiceClient();
    if (!supabase) {
      return { success: false, error: 'Database service client unavailable' };
    }

    const { error } = await supabase
      .from('user_push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
      console.error('removePushSubscription delete error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('removePushSubscription error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove subscription',
    };
  }
}

/**
 * Send an immediate test push notification to the logged-in user.
 */
export async function sendTestPushNotification(): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await getServerSession();
    if (!user) {
      return { success: false, error: 'User not signed in' };
    }

    const { sendPushToUser } = await import('@/lib/push');
    const res = await sendPushToUser(user.id, {
      title: '🎉 Dilip Da Alerts Active!',
      body: 'Congratulations! Real-time notifications for kitchen orders & wallet fines are working on this device.',
      url: '/orders',
      tag: 'test-notification',
    });

    return { success: res.success, error: res.error };
  } catch (err: unknown) {
    console.error('sendTestPushNotification error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send test push',
    };
  }
}
