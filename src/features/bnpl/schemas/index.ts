import { z } from 'zod/v4';

const amountSchema = z.number().positive('Amount must be positive').finite();

export const creditVerificationSchema = z.object({
  userId: z.string().uuid(),
  verificationStatus: z.enum(['verified', 'rejected']),
  reason: z.string().optional(),
});

export const creditLimitSchema = z.object({
  userId: z.string().uuid(),
  creditLimit: z.number().min(100, 'Minimum limit is ₹100').max(100000, 'Maximum limit is ₹1,00,000'),
  reason: z.string().min(1, 'Reason is required'),
});

export const bnplCheckoutSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  amount: amountSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const repaymentSchema = z.object({
  repaymentId: z.string().uuid(),
  amount: amountSchema.optional(),
  gatewayPaymentId: z.string().optional(),
  paymentMethod: z.enum(['razorpay', 'wallet']).optional(),
});

export const lateFeeSchema = z.object({
  creditAccountId: z.string().uuid(),
  amount: amountSchema,
  description: z.string().optional(),
  config: z.object({
    dailyRate: z.number().min(0).optional(),
    weeklyRate: z.number().min(0).optional(),
    percentageRate: z.number().min(0).max(100).optional(),
    fixedAmount: z.number().min(0).optional(),
    gracePeriodDays: z.number().int().min(0).default(3),
    maxFeeAmount: z.number().min(0).optional(),
  }),
});

export const creditAdjustmentSchema = z.object({
  creditAccountId: z.string().uuid(),
  amount: amountSchema,
  type: z.enum(['debit', 'credit']),
  reason: z.string().min(1, 'Reason is required'),
});

export const dueDateSchema = z.object({
  creditAccountId: z.string().uuid(),
  orderId: z.string().uuid(),
  amount: amountSchema,
  dueDays: z.number().int().min(1).max(90).default(15),
});

export type CreditVerificationInput = z.infer<typeof creditVerificationSchema>;
export type CreditLimitInput = z.infer<typeof creditLimitSchema>;
export type BNPLCheckoutInput = z.infer<typeof bnplCheckoutSchema>;
export type RepaymentInput = z.infer<typeof repaymentSchema>;
export type LateFeeInput = z.infer<typeof lateFeeSchema>;
export type CreditAdjustmentInput = z.infer<typeof creditAdjustmentSchema>;
export type DueDateInput = z.infer<typeof dueDateSchema>;
