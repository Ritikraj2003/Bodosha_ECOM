import { z } from 'zod';

export const repaymentRequestSchema = z.object({
  repaymentId: z.string().uuid(),
  amount: z.number().positive().optional(),
  gatewayPaymentId: z.string().optional(),
});

export const roleSchema = z.enum(['student', 'merchant', 'delivery', 'admin', 'super_admin']);

export const profileUpdateSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^[0-9]{10}$/, 'Phone number must be exactly 10 digits').optional(),
  role: roleSchema.optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const productSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().positive(),
  description: z.string().max(1000).optional(),
  category_id: z.string().uuid().optional(),
  image: z.string().url().optional(),
  is_vegetarian: z.boolean().optional(),
  is_vegan: z.boolean().optional(),
  is_gluten_free: z.boolean().optional(),
  spice_level: z.number().int().min(0).max(5).optional(),
  preparation_time: z.number().int().positive().optional(),
  stock_quantity: z.number().int().min(0).optional(),
  track_inventory: z.boolean().optional(),
  unit: z.enum(['piece', 'plate', 'kg', 'g', 'ml', 'l', 'dozen', 'box']).optional(),
  tags: z.array(z.string()).optional(),
});
