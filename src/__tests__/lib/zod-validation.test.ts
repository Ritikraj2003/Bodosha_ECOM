import { describe, it, expect } from 'vitest';
import { repaymentRequestSchema, profileUpdateSchema, productSchema } from '../../schemas/api';


describe('repaymentRequestSchema', () => {
  it('accepts valid repayment request', () => {
    const result = repaymentRequestSchema.safeParse({
      repaymentId: '550e8400-e29b-41d4-a716-446655440000',
      amount: 1000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing repaymentId', () => {
    const result = repaymentRequestSchema.safeParse({ amount: 1000 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID', () => {
    const result = repaymentRequestSchema.safeParse({
      repaymentId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = repaymentRequestSchema.safeParse({
      repaymentId: '550e8400-e29b-41d4-a716-446655440000',
      amount: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe('profileUpdateSchema', () => {
  it('accepts valid profile update', () => {
    const result = profileUpdateSchema.safeParse({
      full_name: 'John Doe',
      phone: '9876543210',
      role: 'student',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = profileUpdateSchema.safeParse({ role: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid phone numbers', () => {
    expect(profileUpdateSchema.safeParse({ phone: '12345' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ phone: '12345678901' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ phone: 'abcdefghij' }).success).toBe(false);
  });

  it('accepts partial update', () => {
    const result = profileUpdateSchema.safeParse({ full_name: 'Jane' });
    expect(result.success).toBe(true);
  });
});

describe('productSchema', () => {
  it('accepts valid product', () => {
    const result = productSchema.safeParse({
      name: 'Kolkata Biryani',
      price: 280,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = productSchema.safeParse({ price: 280 });
    expect(result.success).toBe(false);
  });

  it('rejects zero price', () => {
    const result = productSchema.safeParse({ name: 'Item', price: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects spice level over 5', () => {
    const result = productSchema.safeParse({
      name: 'Extra Spicy',
      price: 100,
      spice_level: 10,
    });
    expect(result.success).toBe(false);
  });
});
