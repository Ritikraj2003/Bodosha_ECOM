import dynamic from 'next/dynamic';
import type { Metadata } from 'next';

const ResetPasswordForm = dynamic(() => import('./ResetPasswordForm'));

export const metadata: Metadata = { title: 'Reset Password' };

export default function ResetPasswordPage() {
  return (
    <section className="page-pad flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <ResetPasswordForm />
    </section>
  );
}
