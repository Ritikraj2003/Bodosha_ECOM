'use client';

import Image from 'next/image';
import { UtensilsCrossed } from 'lucide-react';
import { useMenu } from '@/features/menu/components/MenuProvider';

interface OfferCardsProps {
  active: string;
  onSelect: (category: string) => void;
}

export default function OfferCards({ active, onSelect }: OfferCardsProps) {
  const { sections } = useMenu();

  function select(category: string) {
    onSelect(category);
    document.getElementById('recommended-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const allThumbnail = sections[0]?.items[0]?.img || '/images/Chicken Curry.jpg';

  return (
    <section className="py-5 sm:py-6 bg-zbg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="category-rail">
          {/* Explore card */}
          <button onClick={() => select('All')} className={`category-item ${active === 'All' ? 'active' : ''}`}>
            <span className="category-explore">
              <UtensilsCrossed size={22} />
            </span>
            <span className="category-label">Explore</span>
          </button>

          {/* All */}
          <button onClick={() => select('All')} className={`category-item ${active === 'All' ? 'active' : ''}`}>
            <Image
              src={allThumbnail}
              alt="All dishes"
              width={68}
              height={68}
              className="category-avatar"
              loading="lazy"
            />
            <span className="category-label">All</span>
          </button>

          {sections.map((s) => (
            <button
              key={s.category}
              onClick={() => select(s.category)}
              className={`category-item ${active === s.category ? 'active' : ''}`}
            >
              <Image
                src={s.items[0]?.img || '/images/Chicken Curry.jpg'}
                alt={s.category}
                width={68}
                height={68}
                className="category-avatar"
                loading="lazy"
              />
              <span className="category-label">{s.category}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
