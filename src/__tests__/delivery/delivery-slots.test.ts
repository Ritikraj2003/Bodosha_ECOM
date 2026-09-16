import { describe, it, expect } from 'vitest';
import {
  minutesFromMidnight,
  formatClock12h,
  getSlotAvailability,
  validateDeliverySlotServer,
} from '@/features/delivery/lib/slots';
import type { DeliverySlot } from '@/features/delivery/types/slots';

describe('Delivery Slots Utility Functions', () => {
  describe('minutesFromMidnight', () => {
    it('converts HH:mm to minutes from midnight', () => {
      expect(minutesFromMidnight('00:00')).toBe(0);
      expect(minutesFromMidnight('01:30')).toBe(90);
      expect(minutesFromMidnight('13:15')).toBe(13 * 60 + 15);
      expect(minutesFromMidnight('23:59')).toBe(23 * 60 + 59);
    });

    it('handles empty or invalid inputs gracefully', () => {
      expect(minutesFromMidnight('')).toBe(0);
      expect(minutesFromMidnight('invalid')).toBe(0);
    });
  });

  describe('formatClock12h', () => {
    it('formats 24-hour time strings to 12-hour clock strings', () => {
      expect(formatClock12h('13:30')).toBe('1:30 PM');
      expect(formatClock12h('09:15')).toBe('9:15 AM');
      expect(formatClock12h('12:00')).toBe('12:00 PM');
      expect(formatClock12h('00:00')).toBe('12:00 AM');
      expect(formatClock12h('16:45')).toBe('4:45 PM');
    });

    it('returns original string for invalid inputs', () => {
      expect(formatClock12h('')).toBe('');
    });
  });

  describe('getSlotAvailability', () => {
    const sampleSlots: DeliverySlot[] = [
      { id: 'slot-1', label: 'Slot 1', delivery_time: '13:30', cutoff_time: '13:15', is_enabled: true },
      { id: 'slot-2', label: 'Slot 2', delivery_time: '15:00', cutoff_time: '14:45', is_enabled: true },
      { id: 'slot-3', label: 'Slot 3', delivery_time: '16:30', cutoff_time: '16:15', is_enabled: false },
    ];

    it('returns available slots before cutoff time', () => {
      // Current time: 12:00 PM (720 min) -> before 13:15 cutoff
      const fakeDate = new Date('2026-08-24T12:00:00+05:30');
      const result = getSlotAvailability(sampleSlots, fakeDate);

      expect(result.slots.length).toBe(2); // Only enabled slots
      expect(result.availableSlots.length).toBe(2);
      expect(result.nextAvailableSlot?.id).toBe('slot-1');
      expect(result.isExpiredForToday).toBe(false);
    });

    it('filters out expired slots past cutoff time', () => {
      // Current time: 13:20 PM (800 min) -> after 13:15 cutoff, before 14:45 cutoff
      const fakeDate = new Date('2026-08-24T13:20:00+05:30');
      const result = getSlotAvailability(sampleSlots, fakeDate);

      expect(result.availableSlots.length).toBe(1);
      expect(result.availableSlots[0].id).toBe('slot-2');
      expect(result.nextAvailableSlot?.id).toBe('slot-2');
      expect(result.isExpiredForToday).toBe(false);
    });

    it('flags isExpiredForToday when all enabled slots have passed cutoff', () => {
      // Current time: 15:30 PM (930 min) -> after 14:45 cutoff
      const fakeDate = new Date('2026-08-24T15:30:00+05:30');
      const result = getSlotAvailability(sampleSlots, fakeDate);

      expect(result.availableSlots.length).toBe(0);
      expect(result.nextAvailableSlot).toBeNull();
      expect(result.isExpiredForToday).toBe(true);
    });
  });

  describe('validateDeliverySlotServer', () => {
    const sampleSlots: DeliverySlot[] = [
      { id: 'slot-1', label: 'Slot 1', delivery_time: '13:30', cutoff_time: '13:15', is_enabled: true },
      { id: 'slot-2', label: 'Slot 2', delivery_time: '15:00', cutoff_time: '14:45', is_enabled: true },
    ];

    it('validates a valid slot ID before cutoff', () => {
      const fakeDate = new Date('2026-08-24T12:00:00+05:30');
      const result = validateDeliverySlotServer(sampleSlots, 'slot-1', fakeDate);

      expect(result.valid).toBe(true);
      expect(result.slot?.id).toBe('slot-1');
    });

    it('rejects an empty slot ID', () => {
      const result = validateDeliverySlotServer(sampleSlots, '');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('select a delivery time slot');
    });

    it('rejects a slot ID that is expired past cutoff', () => {
      const fakeDate = new Date('2026-08-24T13:20:00+05:30');
      const result = validateDeliverySlotServer(sampleSlots, 'slot-1', fakeDate);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('cutoff time');
    });

    it('rejects a non-existent or disabled slot ID', () => {
      const result = validateDeliverySlotServer(sampleSlots, 'non-existent-id');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not available');
    });
  });
});
