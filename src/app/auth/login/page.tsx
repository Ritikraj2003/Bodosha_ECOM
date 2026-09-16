import dynamic from 'next/dynamic';
import type { Metadata } from 'next';

const LoginForm = dynamic(() => import('@/features/auth/components/LoginForm'));

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <section className="page-pad flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <LoginForm />
    </section>
  );
}
