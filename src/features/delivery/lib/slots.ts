import type { DeliverySlot, SlotAvailabilityResult } from '../types/slots';

/**
 * Converts a "HH:mm" time string into total minutes from midnight (0 to 1439).
 */
export function minutesFromMidnight(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Formats a 24-hour "HH:mm" string (e.g. "13:30") into 12-hour clock format (e.g. "1:30 PM").
 */
export function formatClock12h(timeStr: string): string {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;

  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minuteStr = String(m).padStart(2, '0');
  return `${hour12}:${minuteStr} ${period}`;
}

/**
 * Returns current IST time (UTC+5:30) in Date object to ensure consistent date/time comparison.
 */
export function getISTDate(nowDate?: Date): Date {
  const base = nowDate || new Date();
  // Adjust to IST (UTC+5:30)
  const utc = base.getTime() + base.getTimezoneOffset() * 60_000;
  return new Date(utc + (5 * 60 + 30) * 60_000);
}

/**
 * Gets current minutes from midnight in IST.
 */
export function getCurrentISTMinutes(nowDate?: Date): number {
  const ist = getISTDate(nowDate);
  return ist.getHours() * 60 + ist.getMinutes();
}

/**
 * Gets current date string in YYYY-MM-DD format in IST.
 */
export function getCurrentISTDateString(nowDate?: Date): string {
  const ist = getISTDate(nowDate);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const d = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Evaluates available delivery slots for the current time based on cutoff times.
 */
export function getSlotAvailability(
  slots: DeliverySlot[],
  nowDate?: Date
): SlotAvailabilityResult {
  const enabledSlots = (slots || [])
    .filter((s) => s.is_enabled)
    .sort((a, b) => minutesFromMidnight(a.delivery_time) - minutesFromMidnight(b.delivery_time));

  const currentMinutes = getCurrentISTMinutes(nowDate);

  const availableSlots = enabledSlots.filter((slot) => {
    const cutoffMinutes = minutesFromMidnight(slot.cutoff_time);
    return currentMinutes < cutoffMinutes;
  });

  const nextAvailableSlot = availableSlots.length > 0 ? availableSlots[0] : null;
  const isExpiredForToday = enabledSlots.length > 0 && availableSlots.length === 0;

  return {
    slots: enabledSlots,
    availableSlots,
    nextAvailableSlot,
    isExpiredForToday,
  };
}

/**
 * Validates a selected delivery slot for server-side order placement.
 */
export function validateDeliverySlotServer(
  slots: DeliverySlot[],
  slotId: string,
  nowDate?: Date
): { valid: boolean; error?: string; slot?: DeliverySlot } {
  if (!slotId) {
    return { valid: false, error: 'Please select a delivery time slot' };
  }

  const slot = slots.find((s) => s.id === slotId && s.is_enabled);
  if (!slot) {
    return { valid: false, error: 'The selected delivery slot is not available or disabled' };
  }

  const currentMinutes = getCurrentISTMinutes(nowDate);
  const cutoffMinutes = minutesFromMidnight(slot.cutoff_time);

  if (currentMinutes >= cutoffMinutes) {
    return {
      valid: false,
      error: `The cutoff time (${formatClock12h(slot.cutoff_time)}) for the ${formatClock12h(slot.delivery_time)} delivery slot has passed. Please select a later slot.`,
    };
  }

  return { valid: true, slot };
}
