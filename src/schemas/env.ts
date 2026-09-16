import { z } from 'zod';

const urlOrLocalhost = z.string().refine((v) => {
  if (v === 'http://localhost:3000' || v.startsWith('http://localhost:')) return true;
  try { new URL(v); return true; } catch { return false; }
}, 'Must be a valid URL');

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: urlOrLocalhost.default('http://localhost:3000'),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('Dilip Da'),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  NOTIFICATION_EMAIL: z.string().email().optional(),
});

export type EnvVars = z.infer<typeof envSchema>;
