'use client';

import { MapPin, Phone, Mail, Instagram, Facebook, Globe } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { usePublicSettings } from '@/hooks/usePublicSettings';

function waLink(value: string): string {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const digits = value.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

export default function Footer() {
  const pathname = usePathname();
  const settings = usePublicSettings();
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/dashboard')) return null;

  const support = settings.supportPhone || '6000212823';
  const whatsapp = waLink(settings.whatsapp || support);
  const socials = [
    { href: settings.instagram, icon: Instagram, label: 'Instagram' },
    { href: settings.facebook, icon: Facebook, label: 'Facebook' },
    { href: settings.website, icon: Globe, label: 'Website' },
  ].filter((s) => !!s.href);

  return (
    <footer className="bg-zgray border-t border-zborder py-6 pb-20 sm:pb-6">
      <div className="container-z mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/20 bg-black flex items-center justify-center shadow-sm">
              <img src="/logo.png" alt={process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe'} className="w-full h-full object-cover" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm text-zred tracking-wide">
                {(process.env.NEXT_PUBLIC_APP_NAME || 'BADMAAS').split(' ')[0]}
              </span>
              {(process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe').split(' ').slice(1).length > 0 && (
                <span className="text-xs text-ztext-light font-semibold">
                  &mdash; {(process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe').split(' ').slice(1).join(' ')}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-ztext-light">
            <span className="flex items-center gap-1">
              <MapPin size={11} /> {settings.address || 'Near CIT Kokrajhar'}
            </span>
            <span className="flex items-center gap-1">
              <Phone size={11} /> {support}
            </span>
            {settings.supportEmail && (
              <span className="flex items-center gap-1">
                <Mail size={11} /> {settings.supportEmail}
              </span>
            )}
            {(whatsapp || socials.length > 0) && (
              <span className="flex items-center gap-2">
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="text-ztext-light hover:text-zred transition-colors">
                    <Phone size={11} />
                  </a>
                )}
                {socials.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="text-ztext-light hover:text-zred transition-colors">
                    <s.icon size={11} />
                  </a>
                ))}
              </span>
            )}
            <span>&copy; {new Date().getFullYear()}</span>
            <span>Developed & Managed by <span className="font-semibold text-ztext">ANE services</span></span>
          </div>
        </div>
      </div>
    </footer>
  );
}