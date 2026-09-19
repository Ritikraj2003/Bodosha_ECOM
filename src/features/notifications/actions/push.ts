'use server';

import { getServerSession } from '@/features/auth/actions';
import { query } from '@/infrastructure/db';

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
 * Handled via UPSERT on endpoint in PostgreSQL.
 */
export async function savePushSubscription(
  subscription: PushSubscriptionPayload,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await getServerSession();
    const userId = user?.id || null;

    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return { success: false, error: 'Invalid subscription payload' };
    }

    await query(
      `INSERT INTO public.user_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (endpoint)
       DO UPDATE SET
         user_id = COALESCE(EXCLUDED.user_id, public.user_push_subscriptions.user_id),
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = COALESCE(EXCLUDED.user_agent, public.user_push_subscriptions.user_agent),
         updated_at = NOW()`,
      [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent || null]
    );

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

    await query(
      `DELETE FROM public.user_push_subscriptions WHERE endpoint = $1`,
      [endpoint]
    );

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
      title: '🎉 Bodosa Alerts Active!',
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
