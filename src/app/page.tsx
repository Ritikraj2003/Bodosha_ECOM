import dynamicImport from 'next/dynamic';
import { getPublicMenu } from '@/features/menu/actions';

const HomeMenu = dynamicImport(() => import('@/components/landing/HomeMenu'));

export default async function Home() {
  const menu = await getPublicMenu();
  return <HomeMenu initialSections={menu.sections} initialSource={menu.source} />;
}