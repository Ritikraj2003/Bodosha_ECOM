import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import StudentWalletDashboard from '@/features/wallet/components/StudentWalletDashboard';

export default async function StudentWalletPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect('/auth/login');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return (
    <div className="page-pad">
      <div className="container-z mx-auto max-w-4xl">
        {/* Back Navigation Button */}
        <div className="mb-4">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ztext-light hover:text-zred transition-colors group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to Profile
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-extrabold text-ztext tracking-tight">My Wallet</h1>
          <p className="text-xs sm:text-sm text-ztext-light mt-0.5">
            Manage your wallet cash, top up instantly, and track all your transactions.
          </p>
        </div>

        <StudentWalletDashboard />
      </div>
    </div>
  );
}
