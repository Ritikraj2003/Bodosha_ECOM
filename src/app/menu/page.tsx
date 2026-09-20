import dynamic from 'next/dynamic';
import Image from 'next/image';
import type { Metadata } from 'next';
import { getPublicMenu } from '@/features/menu/actions';
import { MenuProvider } from '@/features/menu/components/MenuProvider';

const MenuItems = dynamic(() => import('../(menu)/MenuItems').then((m) => ({ default: m.MenuItems })));

export const metadata: Metadata = { title: 'Menu' };

export default async function MenuPage() {
  const menu = await getPublicMenu();
  return (
    <div className="page-pad">
      <div className="container-z mx-auto max-w-5xl">
        {/* Menu hero banner */}
        <div className="relative h-[140px] sm:h-44 rounded-2xl overflow-hidden mb-4 mt-2 shadow-z border border-zborder bg-slate-900 group">
          <Image
            src="/images/Chicken Curry.jpg"
            alt="Delicious fresh food spread"
            fill
            priority
            className="object-cover opacity-55 transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 1024px) 100vw, 1024px"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/40 to-black/10 flex flex-col justify-end p-4 sm:p-5">
            <span className="self-start bg-white/20 backdrop-blur-md border border-white/20 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-[0.5px] mb-1.5">
              Chef&apos;s Selection
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Authentic Regional Dining</h1>
            <p className="text-xs text-slate-300 mt-0.5">Fresh ingredients prepared daily to order</p>
          </div>
        </div>

        <MenuProvider initialSections={menu.sections} initialSource={menu.source}>
          <MenuItems />
        </MenuProvider>
      </div>
    </div>
  );
}
