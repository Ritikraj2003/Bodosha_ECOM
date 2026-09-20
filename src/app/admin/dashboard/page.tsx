import { redirect } from 'next/navigation';
import { getServerSession } from '@/features/auth/actions';
import { getFirstAllowedAdminPage } from '@/lib/permissions';

export default async function AdminDashboardAliasPage() {
  const { user } = await getServerSession();
  if (!user) {
    redirect('/auth/login?next=/admin/dashboard');
  }

  const permissions = (user as any)?.permissions || [];
  const targetPage = getFirstAllowedAdminPage(permissions, user.role);
  redirect(targetPage);
}
