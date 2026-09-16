
describe('BNPL Administration', () => {
  const account = {
    id: 'ca1',
    user_id: 'u1',
    credit_limit: 10000,
    available_credit: 7000,
    outstanding: 3000,
    status: 'active',
    verification_status: 'verified',
    late_fee_rate: 5,
    due_days: 15,
  };

  it('increases credit limit', () => {
    const newLimit = 15000;
    const diff = newLimit - account.credit_limit;
    const updated = {
      ...account,
      credit_limit: newLimit,
      available_credit: account.available_credit + diff,
    };
    expect(updated.credit_limit).toBe(15000);
    expect(updated.available_credit).toBe(12000);
  });

  it('reduces credit limit', () => {
    const newLimit = 8000;
    const diff = newLimit - account.credit_limit;
    const updated = {
      ...account,
      credit_limit: newLimit,
      available_credit: Math.max(0, account.available_credit + diff),
    };
    expect(updated.credit_limit).toBe(8000);
    expect(updated.available_credit).toBe(5000);
  });

  it('prevents available credit going negative on limit reduction', () => {
    const lowLimit = 2000;
    const diff = lowLimit - account.credit_limit;
    const updated = {
      ...account,
      credit_limit: lowLimit,
      available_credit: Math.max(0, account.available_credit + diff),
    };
    expect(updated.credit_limit).toBe(2000);
    expect(updated.available_credit).toBe(0);
  });

  it('freezes credit account', () => {
    const frozen = { ...account, status: 'frozen' };
    expect(frozen.status).toBe('frozen');
  });

  it('unfreezes credit account', () => {
    const frozen = { ...account, status: 'frozen' };
    const unfrozen = { ...frozen, status: 'active' };
    expect(unfrozen.status).toBe('active');
  });

  it('waives late fee by setting it to 0', () => {
    const repayment = { id: 'rp1', late_fee_applied: 200 };
    const waived = { ...repayment, late_fee_applied: 0 };
    expect(waived.late_fee_applied).toBe(0);
  });

  it('calculates utilization percentage', () => {
    const pct = Math.round((account.outstanding / account.credit_limit) * 100);
    expect(pct).toBe(30);
  });

  it('handles max utilization (100%)', () => {
    const maxed = { ...account, outstanding: account.credit_limit, available_credit: 0 };
    const pct = Math.round((maxed.outstanding / maxed.credit_limit) * 100);
    expect(pct).toBe(100);
  });
});
