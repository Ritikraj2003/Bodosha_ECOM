'use server';

import { getSetting, getPaymentMethodAvailability } from '@/lib/settings';
import type { PaymentMethodAvailability } from '@/lib/settings';

/** Methods that are both enabled by the owner and configured. No secrets returned. */
export async function getAvailablePaymentMethods(): Promise<PaymentMethodAvailability[]> {
  return getPaymentMethodAvailability();
}

export async function createRazorpayOrder(amount: number, currency = 'INR'): Promise<
  { success: true; data: { id: string; amount: number; currency: string; keyId: string } } | { success: false; error: string }
> {
  const keyId = await getSetting('razorpay_key_id');
  const keySecret = await getSetting('razorpay_key_secret');

  if (!keyId || !keySecret) {
    return { success: false, error: 'Razorpay is not configured in the database settings.' };
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount),
        currency,
        receipt: `receipt_${Date.now()}`,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      if (res.status === 401 || res.status === 403) {
        return { success: false, error: 'Razorpay authentication failed — check that your Razorpay API key and secret are correct' };
      }
      return { success: false, error: err.error?.description || 'Failed to create Razorpay order' };
    }

    const order = await res.json();
    return { success: true, data: { id: order.id, amount: order.amount, currency: order.currency, keyId } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create Razorpay order' };
  }
}

export async function verifyRazorpayPayment(
  orderId: string,
  paymentId: string,
  signature: string
): Promise<{ success: boolean; error?: string }> {
  if (!paymentId) {
    return { success: false, error: 'Missing Razorpay payment ID' };
  }

  const secret = await getSetting('razorpay_key_secret');
  if (!secret) {
    return { success: false, error: 'Razorpay secret is not configured in the database settings.' };
  }

  try {
    if (orderId && signature) {
      const crypto = await import('crypto');
      const text = `${orderId}|${paymentId}`;
      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(text)
        .digest('hex');

      if (generatedSignature === signature) {
        return { success: true };
      }
    }

    // Secondary verification via Razorpay API GET /v1/payments/{id}
    const keyId = await getSetting('razorpay_key_id');
    if (keyId && secret) {
      const auth = Buffer.from(`${keyId}:${secret}`).toString('base64');
      const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (res.ok) {
        const paymentData = await res.json();
        if (['captured', 'authorized'].includes(paymentData.status)) {
          return { success: true };
        }
      }
    }

    return { success: false, error: 'Invalid Razorpay payment signature' };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Razorpay verification error' };
  }
}

export async function refundRazorpayPayment(
  paymentId: string,
  amountInRupees?: number,
  notes?: Record<string, string>
): Promise<{ success: boolean; refundId?: string; error?: string }> {
  if (!paymentId) return { success: false, error: 'Missing Razorpay Payment ID' };

  const keyId = await getSetting('razorpay_key_id');
  const keySecret = await getSetting('razorpay_key_secret');

  if (!keyId || !keySecret) {
    return { success: false, error: 'Razorpay is not configured' };
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const bodyPayload: Record<string, unknown> = {};
  if (amountInRupees && amountInRupees > 0) {
    bodyPayload.amount = Math.round(amountInRupees * 100);
  }
  if (notes) {
    bodyPayload.notes = notes;
  }

  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: Object.keys(bodyPayload).length > 0 ? JSON.stringify(bodyPayload) : undefined,
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error?.description || 'Failed to refund payment on Razorpay' };
    }

    return { success: true, refundId: data.id };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Razorpay refund error' };
  }
}

