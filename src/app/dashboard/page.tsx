import { redirect } from 'next/navigation';
import { getServerSession, getServerProfile } from '@/features/auth/actions';
import { getOwnerEmail } from '@/lib/settings';
import { isOwnerEmail } from '@/config/auth-access';

export default async function DashboardPage() {
  const { user } = await getServerSession();
  if (!user) redirect('/auth/login');

  const { profile } = await getServerProfile();
  const role = profile?.role ?? user.role;

  // The store owner (Dilip Da) always lands on their read-only dashboard,
  // regardless of the role stored on the profile.
  const ownerEmail = await getOwnerEmail();
  if (isOwnerEmail(user.email, ownerEmail)) redirect('/dashboard/owner');

  const dashboards: Record<string, string> = {
    student: '/dashboard/student',
    merchant: '/dashboard/merchant',
    delivery: '/dashboard/delivery',
    admin: '/dashboard/admin',
    super_admin: '/dashboard/admin',
    owner: '/dashboard/owner',
  };

  const dashboardPath = dashboards[role as string];
  if (!dashboardPath) redirect('/auth/onboarding');
  redirect(dashboardPath);
}
