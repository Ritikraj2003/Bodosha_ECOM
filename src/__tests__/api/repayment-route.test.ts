import { vi } from 'vitest';

vi.mock('@/infrastructure/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/features/bnpl/services/repayment-service', () => ({
  repaymentService: {
    processFullRepayment: vi.fn(),
    processPartialRepayment: vi.fn(),
    processRazorpayRepayment: vi.fn(),
  },
}));

import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { repaymentService } from '@/features/bnpl/services/repayment-service';

const validBody = {
  repaymentId: '10000000-0000-4000-8000-000000000001',
  amount: 500,
};

async function callPost(url = 'http://localhost:3000/api/bnpl/repayment', init?: RequestInit) {
  const { POST } = await import('@/app/api/bnpl/repayment/route');
  const request = new Request(url, { method: 'POST', ...init });
  return POST(request);
}

describe('POST /api/bnpl/repayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('processes full repayment for authenticated user', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as never);
    vi.mocked(repaymentService.processFullRepayment).mockResolvedValue({ success: true });

    const response = await callPost('http://localhost:3000/api/bnpl/repayment', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ repaymentId: validBody.repaymentId }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it('processes partial repayment with amount', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as never);
    vi.mocked(repaymentService.processPartialRepayment).mockResolvedValue({ success: true });

    const response = await callPost('http://localhost:3000/api/bnpl/repayment', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(200);
    expect(repaymentService.processPartialRepayment).toHaveBeenCalledWith(
      validBody.repaymentId,
      validBody.amount,
    );
  });

  it('processes Razorpay repayment with gatewayPaymentId', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as never);
    vi.mocked(repaymentService.processRazorpayRepayment).mockResolvedValue({ success: true });

    const response = await callPost('http://localhost:3000/api/bnpl/repayment', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ repaymentId: validBody.repaymentId, gatewayPaymentId: 'pay_123' }),
    });

    expect(response.status).toBe(200);
    expect(repaymentService.processRazorpayRepayment).toHaveBeenCalledWith(
      validBody.repaymentId,
      'pay_123',
    );
  });

  it('rejects request with invalid body', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as never);

    const response = await callPost('http://localhost:3000/api/bnpl/repayment', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ repaymentId: 'not-a-uuid' }),
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Validation failed');
  });

  it('rejects unauthenticated requests', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const response = await callPost('http://localhost:3000/api/bnpl/repayment', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(401);
  });

  it('rejects cross-origin requests (CSRF)', async () => {
    const response = await callPost('http://localhost:3000/api/bnpl/repayment', {
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.com' },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('CSRF validation failed');
  });
});
