import { redirect } from 'next/navigation';
import { getServerSession, getServerProfile } from '@/features/auth/actions';
import { getOwnerEmail } from '@/lib/settings';
import { isOwnerEmail } from '@/config/auth-access';
import { getFirstAllowedAdminPage } from '@/lib/permissions';

export default async function DashboardPage() {
  const { user } = await getServerSession();
  if (!user) redirect('/auth/login');

  const { profile } = await getServerProfile();
  const role = profile?.role ?? user.role;

  // The store owner (Dilip Da) always lands on their read-only dashboard,
  // regardless of the role stored on the profile.
  const ownerEmail = await getOwnerEmail();
  if (isOwnerEmail(user.email, ownerEmail)) redirect('/dashboard/owner');

  if (role === 'owner') redirect('/dashboard/owner');
  if (role === 'student') redirect('/dashboard/student');
  if (role === 'merchant') redirect('/dashboard/merchant');
  if (role === 'delivery') redirect('/dashboard/delivery');

  const adminRoles = ['admin', 'super_admin', 'employee', 'staff', 'manager'];
  if (role && adminRoles.includes(role as string)) {
    const permissions = (profile as any)?.permissions || (user as any)?.permissions || [];
    const targetPage = getFirstAllowedAdminPage(permissions, role);
    redirect(targetPage);
  }

  redirect('/auth/onboarding');
}
