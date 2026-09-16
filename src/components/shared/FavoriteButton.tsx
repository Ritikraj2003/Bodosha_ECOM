'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Heart } from 'lucide-react';
import { useFavoritesStore, FavoriteItem } from '@/features/favorites/store';
import { useAuthStore } from '@/features/auth/store';
import { addFavoriteItem, removeFavoriteItem } from '@/features/favorites/actions';
import { showToast } from '@/components/shared/Toast';

interface FavoriteButtonProps {
  item: FavoriteItem;
  className?: string;
}

export default function FavoriteButton({ item, className = '' }: FavoriteButtonProps) {
  const { isFavorite, addFavorite, removeFavorite } = useFavoritesStore();
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [animate, setAnimate] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setMounted(true); }, []);  

  const favorited = mounted ? isFavorite(item.id) : false;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading || busy) return;

    if (!isAuthenticated) {
      showToast('Please sign in to add items to your favourites', 3500);
      router.push(`/auth/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    setBusy(true);
    if (favorited) {
      const res = await removeFavoriteItem(item.id);
      if (res.success) {
        removeFavorite(item.id);
      } else {
        showToast(res.error ?? 'Failed to remove from favorites');
      }
    } else {
      const res = await addFavoriteItem(item.id);
      if (res.success) {
        addFavorite(item);
        setAnimate(true);
        setTimeout(() => setAnimate(false), 300);
      } else {
        showToast(res.error ?? 'Failed to save favorite');
      }
    }
    setBusy(false);
  };

  return (
    <button
      onClick={handleClick}
      className={`absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm border border-zborder z-10 transition-colors focus:outline-none ${className} ${animate ? 'animate-heart-pop' : ''}`}
      aria-label={favorited ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
    >
      <Heart
        size={14}
        className={`transition-colors duration-200 ${
          favorited ? 'fill-zred text-zred' : 'text-ztext-muted hover:text-ztext'
        }`}
      />
    </button>
  );
}
