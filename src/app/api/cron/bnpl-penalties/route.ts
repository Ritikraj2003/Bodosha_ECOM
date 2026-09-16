import { NextResponse } from 'next/server';
import { processBnplPenalties } from '@/features/wallet/actions';

// This endpoint should be protected, e.g., using a secret token or Vercel Cron header in production
// For now, we will allow it to be called without auth, but in a real app, you'd verify a CRON_SECRET.
export async function GET() {
  try {
    // Optional: Add a check for a CRON_SECRET environment variable here if you want to secure it.
    /*
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    */

    const result = await processBnplPenalties();
    
    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: `Processed penalties successfully. ${result.processedCount} wallets penalized.` 
      });
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
