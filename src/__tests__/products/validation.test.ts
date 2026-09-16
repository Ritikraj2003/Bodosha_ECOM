
import type { ProductFormData } from '@/features/products/types';

function validateProductForm(data: Partial<ProductFormData>): string[] {
  const errors: string[] = [];
  if (!data.name?.trim()) errors.push('Name is required');
  if (data.price === undefined || data.price <= 0) errors.push('Price must be greater than 0');
  if (data.unit && !['piece', 'plate', 'kg', 'g', 'ml', 'l', 'dozen', 'box'].includes(data.unit)) {
    errors.push('Invalid unit');
  }
  return errors;
}

describe('Product Validation', () => {
  it('accepts valid product', () => {
    const errors = validateProductForm({ name: 'Biryani', price: 250, unit: 'plate' });
    expect(errors).toHaveLength(0);
  });

  it('rejects empty name', () => {
    const errors = validateProductForm({ name: '', price: 250, unit: 'piece' });
    expect(errors).toContain('Name is required');
  });

  it('rejects zero price', () => {
    const errors = validateProductForm({ name: 'Item', price: 0, unit: 'piece' });
    expect(errors).toContain('Price must be greater than 0');
  });

  it('rejects negative price', () => {
    const errors = validateProductForm({ name: 'Item', price: -10, unit: 'piece' });
    expect(errors).toContain('Price must be greater than 0');
  });
});
