import { createServiceClient } from '@/infrastructure/supabase/service';

type SettingRow = { key: string; value: string; type: string; is_secret: boolean };

/** Whether the store is marked open by the merchant (Open/Closed toggle). Null when unknown/no restaurant. */
export async function getStoreIsOpen(): Promise<boolean | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('restaurants')
    .select('is_open')
    .eq('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return data.is_open === true;
}

const TTL_MS = 15_000;
let cache: { data: Record<string, SettingRow> | null; fetchedAt: number } = { data: null, fetchedAt: 0 };

async function loadAll(): Promise<Record<string, SettingRow>> {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < TTL_MS) return cache.data;

  const supabase = createServiceClient();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value, type, is_secret');

  if (error && String(error.message).toLowerCase().includes('is_secret')) {
    // Fresh/legacy DB without is_secret column (migration 20260811120000 not
    // applied). Fall back to base columns so reading settings keeps working.
    const { data: fallback } = await supabase
      .from('system_settings')
      .select('key, value, type');
    const rowsFb: Record<string, SettingRow> = {};
    (fallback ?? []).forEach((r) => {
      rowsFb[r.key as string] = { ...(r as unknown as Record<string, unknown>), is_secret: false } as unknown as SettingRow;
    });
    cache = { data: rowsFb, fetchedAt: now };
    return rowsFb;
  }

  const rows: Record<string, SettingRow> = {};
  (data ?? []).forEach((r) => {
    rows[r.key as string] = r as unknown as SettingRow;
  });
  cache = { data: rows, fetchedAt: now };
  return rows;
}

export function clearSettingsCache(): void {
  cache = { data: null, fetchedAt: 0 };
}

/** Read a single setting. Secret values are decrypted on read. Empty/unknown -> null */
export async function getSetting(key: string): Promise<string | null> {
  const all = await loadAll();
  const row = all[key];
  if (!row || !row.value) return null;
  return row.value;
}

/** Read a numeric setting. Returns fallback when unset/invalid */
export async function getNumericSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  if (!raw) return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

/** Read a JSON setting. Returns fallback when unset/invalid */
export async function getJsonSetting<T>(key: string, fallback: T): Promise<T> {
  const raw = await getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Read a boolean setting */
export async function getBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
  const raw = await getSetting(key);
  if (!raw) return fallback;
  return raw === 'true';
}

/** Parse comma/newline separated email list into trimmed, lowercased entries */
export function parseEmailList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Delivery person emails configured by the owner in General Settings */
export async function getDeliveryEmails(): Promise<string[]> {
  return parseEmailList(await getSetting('delivery_person_emails'));
}

/** Administrator emails configured by the owner in General Settings */
export async function getAdminEmails(): Promise<string[]> {
  return parseEmailList(await getSetting('admin_emails'));
}

/** Store owner email (Dilip Da) configured in General Settings for the read-only owner dashboard */
export async function getOwnerEmail(): Promise<string | null> {
  const raw = await getSetting('dilip_da_email');
  return raw?.trim() || null;
}

export interface PaymentMethodAvailability {
  id: string;
  enabled: boolean;
  configured: boolean;
}

/**
 * Resolve which payment methods are available at checkout. Each method is
 * enabled via its own system_settings toggle. When a toggle key is missing
 * (legacy DB), the value is derived from payment_gateway_active so existing
 * setups keep working without intervention. A method is available only when it
 * is enabled AND has the credentials it needs. Only booleans are returned —
 * secrets never leave the server.
 */
export async function getPaymentMethodAvailability(): Promise<PaymentMethodAvailability[]> {
  const gateway = (await getSetting('payment_gateway_active')) || 'razorpay';

  const toggleEnabled = async (key: string, legacyDefault: boolean): Promise<boolean> => {
    const raw = await getSetting(key);
    if (raw === null) return legacyDefault;
    return raw === 'true';
  };

  const [wallet, razorpay, phonepe, gpay, cod] = await Promise.all([
    toggleEnabled('payment_method_wallet_enabled', true),
    toggleEnabled('payment_method_razorpay_enabled', gateway === 'razorpay'),
    toggleEnabled('payment_method_phonepe_enabled', gateway === 'phonepe'),
    toggleEnabled('payment_method_gpay_enabled', gateway === 'gpay'),
    toggleEnabled('payment_method_cod_enabled', true),
  ]);

  const [razorpayKeyId, razorpayKeySecret, merchantId, saltKey, upiId] = await Promise.all([
    getSetting('razorpay_key_id'),
    getSetting('razorpay_key_secret'),
    getSetting('phonepe_merchant_id'),
    getSetting('phonepe_salt_key'),
    getSetting('gpay_upi_id'),
  ]);

  return [
    { id: 'wallet', enabled: wallet, configured: true },
    { id: 'razorpay', enabled: razorpay, configured: !!razorpayKeyId && !!razorpayKeySecret },
    { id: 'phonepe', enabled: phonepe, configured: !!merchantId && !!saltKey },
    { id: 'gpay', enabled: gpay, configured: !!upiId },
    { id: 'cod', enabled: cod, configured: true },
  ];
}