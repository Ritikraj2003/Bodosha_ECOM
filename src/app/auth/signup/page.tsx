import dynamic from 'next/dynamic';
import type { Metadata } from 'next';

const SignupForm = dynamic(() => import('@/features/auth/components/SignupForm'));

export const metadata: Metadata = { title: 'Sign Up' };

export default function SignupPage() {
  return (
    <section className="page-pad flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <SignupForm />
    </section>
  );
}
