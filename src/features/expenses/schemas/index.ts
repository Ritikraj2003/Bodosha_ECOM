import { z } from 'zod';

export const expenseTransactionSchema = z.object({
  transaction_date: z
    .string()
    .min(1, 'Date is required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(255, 'Description must be 255 characters or less'),
  amount: z
    .number({ error: 'Amount must be a number' })
    .positive('Amount must be greater than 0')
    .max(10000000, 'Amount cannot exceed ₹1,00,00,000'),
  type: z.enum(['income', 'expense'], {
    error: 'Type must be income or expense',
  }),
  note: z.string().trim().max(500, 'Note must be 500 characters or less').optional().nullable(),
});

export const updateExpenseTransactionSchema = expenseTransactionSchema.partial();

export const startingBalanceSchema = z.object({
  starting_balance: z
    .number({ error: 'Starting balance must be a number' })
    .min(0, 'Starting balance cannot be negative')
    .max(100000000, 'Starting balance cannot exceed ₹10,00,00,000'),
});

export type ExpenseTransactionSchema = z.infer<typeof expenseTransactionSchema>;
export type UpdateExpenseTransactionSchema = z.infer<typeof updateExpenseTransactionSchema>;
export type StartingBalanceSchema = z.infer<typeof startingBalanceSchema>;
