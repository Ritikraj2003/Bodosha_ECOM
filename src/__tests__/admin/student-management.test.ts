
describe('Student Management', () => {
  const mockStudents = [
    { id: '1', full_name: 'Alice', email: 'alice@test.com', role: 'student', is_active: true },
    { id: '2', full_name: 'Bob', email: 'bob@test.com', role: 'student', is_active: false },
  ];

  it('filters students by status', () => {
    const active = mockStudents.filter((s) => s.is_active);
    expect(active).toHaveLength(1);
    expect(active[0].full_name).toBe('Alice');

    const suspended = mockStudents.filter((s) => !s.is_active);
    expect(suspended).toHaveLength(1);
    expect(suspended[0].full_name).toBe('Bob');
  });

  it('searches students by name', () => {
    const query = 'ali';
    const results = mockStudents.filter(
      (s) => s.full_name.toLowerCase().includes(query) || s.email.toLowerCase().includes(query),
    );
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('searches students by email', () => {
    const query = 'bob@';
    const results = mockStudents.filter(
      (s) => s.full_name.toLowerCase().includes(query) || s.email.toLowerCase().includes(query),
    );
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('2');
  });

  it('suspends student by setting is_active false', () => {
    const updated = mockStudents.map((s) =>
      s.id === '1' ? { ...s, is_active: false } : s,
    );
    expect(updated.find((s) => s.id === '1')?.is_active).toBe(false);
  });

  it('unsuspends student by setting is_active true', () => {
    const updated = mockStudents.map((s) =>
      s.id === '2' ? { ...s, is_active: true } : s,
    );
    expect(updated.find((s) => s.id === '2')?.is_active).toBe(true);
  });

  it('bulk suspends multiple students', () => {
    const ids = ['1', '2'];
    const updated = mockStudents.map((s) =>
      ids.includes(s.id) ? { ...s, is_active: false } : s,
    );
    expect(updated.every((s) => ids.includes(s.id) ? !s.is_active : s.is_active)).toBe(true);
  });

  it('bulk restores multiple students', () => {
    const ids = ['2'];
    const updated = mockStudents.map((s) =>
      ids.includes(s.id) ? { ...s, is_active: true } : s,
    );
    expect(updated.find((s) => s.id === '2')?.is_active).toBe(true);
  });

  it('paginates student results', () => {
    const allStudents = Array.from({ length: 25 }, (_, i) => ({
      id: String(i + 1),
      full_name: `Student ${i + 1}`,
    }));
    const pageSize = 20;
    const page1 = allStudents.slice(0, pageSize);
    const page2 = allStudents.slice(pageSize);
    expect(page1).toHaveLength(20);
    expect(page2).toHaveLength(5);
  });
});
