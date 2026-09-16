interface RazorpayWindow {
  Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id?: string;
  method?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
}

interface RazorpayInstance {
  open: () => void;
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export async function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as RazorpayWindow).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function openRazorpayCheckout(options: {
  key: string;
  amount: number;
  currency?: string;
  name: string;
  description?: string;
  orderId?: string;
  method?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (response: RazorpayResponse) => void;
  onFailure: (error: string) => void;
}) {
  const rzp = new (window as unknown as RazorpayWindow).Razorpay({
    key: options.key,
    amount: options.amount,
    currency: options.currency ?? 'INR',
    name: options.name,
    description: options.description ?? '',
    order_id: options.orderId,
    method: options.method,
    prefill: options.prefill ?? {},
    handler(response: RazorpayResponse) {
      options.onSuccess(response);
    },
    modal: {
      ondismiss() {
        options.onFailure('Payment cancelled');
      },
    },
  });
  rzp.open();
}
