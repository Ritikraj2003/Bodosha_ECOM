'use server';

import { getSetting, getNumericSetting, getJsonSetting, getDeliveryEmails, getAdminEmails, getOwnerEmail, getStoreIsOpen, getStoreRestaurantInfo } from '@/lib/settings';
import type { DeliverySlot } from '@/features/delivery/types/slots';

export interface BumperOfferItem {
  type: 'image' | 'video';
  url: string;
  alt?: string;
  order: number;
}

export interface PublicStoreSettings {
  razorpayKeyId: string;
  gpayUpiId: string;
  gpayUpiName: string;
  supportPhone: string;
  supportEmail: string;
  address: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  website: string;
  storeUpiId: string;
  storeUpiName: string;
  hours: { open: string; close: string };
  tempReopensAt: string;
  orderByCutoffs: { label: string; time: string }[];
  deliveryLocations: string[];
  deliveryFee: number;
  maintenanceFee: number;
  packagingCharge: number;
  packagingChargeEnabled: boolean;
  packagingBigPrice: number;
  packagingSmallPrice: number;
  cancellationWindowMinutes: number;
  deliveryEmails: string[];
  adminEmails: string[];
  ownerEmail: string;
  walletEnabled: boolean;
  walletCreditLimit: number;
  razorpayEnabled: boolean;
  upiEnabled: boolean;
  codEnabled: boolean;
  isOpen: boolean;
  bumperOffersEnabled: boolean;
  bumperOffers: BumperOfferItem[];

  // Delivery Settings & Fixed Delivery Slots
  deliveryAvailable: boolean;
  deliveryUnavailableMessage: string;
  deliveryPersonName: string;
  deliveryPersonPhone: string;
  deliveryFixedSlotsEnabled: boolean;
  deliverySlots: DeliverySlot[];
  deliveryCustomMessage: string;
  deliveryCustomMessageEnabled: boolean;
}

const DEFAULT_DELIVERY_SLOTS: DeliverySlot[] = [
  { id: 'slot-1', label: 'Slot 1', delivery_time: '13:30', cutoff_time: '13:15', is_enabled: true },
  { id: 'slot-2', label: 'Slot 2', delivery_time: '15:00', cutoff_time: '14:45', is_enabled: true },
  { id: 'slot-3', label: 'Slot 3', delivery_time: '16:30', cutoff_time: '16:15', is_enabled: true },
];

export async function getPublicSettings(): Promise<PublicStoreSettings> {
  const deliveryAvailableRaw = await getSetting('delivery_available');
  const deliveryFixedSlotsRaw = await getSetting('delivery_fixed_slots_enabled');
  const deliveryCustomMsgEnabledRaw = await getSetting('delivery_custom_message_enabled');
  const razorpayEnabledRaw = await getSetting('payment_method_razorpay_enabled');
  const upiEnabledRaw = await getSetting('payment_method_upi_enabled');
  const codEnabledRaw = await getSetting('payment_method_cod_enabled');
  const rzpKey = (await getSetting('razorpay_key_id')) || '';
  const storeUpi = (await getSetting('store_upi_id')) || '';
  const restInfo = await getStoreRestaurantInfo();

  const lunchCutoff = (await getSetting('store_order_cutoff_lunch'))?.trim();
  const dinnerCutoff = (await getSetting('store_order_cutoff_dinner'))?.trim();
  const orderByCutoffs: { label: string; time: string }[] = [];
  if (lunchCutoff) orderByCutoffs.push({ label: 'lunch', time: lunchCutoff });
  if (dinnerCutoff) orderByCutoffs.push({ label: 'dinner', time: dinnerCutoff });

  return {
    razorpayKeyId: rzpKey,
    razorpayEnabled: razorpayEnabledRaw !== 'false' && !!rzpKey,
    upiEnabled: upiEnabledRaw !== 'false' && !!storeUpi,
    codEnabled: codEnabledRaw !== 'false',
    gpayUpiId: (await getSetting('gpay_upi_id')) || '',
    gpayUpiName: (await getSetting('gpay_upi_name')) || '',
    supportPhone: (await getSetting('store_support_phone')) || restInfo?.phone || '--',
    supportEmail: (await getSetting('store_support_email')) || restInfo?.email || '--',
    address: (await getSetting('store_address')) || restInfo?.address || '--',
    whatsapp: (await getSetting('store_whatsapp')) || '',
    instagram: (await getSetting('store_instagram')) || '',
    facebook: (await getSetting('store_facebook')) || '',
    website: (await getSetting('store_website')) || '',
    storeUpiId: (await getSetting('store_upi_id')) || '',
    storeUpiName: (await getSetting('store_upi_name')) || '',
    hours: {
      open: restInfo?.openingTime || '09:00',
      close: restInfo?.closingTime || '22:00',
    },
    tempReopensAt: (await getSetting('store_temp_close_until')) || '',
    orderByCutoffs,
    deliveryLocations: await getJsonSetting<string[]>('store_delivery_locations', []),
    deliveryFee: await getNumericSetting('delivery_fee', 10),
    maintenanceFee: await getNumericSetting('maintenance_fee', 1),
    packagingCharge: (await getSetting('packaging_charge_enabled')) === 'false' ? 0 : await getNumericSetting('packaging_charge', 0),
    packagingChargeEnabled: (await getSetting('packaging_charge_enabled')) !== 'false',
    packagingBigPrice: await getNumericSetting('packaging_big_packet_price', 3),
    packagingSmallPrice: await getNumericSetting('packaging_small_packet_price', 2),
    cancellationWindowMinutes: await getNumericSetting('cancellation_window_minutes', 2),
    deliveryEmails: await getDeliveryEmails(),
    adminEmails: await getAdminEmails(),
    ownerEmail: (await getOwnerEmail()) ?? '',
    walletEnabled: (await getSetting('payment_method_wallet_enabled')) === 'true',
    walletCreditLimit: await getNumericSetting('wallet_credit_limit', 500),
    isOpen: (restInfo ? restInfo.isOpen : ((await getStoreIsOpen()) ?? true)),
    bumperOffersEnabled: (await getSetting('bumper_offers_enabled')) === 'true',
    bumperOffers: await getJsonSetting<BumperOfferItem[]>('bumper_offers', []),

    // Delivery settings & Fixed delivery slots
    deliveryAvailable: deliveryAvailableRaw !== 'false',
    deliveryUnavailableMessage:
      (await getSetting('delivery_unavailable_message')) ||
      'Delivery is temporarily unavailable because our delivery person is busy. Please try again later.',
    deliveryPersonName: (await getSetting('delivery_person_name')) || (process.env.NEXT_PUBLIC_APP_NAME ? `${process.env.NEXT_PUBLIC_APP_NAME} Delivery` : '--'),
    deliveryPersonPhone: (await getSetting('delivery_person_phone')) || '--',
    deliveryFixedSlotsEnabled: deliveryFixedSlotsRaw === 'true',
    deliverySlots: await getJsonSetting<DeliverySlot[]>('delivery_slots', DEFAULT_DELIVERY_SLOTS),
    deliveryCustomMessage: (await getSetting('delivery_custom_message')) || '',
    deliveryCustomMessageEnabled: deliveryCustomMsgEnabledRaw === 'true',
  };
}