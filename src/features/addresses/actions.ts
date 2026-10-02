'use server';

import { getServerSession } from '@/features/auth/actions';
import { query } from '@/infrastructure/db';
import type { Address } from '@/types';

export interface AddressInput {
  id?: string;
  name: string;
  phone: string;
  alternatePhone?: string;
  postalCode: string;
  locality?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  landmark?: string;
  label?: string; // 'Home' | 'Work' | 'Other'
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

export async function getUserAddresses(): Promise<{ success: boolean; addresses?: Address[]; error?: string }> {
  try {
    const { user } = await getServerSession();
    if (!user) {
      return { success: false, error: 'User is not authenticated' };
    }

    const res = await query(
      `SELECT id, user_id, label, name, phone, alternate_phone, locality, landmark,
              address_line1, address_line2, city, state, postal_code,
              latitude, longitude, is_default, full_address, created_at, updated_at
       FROM public.addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, updated_at DESC`,
      [user.id]
    );

    const addresses: Address[] = res.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      label: row.label || 'Home',
      name: row.name || user.fullName || '',
      phone: row.phone || user.phone || '',
      alternatePhone: row.alternate_phone || '',
      locality: row.locality || '',
      landmark: row.landmark || '',
      addressLine1: row.address_line1 || '',
      addressLine2: row.address_line2 || '',
      fullAddress: row.full_address || [row.address_line1, row.locality, row.city, row.state, row.postal_code].filter(Boolean).join(', '),
      city: row.city || '',
      state: row.state || '',
      postalCode: row.postal_code || '',
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      isDefault: Boolean(row.is_default),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { success: true, addresses };
  } catch (err: any) {
    console.error('getUserAddresses error:', err);
    return { success: false, error: err.message || 'Failed to fetch addresses' };
  }
}

export async function saveUserAddress(input: AddressInput): Promise<{ success: boolean; address?: Address; error?: string }> {
  try {
    const { user } = await getServerSession();
    if (!user) {
      return { success: false, error: 'User is not authenticated' };
    }

    const name = input.name?.trim();
    const phone = input.phone?.trim();
    const postalCode = input.postalCode?.trim();
    const addressLine1 = input.addressLine1?.trim();
    const city = input.city?.trim();
    const state = input.state?.trim();
    const locality = input.locality?.trim() || '';
    const landmark = input.landmark?.trim() || '';
    const alternatePhone = input.alternatePhone?.trim() || '';
    const label = input.label?.trim() || 'Home';
    const lat = input.latitude ?? null;
    const lng = input.longitude ?? null;

    if (!name) return { success: false, error: 'Recipient name is required' };
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return { success: false, error: 'Valid 10-digit mobile number is required' };
    }
    if (!postalCode) return { success: false, error: 'Pincode is required' };
    if (!addressLine1) return { success: false, error: 'Address (Area and Street) is required' };
    if (!city) return { success: false, error: 'City/District is required' };
    if (!state) return { success: false, error: 'State is required' };

    // Format a comprehensive full address string
    const fullParts = [
      addressLine1,
      locality ? locality : null,
      landmark ? `Landmark: ${landmark}` : null,
      `${city}, ${state} - ${postalCode}`,
    ].filter(Boolean);
    const fullAddress = fullParts.join(', ');

    // Check count of addresses
    const countRes = await query('SELECT COUNT(*) as count FROM public.addresses WHERE user_id = $1', [user.id]);
    const totalExisting = parseInt(countRes.rows[0]?.count || '0', 10);

    // If first address or explicit isDefault
    const makeDefault = input.isDefault || totalExisting === 0;

    if (makeDefault) {
      // Unmark previous defaults
      await query('UPDATE public.addresses SET is_default = false WHERE user_id = $1', [user.id]);
    }

    let savedRow: any;

    if (input.id) {
      // Update existing address
      const updateRes = await query(
        `UPDATE public.addresses
         SET name = $1, phone = $2, alternate_phone = $3, postal_code = $4,
             locality = $5, address_line1 = $6, city = $7, state = $8,
             landmark = $9, label = $10, latitude = $11, longitude = $12,
             full_address = $13, is_default = $14, updated_at = NOW()
         WHERE id = $15 AND user_id = $16
         RETURNING *`,
        [
          name, phone, alternatePhone, postalCode,
          locality, addressLine1, city, state,
          landmark, label, lat, lng,
          fullAddress, makeDefault, input.id, user.id
        ]
      );
      if (updateRes.rows.length === 0) {
        return { success: false, error: 'Address not found or unauthorized' };
      }
      savedRow = updateRes.rows[0];
    } else {
      // Insert new address
      const insertRes = await query(
        `INSERT INTO public.addresses (
           user_id, name, phone, alternate_phone, postal_code,
           locality, address_line1, city, state,
           landmark, label, latitude, longitude,
           full_address, is_default, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
         RETURNING *`,
        [
          user.id, name, phone, alternatePhone, postalCode,
          locality, addressLine1, city, state,
          landmark, label, lat, lng,
          fullAddress, makeDefault
        ]
      );
      savedRow = insertRes.rows[0];
    }

    const address: Address = {
      id: savedRow.id,
      userId: savedRow.user_id,
      label: savedRow.label || 'Home',
      name: savedRow.name,
      phone: savedRow.phone,
      alternatePhone: savedRow.alternate_phone,
      locality: savedRow.locality,
      landmark: savedRow.landmark,
      addressLine1: savedRow.address_line1,
      addressLine2: savedRow.address_line2,
      fullAddress: savedRow.full_address,
      city: savedRow.city,
      state: savedRow.state,
      postalCode: savedRow.postal_code,
      latitude: savedRow.latitude ? parseFloat(savedRow.latitude) : undefined,
      longitude: savedRow.longitude ? parseFloat(savedRow.longitude) : undefined,
      isDefault: Boolean(savedRow.is_default),
      createdAt: savedRow.created_at,
      updatedAt: savedRow.updated_at,
    };

    return { success: true, address };
  } catch (err: any) {
    console.error('saveUserAddress error:', err);
    return { success: false, error: err.message || 'Failed to save address' };
  }
}

export async function setDefaultUserAddress(addressId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await getServerSession();
    if (!user) return { success: false, error: 'User is not authenticated' };

    await query('UPDATE public.addresses SET is_default = false WHERE user_id = $1', [user.id]);
    await query('UPDATE public.addresses SET is_default = true WHERE id = $1 AND user_id = $2', [addressId, user.id]);

    return { success: true };
  } catch (err: any) {
    console.error('setDefaultUserAddress error:', err);
    return { success: false, error: err.message || 'Failed to set default address' };
  }
}

export async function deleteUserAddress(addressId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await getServerSession();
    if (!user) return { success: false, error: 'User is not authenticated' };

    // Check if it was default
    const checkRes = await query('SELECT is_default FROM public.addresses WHERE id = $1 AND user_id = $2', [addressId, user.id]);
    const wasDefault = Boolean(checkRes.rows[0]?.is_default);

    await query('DELETE FROM public.addresses WHERE id = $1 AND user_id = $2', [addressId, user.id]);

    // If was default, make the most recently updated address the default
    if (wasDefault) {
      await query(
        `UPDATE public.addresses 
         SET is_default = true 
         WHERE id = (SELECT id FROM public.addresses WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1)`,
        [user.id]
      );
    }

    return { success: true };
  } catch (err: any) {
    console.error('deleteUserAddress error:', err);
    return { success: false, error: err.message || 'Failed to delete address' };
  }
}
