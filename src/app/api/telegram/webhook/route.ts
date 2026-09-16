import { NextResponse } from 'next/server';
import { createServiceClient } from '@/infrastructure/supabase/service';
import { editTelegramMessage, answerCallbackQuery, telegramChatId } from '@/lib/telegram';
import { getStatusButtons } from '@/lib/notifications';
import { adminRepository } from '@/features/admin/repositories';
import { canTransition, type OrderStatus } from '@/features/orders/types';

const STATUS_BADGE: Record<string, string> = {
  pending: '⏳ Pending',
  accepted: '✅ Accepted',
  declined: '❌ Rejected',
  preparing: '👨‍🍳 Preparing',
  ready: '🍽️ Ready',
  assigned: '🛵 Assigned',
  out_for_delivery: '🚚 Out for Delivery',
  delivered: '📦 Delivered',
  completed: '✅ Completed',
  cancelled: '❌ Cancelled',
};

const LEGACY_ACTION_ALIASES: Record<string, string> = {
  accept: 'accepted',
  reject: 'declined',
};

async function updateOrderStatus(
  orderId: string,
  newStatus: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await adminRepository.getOrderById(orderId);
    if (!order) return { success: false, error: 'Order not found' };

    if (!canTransition(order.status as OrderStatus, newStatus as OrderStatus)) {
      return { success: false, error: `Invalid transition from ${order.status} to ${newStatus}` };
    }

    await adminRepository.updateOrderStatus(orderId, newStatus, 'Telegram update');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Database error' };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.callback_query) {
      return NextResponse.json({ ok: true });
    }

    const { id: callbackId, from, data, message } = body.callback_query;

    const authorizedChatId = await telegramChatId();
    const isUserAuthorized = authorizedChatId !== null && (
      String(from.id) === String(authorizedChatId) ||
      (message?.chat && String(message.chat.id) === String(authorizedChatId))
    );
    if (!isUserAuthorized) {
      await answerCallbackQuery(callbackId, 'Unauthorized');
      return NextResponse.json({ ok: false, error: 'Unauthorized' });
    }

    if (!data || !data.includes(':')) {
      await answerCallbackQuery(callbackId, 'Invalid action');
      return NextResponse.json({ ok: false, error: 'Invalid action' });
    }

    const [rawStatus, orderId] = data.split(':') as [string, string];
    const chatId = message.chat.id;
    const msgId = message.message_id;

    const newStatus = LEGACY_ACTION_ALIASES[rawStatus] ?? rawStatus;

    const validStatuses = ['accepted', 'declined', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      await answerCallbackQuery(callbackId, 'Invalid status');
      return NextResponse.json({ ok: false, error: 'Invalid status' });
    }

    const supabase = createServiceClient();
    if (!supabase) {
      await answerCallbackQuery(callbackId, 'Service unavailable');
      return NextResponse.json({ ok: false, error: 'Service unavailable' });
    }

    const { data: orderData } = await supabase
      .from('orders')
      .select('status, tracking_code')
      .eq('id', orderId)
      .single();

    if (!orderData) {
      await answerCallbackQuery(callbackId, 'Order not found');
      return NextResponse.json({ ok: false, error: 'Order not found' });
    }

    const result = await updateOrderStatus(orderId, newStatus);
    if (!result.success) {
      await answerCallbackQuery(callbackId, result.error || 'Failed to update order');
      return NextResponse.json({ ok: false });
    }

    const badge = STATUS_BADGE[newStatus] ?? newStatus;
    const updatedText = message.text.replace(/\n\n[^\n]+$/, `\n\n${badge}`);

    const nextButtons = getStatusButtons(orderId, newStatus);
    await editTelegramMessage(chatId, msgId, updatedText, nextButtons);

    const toastLabels: Record<string, string> = {
      accepted: 'Order accepted ✅',
      declined: 'Order rejected ❌',
      preparing: 'Preparing 👨‍🍳',
      ready: 'Order ready 🍽️',
      out_for_delivery: 'Out for delivery 🚚',
      delivered: 'Delivered 📦',
      completed: 'Completed ✅',
      cancelled: 'Cancelled ❌',
    };
    await answerCallbackQuery(callbackId, toastLabels[newStatus] ?? 'Done');

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal error' });
  }
}
