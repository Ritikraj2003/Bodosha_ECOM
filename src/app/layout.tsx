import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Providers } from '@/providers';
import Footer from '@/components/shared/Footer';
import MaintenanceGate from '@/components/shared/MaintenanceGate';
import './globals.css';

const NavbarWrapper = dynamic(() => import('@/components/shared/NavbarWrapper'));
const BottomNav = dynamic(() => import('@/components/shared/BottomNav'));
const FloatingCartBar = dynamic(() => import('@/components/landing/FloatingCartBar'));
const Toast = dynamic(() => import('@/components/shared/Toast'));
const FlyingBird = dynamic(() => import('@/components/shared/FlyingBird'));
const FavoritesSync = dynamic(() => import('@/components/shared/FavoritesSync'));
const PageLoader = dynamic(() => import('@/components/shared/PageLoader'));
const PushNotificationManager = dynamic(() => import('@/components/notifications/PushNotificationManager'));


export const metadata: Metadata = {
  title: {
    template: '%s | Dilip Da',
    default: 'Dilip Da — Homestyle Meals near CIT Kokrajhar',
  },
  description: 'Dilip Da is a homestyle food service run by Dilip da, serving fresh meals near CIT Kokrajhar. Order online for delivery.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.add('light-mode');var blocked=['fdprocessedid','cz-shortcut-listen'];function strip(el){for(var i=0;i<blocked.length;i++){if(el.hasAttribute(blocked[i]))el.removeAttribute(blocked[i]);}}document.querySelectorAll('['+blocked.join('],[')+']').forEach(strip);var o=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){for(var i=0;i<blocked.length;i++){if(n===blocked[i])return;}return o.call(this,n,v)};var on=Element.prototype.setAttributeNS;Element.prototype.setAttributeNS=function(ns,n,v){for(var i=0;i<blocked.length;i++){if(n===blocked[i])return;}return on.call(this,ns,n,v)};if(window.MutationObserver){new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){var m=muts[i];if(m.type==='attributes'&&blocked.indexOf(m.attributeName)!==-1){m.target.removeAttribute(m.attributeName);}}}).observe(document.documentElement,{attributes:true,attributeFilter:blocked,subtree:true});}})()` }} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body suppressHydrationWarning className="min-h-screen bg-zbg font-sans antialiased overflow-x-hidden w-full max-w-full">
        <Providers>
          <PageLoader />
          <NavbarWrapper />
          <main className="min-h-[calc(100vh-4rem)] has-bottom-nav overflow-x-hidden w-full max-w-full">
            <MaintenanceGate>{children}</MaintenanceGate>
          </main>
          <Footer />
          <FlyingBird />
          <BottomNav />
          <FloatingCartBar />
          <Toast />
          <FavoritesSync />
          <PushNotificationManager />
        </Providers>
      </body>
    </html>
  );
}
