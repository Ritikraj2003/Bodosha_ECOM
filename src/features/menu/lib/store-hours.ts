export interface StoreHours {
  open: string;
  close: string;
}

export interface OrderByCutoff {
  label: string;
  time: string;
}

export function minutesOf(hm: string): number {
  if (!hm || typeof hm !== 'string') return 0;
  const [h, m] = hm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

export function isStoreOpen(hours: StoreHours, now: Date): boolean {
  if (!hours?.open || !hours?.close) return true;
  const mins = now.getHours() * 60 + now.getMinutes();
  const openMins = minutesOf(hours.open);
  const closeMins = minutesOf(hours.close);
  if (openMins <= closeMins) {
    return mins >= openMins && mins < closeMins;
  }
  return mins >= openMins || mins < closeMins;
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
  if (!hm || typeof hm !== 'string') return '';
  const [h, m] = hm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return hm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Accurately determines store status text and open/close state based on:
 * 1. Admin manual toggle (isOpenToggle)
 * 2. Temporary same-day closure
 * 3. Daily operating hours (including overnight windows like 9:00 AM to 1:50 AM)
 */
export function getStoreStatus(
  isOpenToggle: boolean,
  tempReopensAt: string,
  hours: StoreHours,
  now: Date
): { isOpen: boolean; statusText: string } {
  if (tempReopensAt && isTemporarilyClosed(tempReopensAt, now)) {
    return {
      isOpen: false,
      statusText: temporaryCloseLabel(tempReopensAt),
    };
  }

  if (!isOpenToggle) {
    return {
      isOpen: false,
      statusText: `Closed now · Opens at ${formatClock(hours.open)}`,
    };
  }

  const openByHours = isStoreOpen(hours, now);
  if (!openByHours) {
    const mins = now.getHours() * 60 + now.getMinutes();
    const openMins = minutesOf(hours.open);
    const closeMins = minutesOf(hours.close);

    let whenText = 'today';
    if (openMins <= closeMins) {
      if (mins >= closeMins) {
        whenText = 'tomorrow';
      }
    } else {
      // Overnight hours (e.g. 09:03 to 01:50). Closed from 01:50 to 09:03, which reopens later today!
      whenText = 'today';
    }

    return {
      isOpen: false,
      statusText: `Closed now · Opens ${whenText} ${formatClock(hours.open)}`,
    };
  }

  return {
    isOpen: true,
    statusText: `Open now · Kitchen closes ${formatClock(hours.close)}`,
  };
}
