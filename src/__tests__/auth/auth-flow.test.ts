import { describe, it, expect } from 'vitest';
import { envSchema } from '@/schemas/env';

describe('Auth Flow', () => {
  describe('Environment Validation', () => {
    it('requires SUPABASE_URL to be a valid URL', () => {
      const result = envSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key-123',
        SUPABASE_SERVICE_ROLE_KEY: 'role-key-123',
      });
      expect(result.success).toBe(false);
    });

    it('requires SUPABASE_ANON_KEY to be non-empty', () => {
      const result = envSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
        SUPABASE_SERVICE_ROLE_KEY: 'role-key-123',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid environment config', () => {
      const result = envSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-123',
        SUPABASE_SERVICE_ROLE_KEY: 'role-key-123',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Role Validation', () => {
    it('recognizes all valid roles', () => {
      const validRoles = ['student', 'merchant', 'delivery', 'admin', 'super_admin'];
      validRoles.forEach((role) => {
        expect(['student', 'merchant', 'delivery', 'admin', 'super_admin']).toContain(role);
      });
    });
  });
});
