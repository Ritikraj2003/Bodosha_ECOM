'use client';

import { useEffect, useState } from 'react';
import { getPublicSettings, type PublicStoreSettings } from '@/features/settings/actions';
import type { DeliverySlot } from '@/features/delivery/types/slots';

const DEFAULT_SLOTS: DeliverySlot[] = [
  { id: 'slot-1', label: 'Slot 1', delivery_time: '13:30', cutoff_time: '13:15', is_enabled: true },
  { id: 'slot-2', label: 'Slot 2', delivery_time: '15:00', cutoff_time: '14:45', is_enabled: true },
  { id: 'slot-3', label: 'Slot 3', delivery_time: '16:30', cutoff_time: '16:15', is_enabled: true },
];

const FALLBACK: PublicStoreSettings = {
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
  gpayUpiId: process.env.NEXT_PUBLIC_STORE_UPI_ID ?? '',
  gpayUpiName: process.env.NEXT_PUBLIC_STORE_UPI_NAME ?? 'Bodosa',
  supportPhone: '',
  supportEmail: '',
  address: '',
  whatsapp: '',
  instagram: '',
  facebook: '',
  website: '',
  storeUpiId: process.env.NEXT_PUBLIC_STORE_UPI_ID ?? '',
  storeUpiName: process.env.NEXT_PUBLIC_STORE_UPI_NAME ?? 'Bodosa',
  hours: { open: '10:00', close: '21:30' },
  tempReopensAt: '',
  orderByCutoffs: [],
  deliveryLocations: [
    'SNM, CIT Kokrajhar',
    'SJ, CIT Kokrajhar',
    'JD, CIT Kokrajhar',
    'Staff Quarter, CIT Kokrajhar',
    'Gambari Girls Hostel, CIT Kokrajhar',
    'Mtech Quarter, CIT Kokrajhar',
  ],
  deliveryFee: 10,
  maintenanceFee: 1,
  packagingCharge: 0,
  packagingChargeEnabled: true,
  packagingBigPrice: 3,
  packagingSmallPrice: 2,
  cancellationWindowMinutes: 2,
  deliveryEmails: [],
  adminEmails: [],
  ownerEmail: '',
  walletEnabled: true,
  walletCreditLimit: 500,
  razorpayEnabled: true,
  upiEnabled: true,
  codEnabled: true,
  isOpen: true,
  bumperOffersEnabled: true,
  bumperOffers: [],

  // Delivery settings
  deliveryAvailable: true,
  deliveryUnavailableMessage:
    'Delivery is temporarily unavailable because our delivery person is busy. Please try again later.',
  deliveryPersonName: 'Bodosa Delivery',
  deliveryPersonPhone: '6000212823',
  deliveryFixedSlotsEnabled: false,
  deliverySlots: DEFAULT_SLOTS,
  deliveryCustomMessage: '',
  deliveryCustomMessageEnabled: false,
};

let cachedSettings: PublicStoreSettings | null = null;
let inflightPromise: Promise<PublicStoreSettings> | null = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 60_000;

export function getCachedPublicSettings(): Promise<PublicStoreSettings> {
  const now = Date.now();
  if (cachedSettings && now - lastFetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cachedSettings);
  }
  if (inflightPromise) {
    return inflightPromise;
  }
  inflightPromise = getPublicSettings()
    .then((s) => {
      cachedSettings = s;
      lastFetchedAt = Date.now();
      return s;
    })
    .catch((err) => {
      if (cachedSettings) return cachedSettings;
      throw err;
    })
    .finally(() => {
      inflightPromise = null;
    });
  return inflightPromise;
}

export function invalidatePublicSettingsCache() {
  cachedSettings = null;
  lastFetchedAt = 0;
  inflightPromise = null;
}

export function usePublicSettings(): PublicStoreSettings & { loading: boolean } {
  const [settings, setSettings] = useState<PublicStoreSettings>(() => cachedSettings ?? FALLBACK);
  const [loading, setLoading] = useState(() => !cachedSettings);

  useEffect(() => {
    let cancelled = false;
    getCachedPublicSettings()
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...settings, loading };
}