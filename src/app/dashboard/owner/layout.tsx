import { redirect } from 'next/navigation';
import { getServerSession } from '@/features/auth/actions';
import { getOwnerEmail } from '@/lib/settings';
import { isOwnerEmail } from '@/config/auth-access';
import OwnerShell from './OwnerShell';

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getServerSession();
  if (!user) redirect('/auth/login');

  // Only the owner email configured in General Settings may view this console.
  const ownerEmail = await getOwnerEmail();
  if (!isOwnerEmail(user.email, ownerEmail)) {
    redirect(user.role === 'admin' || user.role === 'super_admin' ? '/dashboard/admin' : '/dashboard');
  }

  return <OwnerShell>{children}</OwnerShell>;
}