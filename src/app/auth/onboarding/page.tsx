import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getServerSession } from '@/features/auth/actions';
import type { Metadata } from 'next';

const OnboardingForm = dynamic(() => import('@/features/auth/components/OnboardingForm'));

export const metadata: Metadata = { title: 'Set Up Your Account' };

export default async function OnboardingPage() {
  const { user } = await getServerSession();
  if (!user) redirect('/auth/login');
  if (user.role) redirect('/');

  return (
    <section className="page-pad flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <OnboardingForm />
    </section>
  );
}
