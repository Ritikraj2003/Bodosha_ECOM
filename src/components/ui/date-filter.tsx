'use client';

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';

export interface DateFilterValue {
  fromDate?: string;
  toDate?: string;
}

type Preset = 'all' | 'today' | 'yesterday' | '7d' | 'month' | 'custom';

const PRESETS: { value: Exclude<Preset, 'custom'>; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function iso(d: Date): string {
  return d.toISOString();
}

/**
 * Date range filter with quick presets (Today / Yesterday / Last 7 days /
 * This month) and a custom From–To range. Emits ISO date bounds via onChange.
 */
export default function DateFilter({ onChange }: { onChange: (value: DateFilterValue) => void }) {
  const [preset, setPreset] = useState<Preset>('all');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');

  useEffect(() => {
    if (preset !== 'custom') return;
    const from = fromInput ? iso(new Date(`${fromInput}T00:00:00`)) : undefined;
    const to = toInput ? iso(new Date(`${toInput}T23:59:59.999`)) : undefined;
    onChange({ fromDate: from, toDate: to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromInput, toInput, preset]);

  function applyPreset(p: Exclude<Preset, 'custom'>) {
    setPreset(p);
    if (p === 'all') {
      onChange({});
      return;
    }
    const now = new Date();
    const from = new Date(now);
    const to = new Date(now);
    if (p === 'today') {
      onChange({ fromDate: iso(startOfDay(from)), toDate: iso(endOfDay(to)) });
    } else if (p === 'yesterday') {
      from.setDate(from.getDate() - 1);
      onChange({ fromDate: iso(startOfDay(from)), toDate: iso(endOfDay(from)) });
    } else if (p === '7d') {
      from.setDate(from.getDate() - 6);
      onChange({ fromDate: iso(startOfDay(from)), toDate: iso(endOfDay(to)) });
    } else if (p === 'month') {
      onChange({ fromDate: iso(startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))), toDate: iso(endOfDay(to)) });
    }
  }

  const pillCls = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
      active
        ? 'bg-ztext text-zbg border-ztext'
        : 'bg-zcard border-zborder text-ztext-muted hover:border-ztext-light hover:text-ztext'
    }`;

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="flex items-center gap-1.5 text-ztext-muted shrink-0">
        <Calendar size={14} />
        <span className="text-xs font-semibold text-ztext-lighter hidden sm:inline">Date</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {PRESETS.map((opt) => (
          <button key={opt.value} onClick={() => applyPreset(opt.value)} className={pillCls(preset === opt.value)}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <input
          type="date"
          value={fromInput}
          onChange={(e) => { setFromInput(e.target.value); setPreset('custom'); }}
          aria-label="From date"
          className="bg-zcard border border-zborder rounded-xl px-2.5 py-1.5 text-xs text-ztext focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred"
        />
        <span className="text-xs text-ztext-muted">to</span>
        <input
          type="date"
          value={toInput}
          onChange={(e) => { setToInput(e.target.value); setPreset('custom'); }}
          aria-label="To date"
          className="bg-zcard border border-zborder rounded-xl px-2.5 py-1.5 text-xs text-ztext focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred"
        />
      </div>
    </div>
  );
}