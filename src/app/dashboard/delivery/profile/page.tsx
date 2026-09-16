import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getServerSession, getServerProfile } from '@/features/auth/actions';

const DeliveryProfile = dynamic(() => import('@/features/delivery/components/DeliveryProfile'));

export default async function DeliveryProfilePage() {
  const { user } = await getServerSession();
  if (!user) redirect('/auth/login');

  const { profile } = await getServerProfile();
  if (profile?.role !== 'delivery') redirect('/');

  return <DeliveryProfile />;
}
