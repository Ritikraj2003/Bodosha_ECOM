import { envSchema, type EnvVars } from '@/schemas/env';

if (process.env.NODE_ENV !== 'production' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

let parsed: EnvVars | null = null;

function parseEnv(): EnvVars {
  if (parsed) return parsed;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Environment validation failed:\n${result.error.issues
          .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n')}`,
      );
    }
    console.warn('⚠ Environment validation warnings:', result.error.issues.map((i) => i.message).join(', '));
    parsed = result.data ?? Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k.startsWith('NEXT_PUBLIC_') || k === 'SUPABASE_SERVICE_ROLE_KEY' || k === 'RAZORPAY_KEY_SECRET'),
    ) as unknown as EnvVars;
  } else {
    parsed = result.data;
  }
  return parsed!;
}

export const env = {
  
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    isConfigured: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    name: process.env.NEXT_PUBLIC_APP_NAME ?? 'Dilip Da',
  },
  razorpay: {
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    isConfigured: !!(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
  },
  isValid: () => {
    try { parseEnv(); return true; }
    catch { return false; }
  },
};
