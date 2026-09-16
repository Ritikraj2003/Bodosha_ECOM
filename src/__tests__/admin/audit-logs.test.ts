
describe('Audit Log Generation', () => {
  function createAuditEntry(overrides = {}) {
    return {
      id: 'audit-1',
      table_name: 'profiles',
      record_id: 'user-1',
      action: 'update',
      old_data: { is_active: true },
      new_data: { is_active: false, reason: 'Suspended by admin' },
      changed_by: 'admin-uuid',
      ip_address: '127.0.0.1',
      user_agent: 'Mozilla/5.0',
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('creates audit entry with required fields', () => {
    const entry = createAuditEntry();
    expect(entry.id).toBeDefined();
    expect(entry.table_name).toBeDefined();
    expect(entry.action).toBeDefined();
    expect(entry.created_at).toBeDefined();
  });

  it('tracks old and new values', () => {
    const entry = createAuditEntry();
    expect(entry.old_data).toEqual({ is_active: true });
    expect(entry.new_data).toEqual({ is_active: false, reason: 'Suspended by admin' });
  });

  it('records suspend action', () => {
    const entry = createAuditEntry({ action: 'suspend' });
    expect(entry.action).toBe('suspend');
  });

  it('records approve action', () => {
    const entry = createAuditEntry({ action: 'approve', table_name: 'restaurants' });
    expect(entry.action).toBe('approve');
    expect(entry.table_name).toBe('restaurants');
  });

  it('records refund action', () => {
    const entry = createAuditEntry({ action: 'refund', table_name: 'payments' });
    expect(entry.action).toBe('refund');
  });

  it('records force_update action for orders', () => {
    const entry = createAuditEntry({ action: 'force_update', table_name: 'orders' });
    expect(entry.action).toBe('force_update');
    expect(entry.table_name).toBe('orders');
  });

  it('records credit_limit_change action', () => {
    const entry = createAuditEntry({
      action: 'credit_limit_increase',
      table_name: 'credit_accounts',
      old_data: { credit_limit: 5000 },
      new_data: { credit_limit: 10000, reason: 'Good repayment history' },
    });
    expect(entry.action).toBe('credit_limit_increase');
    expect(entry.new_data.credit_limit).toBe(10000);
  });

  it('records freeze action', () => {
    const entry = createAuditEntry({ action: 'freeze', table_name: 'credit_accounts' });
    expect(entry.action).toBe('freeze');
  });

  it('filters audit entries by table name', () => {
    const entries = [
      createAuditEntry({ id: '1', table_name: 'profiles' }),
      createAuditEntry({ id: '2', table_name: 'orders' }),
      createAuditEntry({ id: '3', table_name: 'payments' }),
    ];
    const filtered = entries.filter((e) => e.table_name === 'orders');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });

  it('searches audit entries by action', () => {
    const entries = [
      createAuditEntry({ id: '1', action: 'suspend' }),
      createAuditEntry({ id: '2', action: 'approve' }),
      createAuditEntry({ id: '3', action: 'refund' }),
    ];
    const query = 'sus';
    const results = entries.filter(
      (e) => e.action.includes(query) || e.table_name.includes(query),
    );
    expect(results).toHaveLength(1);
  });

  it('paginates audit entries', () => {
    const entries = Array.from({ length: 100 }, (_, i) => createAuditEntry({ id: 'audit-' + i }));
    const page = 2;
    const pageSize = 50;
    const pageEntries = entries.slice((page - 1) * pageSize, page * pageSize);
    expect(pageEntries).toHaveLength(50);
    expect(pageEntries[0].id).toBe('audit-50');
  });
});
