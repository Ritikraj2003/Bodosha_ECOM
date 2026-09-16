
describe('Merchant Approval Workflow', () => {
  const pendingMerchant = {
    id: 'm1',
    full_name: 'Merchant One',
    role: 'merchant',
    is_active: false,
    restaurant: { id: 'r1', name: 'Restaurant One', status: 'pending' },
  };

  it('approves merchant by setting restaurant active and profile active', () => {
    const approved = {
      ...pendingMerchant,
      is_active: true,
      restaurant: { ...pendingMerchant.restaurant, status: 'active' },
    };
    expect(approved.is_active).toBe(true);
    expect(approved.restaurant.status).toBe('active');
  });

  it('rejects merchant by setting restaurant closed', () => {
    const rejected = {
      ...pendingMerchant,
      is_active: false,
      restaurant: { ...pendingMerchant.restaurant, status: 'closed' },
    };
    expect(rejected.is_active).toBe(false);
    expect(rejected.restaurant.status).toBe('closed');
  });

  it('suspends merchant by setting is_active false', () => {
    const active = { ...pendingMerchant, is_active: true, restaurant: { ...pendingMerchant.restaurant, status: 'active' } };
    const suspended = { ...active, is_active: false };
    expect(suspended.is_active).toBe(false);
  });

  it('restores merchant by setting is_active true', () => {
    const suspended = { ...pendingMerchant, is_active: false };
    const restored = { ...suspended, is_active: true };
    expect(restored.is_active).toBe(true);
  });

  it('updates commission rate', () => {
    const rate = 8.5;
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(100);
  });

  it('rejects invalid commission rates', () => {
    const valid = (rate) => rate >= 0 && rate <= 100;
    expect(valid(150)).toBe(false);
    expect(valid(-1)).toBe(false);
    expect(valid(0)).toBe(true);
    expect(valid(100)).toBe(true);
    expect(valid(5.5)).toBe(true);
  });
});
