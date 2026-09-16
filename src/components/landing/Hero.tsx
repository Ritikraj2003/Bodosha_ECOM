'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import BumperOffersSlider from '@/components/landing/BumperOffersSlider';
import type { BumperOfferItem } from '@/features/settings/actions';

const slides = [
  { img: '/images/Chicken Curry.jpg', top: 'Fresh thalis', bottom: 'from ₹60', note: 'Chicken, pork & veg thalis made fresh daily' },
  { img: '/images/Pork Thali.webp', top: 'Homestyle gravy', bottom: 'Chicken & Pork', note: 'Rich curries straight from the kitchen' },
  { img: '/images/Aloo Posto.jpg', top: 'Veg & Non-Veg', bottom: 'Both available', note: 'Classic homestyle dishes, every day' },
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
              placeholder="Search &quot;chicken thali&quot;"
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
              <div className="relative rounded-2xl overflow-hidden h-32 sm:h-44 lg:h-56 shadow-z">
                <div key={index} className="relative w-full h-full">
                  <Image
                    src={slides[index].img}
                    alt="Dilip Da specials"
                    fill
                    loading="eager"
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 1200px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/30 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-center px-4 sm:px-7">
                    <p className="text-white text-[10px] font-bold tracking-[0.2em] uppercase">{slides[index].top}</p>
                    <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-white leading-tight">{slides[index].bottom}</p>
                    <p className="mt-1 text-xs text-white/85">{slides[index].note}</p>
                    <Link
                      href="/menu"
                      className="mt-3 w-fit h-9 sm:h-10 px-5 inline-flex items-center justify-center gap-2 rounded-full bg-white text-zred text-xs sm:text-sm font-bold shadow-md transition-transform hover:-translate-y-0.5"
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
