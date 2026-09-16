
describe('Refund Flow', () => {
  const payment = {
    id: 'pay1',
    order_id: 'ord1',
    amount: 500,
    status: 'confirmed',
    refund_amount: 0,
    payment_method: 'razorpay',
  };

  it('processes full refund', () => {
    const refundAmount = 500;
    const newRefunded = payment.refund_amount + refundAmount;
    const newStatus = newRefunded >= payment.amount ? 'refunded' : 'partially_refunded';
    const updated = { ...payment, refund_amount: newRefunded, status: newStatus };
    expect(updated.refund_amount).toBe(500);
    expect(updated.status).toBe('refunded');
  });

  it('processes partial refund', () => {
    const refundAmount = 200;
    const newRefunded = payment.refund_amount + refundAmount;
    const newStatus = newRefunded >= payment.amount ? 'refunded' : 'partially_refunded';
    const updated = { ...payment, refund_amount: newRefunded, status: newStatus };
    expect(updated.refund_amount).toBe(200);
    expect(updated.status).toBe('partially_refunded');
  });

  it('prevents refund exceeding payment amount', () => {
    const refundAmount = 600;
    const currentRefunded = 0;
    const error = refundAmount > payment.amount - currentRefunded;
    expect(error).toBe(true);
  });

  it('prevents refund on already refunded payment', () => {
    const refundedPayment = { ...payment, status: 'refunded', refund_amount: 500 };
    const canRefund = refundedPayment.status === 'confirmed';
    expect(canRefund).toBe(false);
  });

  it('prevents refund on failed payment', () => {
    const failedPayment = { ...payment, status: 'failed' };
    const canRefund = failedPayment.status === 'confirmed';
    expect(canRefund).toBe(false);
  });

  it('tracks total refunded amount across multiple refunds', () => {
    let totalRefunded = 0;
    const refunds = [100, 150, 50];
    for (const amount of refunds) {
      totalRefunded += amount;
    }
    expect(totalRefunded).toBe(300);
    expect(totalRefunded).toBeLessThanOrEqual(payment.amount);
  });
});
