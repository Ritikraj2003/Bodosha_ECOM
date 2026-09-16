import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { repaymentService } from '@/features/bnpl/services/repayment-service';
import { repaymentRequestSchema } from '@/schemas/api';
import { csrfGuard } from '@/lib/csrf';
import { rateLimit, RATE_LIMIT_CONFIGS, rateLimitKey } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const csrfResponse = csrfGuard(request);
  if (csrfResponse) return csrfResponse;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateResult = await rateLimit(rateLimitKey('repayment', ip), RATE_LIMIT_CONFIGS.strict);
  if (!rateResult.success) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const parsed = repaymentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) },
        { status: 400 },
      );
    }

    const { repaymentId, amount, gatewayPaymentId } = parsed.data;

    let result;
    if (gatewayPaymentId) {
      result = await repaymentService.processRazorpayRepayment(repaymentId, gatewayPaymentId);
    } else if (amount && amount > 0) {
      result = await repaymentService.processPartialRepayment(repaymentId, amount);
    } else {
      result = await repaymentService.processFullRepayment(repaymentId);
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Repayment failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
