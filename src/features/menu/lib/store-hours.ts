export interface StoreHours {
  open: string;
  close: string;
}

export interface OrderByCutoff {
  label: string;
  time: string;
}

export function minutesOf(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function isStoreOpen(hours: StoreHours, now: Date): boolean {
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= minutesOf(hours.open) && mins < minutesOf(hours.close);
}

/**
 * Temporary same-day closure: when the owner pauses the store for a few hours,
 * they give a reopen time (HH:MM) for TODAY. While `now` is before that time
 * the store is treated as temporarily closed (reopens today, not tomorrow).
 * Empty/absent value means no temporary closure in effect.
 */
export function isTemporarilyClosed(reopensAt: string, now: Date): boolean {
  if (!reopensAt) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins < minutesOf(reopensAt);
}

/**
 * Label used across the storefront when a temporary closure is active, e.g.
 * "Temporarily closed · Reopens today at 3:30 PM".
 */
export function temporaryCloseLabel(reopensAt: string): string {
  return `Temporarily closed · Reopens today at ${formatClock(reopensAt)}`;
}

export function nextOrderByCutoff(slots: OrderByCutoff[], now: Date): OrderByCutoff & { minutesLeft: number } | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  let best: (OrderByCutoff & { minutesLeft: number }) | null = null;
  for (const s of slots) {
    const t = minutesOf(s.time);
    if (t > mins && (best === null || t - mins < best.minutesLeft)) {
      best = { label: s.label, time: s.time, minutesLeft: t - mins };
    }
  }
  return best;
}

export function formatClock(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}
