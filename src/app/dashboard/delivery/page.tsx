import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getServerSession, getServerProfile } from '@/features/auth/actions';

const DeliveryDashboard = dynamic(() => import('@/features/delivery/components/DeliveryDashboard'));

export default async function DeliveryDashboardPage() {
  const { user } = await getServerSession();
  if (!user) redirect('/auth/login');

  const { profile } = await getServerProfile();
  if (profile?.role !== 'delivery') redirect('/');

  return <DeliveryDashboard />;
}
