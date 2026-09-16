'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Root Error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-zred flex items-center justify-center mb-4 shadow-z">
        <AlertTriangle size={32} />
      </div>

      <h1 className="text-xl font-bold text-ztext mb-2">Something went wrong</h1>
      <p className="text-xs text-ztext-light max-w-md mb-6">
        An unexpected error occurred while processing your request. Please try refreshing or return to the homepage.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2.5 bg-zred text-white text-xs font-bold rounded-xl flex items-center gap-2 hover:bg-red-600 transition-colors shadow-z"
        >
          <RefreshCw size={14} /> Try Again
        </button>

        <Link
          href="/"
          className="px-4 py-2.5 bg-zgray text-ztext text-xs font-bold rounded-xl flex items-center gap-2 hover:bg-zborder transition-colors border border-zborder"
        >
          <Home size={14} /> Go to Homepage
        </Link>
      </div>
    </div>
  );
}
