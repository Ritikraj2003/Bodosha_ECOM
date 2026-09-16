import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram';
import { adminRepository } from '@/features/admin/repositories';

const STATUS_LABELS: Record<string, string> = {
  accepted: '✅ Accepted',
  declined: '❌ Rejected',
  preparing: '👨‍🍳 Preparing',
  ready: '🍽️ Ready',
  out_for_delivery: '🚚 Out for Delivery',
  delivered: '📦 Delivered',
  completed: '✅ Completed',
  cancelled: '❌ Cancelled',
};

const VALID_STATUSES = ['accepted', 'declined', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Dev only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const orderId = searchParams.get('orderId');

  if (!action || !orderId) {
    return NextResponse.json({ error: 'Missing action or orderId' }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Valid: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    await adminRepository.updateOrderStatus(orderId, action, 'Dev test');
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Database error' }, { status: 500 });
  }

  const label = STATUS_LABELS[action] ?? action;
  await sendTelegramMessage(`<b>Dev Test:</b> Order <code>${orderId}</code> → ${label}`);

  return NextResponse.json({ success: true, action, orderId, status: label });
}
