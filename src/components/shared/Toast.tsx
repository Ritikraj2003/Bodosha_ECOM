'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastData {
  id: number;
  message: string;
}

let toastListeners: Array<(t: ToastData | null) => void> = [];

export function showToast(message: string, duration = 2600) {
  const id = Date.now();
  toastListeners.forEach((fn) => fn({ id, message }));
  setTimeout(() => {
    toastListeners.forEach((fn) => fn(null));
  }, duration);
}

export function addToastListener(fn: (t: ToastData | null) => void) {
  toastListeners.push(fn);
  return () => {
    toastListeners = toastListeners.filter((l) => l !== fn);
  };
}

export default function Toast() {
  const [notice, setNotice] = useState<ToastData | null>(null);

  useEffect(() => {
    const unsub = addToastListener(setNotice);
    return unsub;
  }, []);

  if (!notice) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg bg-zcard shadow-z-modal border border-zborder p-4 sm:left-auto sm:right-5 sm:translate-x-0">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="shrink-0" size={20} style={{ color: '#24963F' }} />
        <p className="flex-1 text-sm font-semibold text-ztext">{notice.message}</p>
        <button className="grid size-8 place-items-center text-ztext-lighter hover:text-ztext" type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
