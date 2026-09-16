import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Razorpay Service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  describe('loadRazorpayScript', () => {
    it('resolves true when Razorpay already loaded', async () => {
      vi.stubGlobal('window', { Razorpay: vi.fn() });
      const { loadRazorpayScript } = await import('@/features/payments/services/razorpay');

      const result = await loadRazorpayScript();

      expect(result).toBe(true);
    });

    it('appends script tag and resolves true on load', async () => {
      const mockScript = { onload: null, onerror: null };
      vi.stubGlobal('window', {});
      vi.stubGlobal(
        'document',
        {
          createElement: vi.fn(() => mockScript),
          body: { appendChild: vi.fn() },
        } as unknown as Document,
      );

      const { loadRazorpayScript } = await import('@/features/payments/services/razorpay');

      const promise = loadRazorpayScript();
      mockScript.onload?.();
      const result = await promise;

      expect(result).toBe(true);
      expect(document.createElement).toHaveBeenCalledWith('script');
    });

    it('resolves false on script load error', async () => {
      const mockScript = { onload: null, onerror: null };
      vi.stubGlobal('window', {});
      vi.stubGlobal(
        'document',
        {
          createElement: vi.fn(() => mockScript),
          body: { appendChild: vi.fn() },
        } as unknown as Document,
      );

      const { loadRazorpayScript } = await import('@/features/payments/services/razorpay');

      const promise = loadRazorpayScript();
      mockScript.onerror?.();
      const result = await promise;

      expect(result).toBe(false);
    });
  });

  describe('openRazorpayCheckout', () => {
    it('opens Razorpay checkout with correct options', async () => {
      const openMock = vi.fn();
      const RazorpayMock = vi.fn(function () {
        return { open: openMock };
      });
      vi.stubGlobal('window', { Razorpay: RazorpayMock });

      const { openRazorpayCheckout } = await import('@/features/payments/services/razorpay');

      const onSuccess = vi.fn();
      const onFailure = vi.fn();
      openRazorpayCheckout({
        key: 'rzp_test_key',
        amount: 50000,
        name: 'Dilip Da',
        orderId: 'order_test_123',
        onSuccess,
        onFailure,
      });

      expect(RazorpayMock).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'rzp_test_key',
          amount: 50000,
          currency: 'INR',
          name: 'Dilip Da',
          order_id: 'order_test_123',
        }),
      );
      expect(openMock).toHaveBeenCalledOnce();
    });

    it('calls onSuccess when payment succeeds', async () => {
      let handler: ((response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void) | null = null;
      const RazorpayMock = vi.fn(function (options: { handler: typeof handler }) {
        handler = options.handler;
        return { open: vi.fn() };
      });
      vi.stubGlobal('window', { Razorpay: RazorpayMock });

      const { openRazorpayCheckout } = await import('@/features/payments/services/razorpay');

      const onSuccess = vi.fn();
      openRazorpayCheckout({
        key: 'rzp_test_key',
        amount: 50000,
        name: 'Dilip Da',
        onSuccess,
        onFailure: vi.fn(),
      });

      handler?.({
        razorpay_payment_id: 'pay_test_1',
        razorpay_order_id: 'order_test_1',
        razorpay_signature: 'sig_test_1',
      });

      expect(onSuccess).toHaveBeenCalledWith({
        razorpay_payment_id: 'pay_test_1',
        razorpay_order_id: 'order_test_1',
        razorpay_signature: 'sig_test_1',
      });
    });

    it('calls onFailure when modal is dismissed', async () => {
      let ondismiss: (() => void) | null = null;
      const RazorpayMock = vi.fn(function (options: { modal: { ondismiss: typeof ondismiss } }) {
        ondismiss = options.modal.ondismiss;
        return { open: vi.fn() };
      });
      vi.stubGlobal('window', { Razorpay: RazorpayMock });

      const { openRazorpayCheckout } = await import('@/features/payments/services/razorpay');

      const onFailure = vi.fn();
      openRazorpayCheckout({
        key: 'rzp_test_key',
        amount: 50000,
        name: 'Dilip Da',
        onSuccess: vi.fn(),
        onFailure,
      });

      ondismiss?.();

      expect(onFailure).toHaveBeenCalledWith('Payment cancelled');
    });
  });
});
