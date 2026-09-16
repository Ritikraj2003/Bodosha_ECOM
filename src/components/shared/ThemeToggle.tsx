'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
     
    setMounted(true);
    setIsLight(document.documentElement.classList.contains('light-mode'));
  }, []);

  function toggle() {
    const next = !isLight;
    if (next) {
      document.documentElement.classList.add('light-mode');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light-mode');
      localStorage.setItem('theme', 'dark');
    }
    setIsLight(next);
  }

  if (!mounted) return <div className={className} />;

  return (
    <button
      onClick={toggle}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={className}
    >
      {isLight ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
