'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import BumperOffersSlider from '@/components/landing/BumperOffersSlider';
import type { BumperOfferItem } from '@/features/settings/actions';

const slides = [
  {
    img: '/images/hero-burger-banner.jpg',
    top: 'BUILT FOR BADMAAS',
    bottom: 'Juicy Double Trouble Burgers',
    note: 'Double chicken breast, molten cheese & golden crispy fries',
  },
  {
    img: '/images/hero-momos-banner.jpg',
    top: 'HOT & STEAMING',
    bottom: 'Authentic Momos & Dimsums',
    note: 'Steam, fried & pan-fried with fiery schezwan red chutney',
  },
  {
    img: '/images/hero-rolls-banner.jpg',
    top: 'CRISPY LACHHA PARATHA',
    bottom: 'Signature Rolls & Starters',
    note: 'Loaded chicken & paneer rolls, crispy chicken lollipops & tenders',
  },
  {
    img: '/images/hero-shakes-banner.jpg',
    top: 'BOLD SIPS & SHAKES',
    bottom: 'Cold Coffee, Shakes & Mojitos',
    note: 'Oreo crunch, KitKat fudge, cold coffee with ice cream & Blue Lagoon',
  },
];

interface HeroProps {
  query: string;
  onQueryChange: (q: string) => void;
  vegOn: boolean;
  onVegToggle: () => void;
  bumperOffers?: BumperOfferItem[];
  settingsLoading?: boolean;
}

export default function Hero({ query, onQueryChange, vegOn, onVegToggle, bumperOffers, settingsLoading }: HeroProps) {
  const [index, setIndex] = useState(0);

  const activeBumper = (bumperOffers ?? []).filter((o) => !!o.url);
  const showBumper = activeBumper.length > 0;

  useEffect(() => {
    if (showBumper) return; // bumper slider manages its own timing
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(id);
  }, [showBumper]);

  return (
    <section className="bg-zbg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4">
        {/* Search + veg toggle */}
        <div className="flex gap-2.5 animate-hero-in">
          <div className="flex-1 flex items-center gap-2.5 bg-zcard border border-zborder rounded-xl px-3.5 py-2.0 focus-within:border-zred/60 transition-colors">
            <Search size={16} className="text-ztext-muted shrink-0" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search dishes, drinks & snacks..."
              className="flex-1 bg-transparent text-[12px] text-ztext outline-none placeholder:text-ztext-muted min-w-0"
              aria-label="Search dishes"
            />
          </div>
          <button
            onClick={onVegToggle}
            className="flex flex-col items-center justify-center gap-0.5 shrink-0 rounded-xl bg-zcard border border-zborder px-2.5 transition-colors hover:border-zred/50"
            aria-label="Toggle veg mode"
            aria-pressed={vegOn}
          >
            <span className="text-[9px] font-bold text-ztext leading-none">VEG</span>
            <span className="text-[9px] font-bold text-ztext leading-none">MODE</span>
            <span className={`mt-1 w-8 h-4 rounded-full relative transition-colors ${vegOn ? 'bg-zgreen' : 'bg-zgray border border-zborder'}`}>
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${vegOn ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
          </button>
        </div>

        {/* Promo banner slider */}
        <div className="mt-3 sm:mt-4 animate-hero-in" style={{ animationDelay: '100ms' }}>
          {settingsLoading ? (
            <div className="relative rounded-2xl overflow-hidden h-32 sm:h-44 lg:h-56 bg-zgray animate-pulse" />
          ) : showBumper ? (
            <BumperOffersSlider items={activeBumper} />
          ) : (
            <>
              <div className="relative rounded-2xl overflow-hidden h-36 sm:h-48 lg:h-60 shadow-z border border-white/5">
                <div key={index} className="relative w-full h-full transition-opacity duration-300">
                  <Image
                    src={slides[index].img}
                    alt={slides[index].bottom}
                    fill
                    priority
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 1200px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-center px-4 sm:px-7 max-w-xl">
                    <p className="text-[#FF5A67] text-[10px] sm:text-xs font-black tracking-[0.2em] uppercase">{slides[index].top}</p>
                    <p className="mt-1 text-xl sm:text-3xl font-extrabold text-white leading-tight drop-shadow-sm">{slides[index].bottom}</p>
                    <p className="mt-1 text-xs sm:text-sm text-white/90 line-clamp-2">{slides[index].note}</p>
                    <Link
                      href="/menu"
                      className="mt-3 w-fit h-8 sm:h-10 px-4 sm:px-5 inline-flex items-center justify-center gap-1.5 rounded-full bg-white text-[#E23744] hover:bg-[#E23744] hover:text-white text-xs sm:text-sm font-black shadow-lg transition-all hover:scale-105 active:scale-95"
                    >
                      Order now <span className="text-sm">›</span>
                    </Link>
                  </div>
                </div>
              </div>
              <div className="slider-dots">
                {slides.map((s, i) => (
                  <button
                    key={s.top}
                    onClick={() => setIndex(i)}
                    className={`slider-dot ${i === index ? 'active' : ''}`}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
