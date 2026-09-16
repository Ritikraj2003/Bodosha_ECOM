export interface DeliverySlot {
  id: string;
  label: string; // e.g. "Slot 1"
  delivery_time: string; // "13:30" (HH:mm)
  cutoff_time: string; // "13:15" (HH:mm)
  is_enabled: boolean;
}

export interface SlotAvailabilityResult {
  slots: DeliverySlot[];
  availableSlots: DeliverySlot[];
  nextAvailableSlot: DeliverySlot | null;
  isExpiredForToday: boolean;
}
