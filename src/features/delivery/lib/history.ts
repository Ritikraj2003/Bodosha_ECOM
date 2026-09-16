import type { DeliveryHistoryEntry } from '../types';

export interface DayGroup {
  key: string;
  label: string;
  entries: DeliveryHistoryEntry[];
  totalValue: number;
}

export function dayKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabel(key: string): string {
  const todayKey = dayKey(new Date());
  if (key === todayKey) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function groupDeliveriesByDay(entries: DeliveryHistoryEntry[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const entry of entries) {
    const at = entry.assignment.delivered_at;
    if (!at) continue;
    const key = dayKey(new Date(at));
    const value = Number(entry.order?.total ?? 0);
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
      existing.totalValue += value;
    } else {
      groups.set(key, { key, label: dayLabel(key), entries: [entry], totalValue: value });
    }
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}
