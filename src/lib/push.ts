import webpush from 'web-push';
import { query } from '@/infrastructure/db';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

// Configure VAPID keys once
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:ane.services';

let vapidConfigured = false;
if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    vapidConfigured = true;
  } catch (err) {
    console.error('Failed to configure web-push VAPID details:', err);
  }
}

/**
 * Send a native Web Push notification to all registered devices of a specific user.
 * Strictly targets only this user's endpoints.
 * Automatically cleans up expired/unsubscribed endpoints (410 Gone / 404 Not Found).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ success: boolean; sentCount: number; error?: string }> {
  if (!vapidConfigured) {
    console.warn('Web Push not configured: missing VAPID keys.');
    return { success: false, sentCount: 0, error: 'Web Push not configured' };
  }

  if (!userId) {
    return { success: false, sentCount: 0, error: 'userId is required' };
  }

  try {
    // 1. Fetch all active subscriptions for this specific user
    const res = await query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT endpoint, p256dh, auth FROM public.user_push_subscriptions WHERE user_id = $1`,
      [userId]
    );
    const subscriptions = res.rows;

    if (!subscriptions || subscriptions.length === 0) {
      // User has not subscribed on any device yet
      return { success: true, sentCount: 0 };
    }

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      tag: payload.tag || 'dilip-da-notice',
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      data: payload.data || {},
    });

    let sentCount = 0;
    const expiredEndpoints: string[] = [];

    // 2. Dispatch to each registered device
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };

          await webpush.sendNotification(pushSubscription, payloadString);
          sentCount++;
        } catch (err: unknown) {
          const pushErr = err as { statusCode?: number; message?: string };
          // 410 Gone or 404 Not Found: subscription is permanently inactive
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          } else {
            console.warn(`Push dispatch failed for endpoint: ${sub.endpoint.slice(0, 30)}...`, pushErr.message);
          }
        }
      })
    );

    // 3. Clean up dead/expired endpoints automatically
    if (expiredEndpoints.length > 0) {
      await query(
        `DELETE FROM public.user_push_subscriptions WHERE endpoint = ANY($1::text[])`,
        [expiredEndpoints]
      );
    }

    return { success: true, sentCount };
  } catch (err: unknown) {
    console.error(`sendPushToUser unexpected error for user ${userId}:`, err);
    return {
      success: false,
      sentCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Helper to dispatch push notification for order lifecycle steps to the customer.
 */
export async function notifyOrderStatusPush(params: {
  userId?: string | null;
  orderId: string;
  trackingCode?: string | null;
  status: string;
  note?: string | null;
  partnerName?: string | null;
}) {
  if (!params.userId) return;

  const code = params.trackingCode || params.orderId.slice(0, 8).toUpperCase();
  const url = `/orders/${params.orderId}`;
  const tag = `order-${params.orderId}`;

  let title = `Order Update: #${code}`;
  let body = `Your order status changed to ${params.status}.`;

  switch (params.status) {
    case 'accepted':
      title = `Order Confirmed! ✅`;
      body = `Your order #${code} has been accepted by the kitchen.`;
      break;
    case 'preparing':
      title = `Preparing Your Food 🍳`;
      body = `The kitchen has started preparing your order #${code}.`;
      break;
    case 'ready':
      title = `Order Packed & Ready! 🥡`;
      body = `Your order #${code} is ready for pickup/dispatch.`;
      break;
    case 'assigned':
      title = `Delivery Partner Assigned 🛵`;
      body = `${params.partnerName || 'A delivery partner'} is on the way to pick up order #${code}.`;
      break;
    case 'out_for_delivery':
      title = `Out for Delivery 🚀`;
      body = `Your meal for order #${code} is out for delivery! Please keep your phone handy.`;
      break;
    case 'delivered':
    case 'completed':
      title = `Order Delivered 🎉`;
      body = `Order #${code} has been delivered. Enjoy your meal!`;
      break;
    case 'declined':
    case 'cancelled':
      title = `Order Cancelled ❌`;
      body = `Your order #${code} was cancelled.${params.note ? ` Reason: ${params.note}` : ''}`;
      break;
    default:
      title = `Order #${code} Update`;
      body = `Your order is now ${params.status}.`;
  }

  return sendPushToUser(params.userId, {
    title,
    body,
    url,
    tag,
  });
}

/**
 * Helper to dispatch push notification for late BNPL fines to the penalized student.
 */
export async function notifyBnplFinePush(params: {
  userId: string;
  amount: number;
  newBalance: number;
}) {
  if (!params.userId) return;

  return sendPushToUser(params.userId, {
    title: '⚠️ Late Repayment Fine Applied',
    body: `A late fine of ₹${params.amount} was applied to your wallet due to overdue BNPL payment. Current balance: ₹${params.newBalance}.`,
    url: '/dashboard/student',
    tag: 'bnpl-penalty',
  });
}

/**
 * Send a native Web Push notification to all Admin & Owner registered devices.
 * Triggered whenever ANY user places/books a new order.
 */
export async function sendPushToAdmins(
  payload: PushPayload
): Promise<{ success: boolean; sentCount: number; error?: string }> {
  if (!vapidConfigured) {
    console.warn('Web Push not configured: missing VAPID keys.');
    return { success: false, sentCount: 0, error: 'Web Push not configured' };
  }

  try {
    // 1. Fetch all admin/owner user IDs
    const { getAdminEmails, getOwnerEmail } = await import('@/lib/settings');
    const adminEmails = await getAdminEmails();
    const ownerEmail = await getOwnerEmail();
    const allEmails = [...adminEmails];
    if (ownerEmail) allEmails.push(ownerEmail.toLowerCase());

    const adminUsersRes = await query<{ id: string }>(
      `SELECT id FROM public.profiles 
       WHERE role IN ('admin', 'super_admin', 'owner')
          OR LOWER(email) = ANY($1::text[])`,
      [allEmails.length > 0 ? allEmails : ['__none__']]
    );

    const adminUserIds = adminUsersRes.rows.map((r) => r.id);

    if (adminUserIds.length === 0) {
      return { success: true, sentCount: 0 };
    }

    // 2. Fetch all active subscriptions belonging to these admins
    const subsRes = await query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT endpoint, p256dh, auth FROM public.user_push_subscriptions WHERE user_id = ANY($1::uuid[])`,
      [adminUserIds]
    );

    const subscriptions = subsRes.rows;

    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, sentCount: 0 };
    }

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/dashboard/admin/orders',
      tag: payload.tag || 'admin-new-order',
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      data: payload.data || {},
    });

    let sentCount = 0;
    const expiredEndpoints: string[] = [];

    // 3. Dispatch to all admin devices simultaneously
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };
          await webpush.sendNotification(pushSubscription, payloadString);
          sentCount++;
        } catch (err: unknown) {
          const pushErr = err as { statusCode?: number; message?: string };
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          } else {
            console.warn(`Admin push dispatch failed for ${sub.endpoint.slice(0, 30)}...`, pushErr.message);
          }
        }
      })
    );

    // 4. Auto-clean expired endpoints
    if (expiredEndpoints.length > 0) {
      await query(
        `DELETE FROM public.user_push_subscriptions WHERE endpoint = ANY($1::text[])`,
        [expiredEndpoints]
      );
    }

    return { success: true, sentCount };
  } catch (err: unknown) {
    console.error('sendPushToAdmins unexpected error:', err);
    return {
      success: false,
      sentCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Send a native Web Push notification to all Delivery Partner registered devices.
 * Triggered whenever an order is marked 'ready' for delivery.
 */
export async function sendPushToDeliveryPartners(
  payload: PushPayload
): Promise<{ success: boolean; sentCount: number; error?: string }> {
  if (!vapidConfigured) {
    console.warn('Web Push not configured: missing VAPID keys.');
    return { success: false, sentCount: 0, error: 'Web Push not configured' };
  }

  try {
    // 1. Fetch all delivery partner user IDs
    const { getDeliveryEmails } = await import('@/lib/settings');
    const deliveryEmails = await getDeliveryEmails();

    const deliveryUsersRes = await query<{ id: string }>(
      `SELECT id FROM public.profiles WHERE role = 'delivery' OR LOWER(email) = ANY($1::text[])
       UNION
       SELECT user_id AS id FROM public.delivery_partners WHERE user_id IS NOT NULL`,
      [deliveryEmails.length > 0 ? deliveryEmails : ['__none__']]
    );

    const deliveryUserIds = deliveryUsersRes.rows.map((r) => r.id).filter(Boolean);

    if (deliveryUserIds.length === 0) {
      return { success: true, sentCount: 0 };
    }

    // 2. Fetch all active subscriptions belonging to delivery partners
    const subsRes = await query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT endpoint, p256dh, auth FROM public.user_push_subscriptions WHERE user_id = ANY($1::uuid[])`,
      [deliveryUserIds]
    );

    const subscriptions = subsRes.rows;

    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, sentCount: 0 };
    }

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/dashboard/delivery',
      tag: payload.tag || 'delivery-order-ready',
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      data: payload.data || {},
    });

    let sentCount = 0;
    const expiredEndpoints: string[] = [];

    // 3. Dispatch to all delivery partner devices
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };
          await webpush.sendNotification(pushSubscription, payloadString);
          sentCount++;
        } catch (err: unknown) {
          const pushErr = err as { statusCode?: number; message?: string };
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          } else {
            console.warn(`Delivery push dispatch failed for ${sub.endpoint.slice(0, 30)}...`, pushErr.message);
          }
        }
      })
    );

    // 4. Auto-clean expired endpoints
    if (expiredEndpoints.length > 0) {
      await query(
        `DELETE FROM public.user_push_subscriptions WHERE endpoint = ANY($1::text[])`,
        [expiredEndpoints]
      );
    }

    return { success: true, sentCount };
  } catch (err: unknown) {
    console.error('sendPushToDeliveryPartners unexpected error:', err);
    return {
      success: false,
      sentCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
