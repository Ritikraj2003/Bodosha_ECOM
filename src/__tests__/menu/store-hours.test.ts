import { describe, expect, it } from 'vitest';
import { isStoreOpen, nextOrderByCutoff, minutesOf, formatClock, isTemporarilyClosed, temporaryCloseLabel } from '@/features/menu/lib/store-hours';

const HOURS = { open: '10:00', close: '21:30' };
const SLOTS = [
  { label: 'lunch', time: '10:45' },
  { label: 'dinner', time: '18:45' },
];

function at(h: number, m: number): Date {
  return new Date(2026, 7, 3, h, m);
}

describe('minutesOf', () => {
  it('parses 24h time strings', () => {
    expect(minutesOf('10:00')).toBe(600);
    expect(minutesOf('21:30')).toBe(1290);
  });
});

describe('formatClock', () => {
  it('formats 12h with AM/PM', () => {
    expect(formatClock('10:00')).toBe('10:00 AM');
    expect(formatClock('21:30')).toBe('9:30 PM');
    expect(formatClock('00:05')).toBe('12:05 AM');
  });
});

describe('isStoreOpen', () => {
  it('is closed before opening', () => {
    expect(isStoreOpen(HOURS, at(9, 59))).toBe(false);
  });

  it('is open at opening time', () => {
    expect(isStoreOpen(HOURS, at(10, 0))).toBe(true);
  });

  it('is open mid-day', () => {
    expect(isStoreOpen(HOURS, at(13, 30))).toBe(true);
  });

  it('is closed at closing time', () => {
    expect(isStoreOpen(HOURS, at(21, 30))).toBe(false);
  });

  it('is closed after closing', () => {
    expect(isStoreOpen(HOURS, at(22, 0))).toBe(false);
  });
});

describe('nextOrderByCutoff', () => {
  it('returns the upcoming cutoff', () => {
    expect(nextOrderByCutoff(SLOTS, at(8, 0))).toEqual({ label: 'lunch', time: '10:45', minutesLeft: 165 });
  });

  it('moves to dinner after lunch cutoff', () => {
    expect(nextOrderByCutoff(SLOTS, at(12, 0))).toEqual({ label: 'dinner', time: '18:45', minutesLeft: 405 });
  });

  it('returns null after the last cutoff', () => {
    expect(nextOrderByCutoff(SLOTS, at(19, 0))).toBeNull();
  });
});

describe('isTemporarilyClosed', () => {
  it('is not closed when no reopen time is set', () => {
    expect(isTemporarilyClosed('', at(13, 0))).toBe(false);
  });

  it('is closed before the reopen time', () => {
    expect(isTemporarilyClosed('15:30', at(13, 0))).toBe(true);
  });

  it('reopens the same day at the reopen time', () => {
    expect(isTemporarilyClosed('15:30', at(15, 30))).toBe(false);
    expect(isTemporarilyClosed('15:30', at(16, 0))).toBe(false);
  });
});

describe('temporaryCloseLabel', () => {
  it('says reopens today at the given time', () => {
    expect(temporaryCloseLabel('15:30')).toBe('Temporarily closed · Reopens today at 3:30 PM');
  });
});
