import { getServerSession } from '@/features/auth/actions';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';

const StudentCreditDashboard = dynamic(() => import('@/features/bnpl/components/StudentCreditDashboard'));

export default async function CreditDashboardPage() {
  const { user } = await getServerSession();
  if (!user) redirect('/auth/login?next=/dashboard/student/credit');

  return (
    <div className="page-pad">
      <div className="container-z mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ztext">Ethics Pay Dashboard</h1>
          <p className="text-sm text-ztext-light mt-1">
            Manage your BNPL credit, view transactions, and track repayments.
          </p>
        </div>
        <StudentCreditDashboard />
      </div>
    </div>
  );
}
