'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Global Document Error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#121212] text-white min-h-screen flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 text-center shadow-2xl space-y-4">
          <div className="w-14 h-14 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle size={28} />
          </div>

          <h1 className="text-lg font-bold text-white">Application Error</h1>
          <p className="text-xs text-gray-400">
            A critical error occurred while rendering the page.
          </p>

          <button
            onClick={() => reset()}
            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} /> Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
