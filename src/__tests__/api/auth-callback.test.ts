import { vi } from 'vitest';

vi.mock('@/infrastructure/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { NextRequest } from 'next/server';

async function callGet(url: string) {
  const { GET } = await import('@/app/auth/callback/route');
  const request = new NextRequest(url);
  return GET(request);
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exchanges code for session and redirects to onboarding', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);

    const response = await callGet('http://localhost:3000/auth/callback?code=valid-code');

    expect(exchangeCodeForSession).toHaveBeenCalledWith('valid-code');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/onboarding');
  });

  it('redirects with next param when specified', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);

    const response = await callGet(
      'http://localhost:3000/auth/callback?code=valid-code&next=/dashboard/merchant',
    );

    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/merchant');
  });

  it('redirects to login on auth error when code exchange fails', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: { message: 'invalid code' } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);

    const response = await callGet('http://localhost:3000/auth/callback?code=invalid');

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/auth/login?error=auth_callback_error',
    );
  });

  it('redirects to login when no code provided', async () => {
    const response = await callGet('http://localhost:3000/auth/callback');

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/auth/login?error=auth_callback_error',
    );
  });

  it('handles missing supabase client gracefully', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(null);

    const response = await callGet('http://localhost:3000/auth/callback?code=test-code');

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/auth/login?error=auth_callback_error',
    );
  });
});
