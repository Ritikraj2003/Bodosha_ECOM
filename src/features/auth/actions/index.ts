'use server';

import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { createServiceClient } from '@/infrastructure/supabase/service';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { isDeliveryEmail, isAdminEmail, isOwnerEmail } from '@/config/auth-access';
import { getDeliveryEmails, getAdminEmails, getOwnerEmail, getBooleanSetting } from '@/lib/settings';
import { profileUpdateSchema } from '@/schemas/api';

import { getAuthSession } from './credentials';
import { query } from '@/infrastructure/db';

export async function getServerSession() {
  // 1. Check direct DB session first
  const credSession = await getAuthSession();
  if (credSession.user) {
    return { user: credSession.user };
  }

  // 2. Fallback to Supabase auth if configured
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return { user: null };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { user: null };

    let phone = (user.user_metadata?.phone as string) ?? null;
    let fullName = (user.user_metadata?.full_name as string) ?? user.email?.split('@')[0] ?? 'User';
    let role = (user.user_metadata?.role as string) ?? null;
    let avatarUrl = (user.user_metadata?.avatar_url as string) ?? null;

    const serviceClient = createServiceClient();
    if (serviceClient) {
      try {
        const { data: profile } = await serviceClient
          .from('profiles')
          .select('phone, full_name, role, avatar_url')
          .eq('id', user.id)
          .maybeSingle();
        if (profile) {
          if (profile.phone) phone = profile.phone;
          if (profile.full_name) fullName = profile.full_name;
          if (profile.role) role = profile.role;
          if (profile.avatar_url) avatarUrl = profile.avatar_url;
        }
      } catch {}
    }

    return {
      user: {
        id: user.id,
        email: user.email ?? '',
        fullName,
        role,
        avatarUrl,
        phone,
        permissions: (role === 'super_admin' || role === 'owner') ? ['*'] : [],
      },
    };
  } catch {
    return { user: null };
  }
}

export async function getServerProfile() {
  const { user } = await getServerSession();
  if (!user) return { profile: null };

  // 1. Direct DB lookup from public.users / public.profiles
  try {
    const res = await query(
      `SELECT id, email, full_name, phone, avatar_url, role, is_active, created_at, updated_at FROM public.users WHERE id = $1 LIMIT 1`,
      [user.id]
    );
    if (res.rows.length > 0) {
      return { profile: res.rows[0] as any };
    }
  } catch {}

  const supabase = createServiceClient();
  if (!supabase) return { profile: null };

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, avatar_url, role, is_active, created_at, updated_at')
    .eq('id', user.id)
    .single();

  return { profile: data };
}

export async function updateServerProfile(updates: { role?: string; phone?: string; full_name?: string }) {
  const validated = profileUpdateSchema.safeParse(updates);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message || 'Invalid input' };
  }

  const { user } = await getServerSession();
  if (!user) return { error: 'Not authenticated' };

  try {
    const fields: string[] = ['updated_at = NOW()'];
    const values: any[] = [user.id];
    let idx = 2;

    if (updates.full_name !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(updates.full_name.trim());
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(updates.phone.trim());
    }
    if (updates.role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(updates.role.trim());
    }

    await query(`UPDATE public.profiles SET ${fields.join(', ')} WHERE id = $1`, values);
    await query(`UPDATE public.users SET ${fields.join(', ')} WHERE id = $1`, values);

    return { error: null };
  } catch (err: any) {
    console.error('updateServerProfile error:', err);
    return { error: err.message || 'Failed to update profile' };
  }
}

export async function getServerAddress() {
  try {
    const { user } = await getServerSession();
    if (!user) return { address: null };

    const res = await query(`
      SELECT id, user_id, label, address_line1, address_line2, city, state, postal_code,
             COALESCE(full_address, address_line1) AS full_address, is_default, created_at, updated_at
      FROM public.addresses
      WHERE user_id = $1 AND is_default = true
      LIMIT 1;
    `, [user.id]);

    return { address: res.rows[0] || null };
  } catch (err) {
    console.error('getServerAddress error:', err);
    return { address: null };
  }
}

export async function updateServerAddress(formData: FormData) {
  const { user } = await getServerSession();
  if (!user) return { error: 'Not authenticated' };

  const fullAddress = (formData.get('fullAddress') as string)?.trim();
  if (!fullAddress) return { error: 'Address is required' };

  const city = (formData.get('city') as string)?.trim() || 'Kokrajhar';
  const state = (formData.get('state') as string)?.trim() || 'Assam';
  const postalCode = (formData.get('postalCode') as string)?.trim() || '783370';
  const label = (formData.get('label') as string)?.trim() || 'Home';

  try {
    const existing = await query(
      'SELECT id FROM public.addresses WHERE user_id = $1 AND is_default = true LIMIT 1',
      [user.id]
    );

    if (existing.rows.length > 0) {
      await query(`
        UPDATE public.addresses
        SET address_line1 = $1, full_address = $1, city = $2, state = $3, postal_code = $4, label = $5, updated_at = NOW()
        WHERE id = $6
      `, [fullAddress, city, state, postalCode, label, existing.rows[0].id]);
    } else {
      await query(`
        INSERT INTO public.addresses (user_id, address_line1, full_address, city, state, postal_code, label, is_default, created_at, updated_at)
        VALUES ($1, $2, $2, $3, $4, $5, $6, true, NOW(), NOW())
      `, [user.id, fullAddress, city, state, postalCode, label]);
    }

    return { error: null };
  } catch (err: any) {
    console.error('updateServerAddress error:', err);
    return { error: err.message || 'Failed to update address' };
  }
}

export async function completeOnboarding(formData: FormData) {
  const supabase = createServiceClient();
  if (!supabase) return { error: 'Supabase not configured', redirect: null };

  const { user } = await getServerSession();
  if (!user) return { error: 'Not authenticated', redirect: null };

  const role = formData.get('role') as string;
  const phone = formData.get('phone') as string;

  if (phone && !/^[0-9]{10}$/.test(phone)) {
    return { error: 'Phone number must be exactly 10 digits', redirect: null };
  }

  if (!['student', 'merchant', 'delivery'].includes(role)) {
    return { error: 'Invalid role', redirect: null };
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, email: user.email, full_name: user.fullName, role, phone: phone || null });

  if (profileError) return { error: profileError.message, redirect: null };

  const authSupabase = await createServerSupabaseClient();
  if (authSupabase) {
    await authSupabase.auth.updateUser({ data: { role } });
  }

  const dashboards: Record<string, string> = {
    student: '/dashboard/student',
    merchant: '/dashboard/merchant',
    delivery: '/dashboard/delivery',
  };

  return { error: null, redirect: dashboards[role] ?? '/' };
}

export async function setupDeliveryAccount(formData: FormData) {
  const supabase = createServiceClient();
  if (!supabase) return { error: 'Supabase not configured', redirect: null };

  const { user } = await getServerSession();
  if (!user) return { error: 'Not authenticated', redirect: null };

  if (!isDeliveryEmail(user.email, await getDeliveryEmails())) {
    return { error: 'This email is not approved for delivery partners', redirect: null };
  }

  const vehicleType = (formData.get('vehicleType') as string) || 'bike';
  const licensePlate = (formData.get('licensePlate') as string)?.trim() || null;
  const phone = (formData.get('phone') as string)?.trim() || null;

  if (phone && !/^[0-9]{10}$/.test(phone)) {
    return { error: 'Phone number must be exactly 10 digits', redirect: null };
  }

  if (!['bike', 'scooter', 'car'].includes(vehicleType)) {
    return { error: 'Invalid vehicle type', redirect: null };
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, email: user.email, full_name: user.fullName, role: 'delivery', phone });

  if (profileError) return { error: profileError.message, redirect: null };

  const { data: existing } = await supabase
    .from('delivery_partners')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!existing) {
    const { error: partnerError } = await supabase.from('delivery_partners').insert({
      id: user.id,
      vehicle_type: vehicleType,
      license_plate: licensePlate,
      is_available: true,
    });
    if (partnerError) return { error: partnerError.message, redirect: null };
  }

  const authSupabase = await createServerSupabaseClient();
  if (authSupabase) {
    await authSupabase.auth.updateUser({ data: { role: 'delivery' } });
  }

  return { error: null, redirect: '/dashboard/delivery' };
}

export async function setupAdminAccount(formData: FormData) {
  const supabase = createServiceClient();
  if (!supabase) return { error: 'Supabase not configured', redirect: null };

  const { user } = await getServerSession();
  if (!user) return { error: 'Not authenticated', redirect: null };

  // The store owner (Dilip Da) signs up through the Administrator flow but is
  // granted the read-only `owner` role instead of admin access.
  const ownerEmail = await getOwnerEmail();
  const isOwner = isOwnerEmail(user.email, ownerEmail);
  if (!isAdminEmail(user.email, await getAdminEmails()) && !isOwner) {
    return { error: 'This email is not approved for admin access', redirect: null };
  }

  const role = isOwner ? 'owner' : 'admin';
  const phone = (formData.get('phone') as string)?.trim() || null;

  if (phone && !/^[0-9]{10}$/.test(phone)) {
    return { error: 'Phone number must be exactly 10 digits', redirect: null };
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, email: user.email, full_name: user.fullName, role, phone });

  if (profileError) return { error: profileError.message, redirect: null };

  const authSupabase = await createServerSupabaseClient();
  if (authSupabase) {
    await authSupabase.auth.updateUser({ data: { role } });
  }

  return { error: null, redirect: isOwner ? '/dashboard/owner' : '/admin' };
}

/**
 * Whether the signed-in user is the store owner (Dilip Da), identified by the
 * email configured in General Settings. Used by layouts to steer the owner away
 * from the admin console into the read-only owner dashboard.
 */
export async function isOwnerSession() {
  const { user } = await getServerSession();
  if (!user) return false;
  return isOwnerEmail(user.email, await getOwnerEmail());
}

/**
 * Check whether an email is already registered (exists in public.users). Used to
 * block duplicate signups for customers, admins, and delivery partners.
 */
export async function isEmailRegistered(email: string) {
  const target = email.trim().toLowerCase();
  const res = await query('SELECT id FROM public.users WHERE LOWER(email) = $1 LIMIT 1', [target]);
  return { registered: res.rows.length > 0 };
}

/**
 * Create a new account directly in public.users and public.profiles.
 */
export async function createUserAccount(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}) {
  const { email, password, fullName, phone } = input;
  const cleanPhone = phone ? phone.trim() : '';

  if (!cleanPhone || !/^[0-9]{10}$/.test(cleanPhone)) {
    return { user: null, error: 'Phone number is required and must be exactly 10 digits' };
  }

  const role = isOwnerEmail(email, await getOwnerEmail()) ? 'owner' : 'student';

  try {
    const res = await query(`
      INSERT INTO public.users (email, password_hash, full_name, phone, role, is_active)
      VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, $5, true)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = crypt($2, gen_salt('bf')),
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        updated_at = NOW()
      RETURNING id
    `, [email.toLowerCase().trim(), password, fullName.trim(), cleanPhone, role]);

    const user = res.rows[0];

    // Keep profiles table in sync
    const isCit = email.toLowerCase().trim().endsWith('@cit.ac.in');
    await query(`
      INSERT INTO public.profiles (
        id, email, full_name, phone, role, is_active,
        is_cit_student, student_email, student_verified_at
      )
      VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        is_cit_student = EXCLUDED.is_cit_student,
        student_email = EXCLUDED.student_email,
        student_verified_at = EXCLUDED.student_verified_at,
        updated_at = NOW()
    `, [
      user.id,
      email.toLowerCase().trim(),
      fullName.trim(),
      cleanPhone,
      role,
      isCit,
      isCit ? email.toLowerCase().trim() : null,
      isCit ? new Date() : null,
    ]);

    return { user: { id: user.id }, error: null };
  } catch (err: any) {
    return { user: null, error: err.message || 'Failed to create account' };
  }
}

import { sendPasswordResetLinkEmail } from '@/lib/email';

async function resolveSiteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  }
  try {
    const { headers } = await import('next/headers');
    const headerList = await headers();
    const host = headerList.get('x-forwarded-host') || headerList.get('host');
    const proto = headerList.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    if (host) {
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  } catch {
    // headers() might not be available in all execution contexts
  }
  return 'https://www.dilipda.in';
}

export async function sendPasswordResetEmail(email: string) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { error: 'Please enter a valid email address' };
    }

    // Check if account exists in database
    const serviceClient = createServiceClient();
    if (serviceClient) {
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('id')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (!profile) {
        return { error: 'No account found with this email address. Please sign up first.' };
      }
    }

    const siteUrl = await resolveSiteUrl();
    const redirectTo = `${siteUrl}/auth/reset-password`;

    // 1. Try sending via Supabase Auth client directly
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (!error) {
        return { error: null };
      }

      // If Supabase rate limit is hit, try fallback to Admin generateLink + Custom SMTP
      if (error.message?.toLowerCase().includes('rate limit')) {
        try {
          const admin = createAdminClient();
          const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
            type: 'recovery',
            email: normalizedEmail,
            options: { redirectTo },
          });

          if (!linkError && linkData?.properties?.action_link) {
            const sent = await sendPasswordResetLinkEmail(normalizedEmail, linkData.properties.action_link);
            if (sent) {
              return { error: null };
            }
          }
        } catch (adminErr) {
          console.warn('generateLink fallback error:', adminErr);
        }

        return {
          error: 'Email rate limit reached by Supabase. Please wait a few minutes before requesting another link.',
        };
      }

      return { error: error.message };
    }

    return { error: 'Authentication service unavailable. Please try again later.' };
  } catch (err: unknown) {
    console.error('sendPasswordResetEmail action exception:', err);
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.',
    };
  }
}

/**
 * Report whether the platform is in maintenance mode and the signed-in user's
 * role. The maintenance message is shown only to a signed-in, non-staff user;
 * staff and logged-out users (including the login page) are never blocked so
 * admins can always sign back in and disable maintenance.
 */
export async function getMaintenanceStatus() {
  const [maintenance, profileResult] = await Promise.all([
    getBooleanSetting('maintenance_mode', false),
    getServerProfile(),
  ]);

  const role = (profileResult?.profile as { role?: string } | null | undefined)?.role ?? null;
  return { enabled: maintenance, role };
}

/**
 * Auto-confirm a freshly signed-up user's email. The app's own OTP flow already
 * proved email ownership before the account is created, so we can skip Supabase's
 * separate confirmation-link email (avoids the "Please verify your email" loop and
 * email rate limits).
 */
export async function confirmSignupEmail(userId: string) {
  try {
    await query(`UPDATE public.users SET is_active = true WHERE id = $1`, [userId]);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
}

/**
 * Consolidated server action for the Profile page.
 * Loads address, recent orders, and wallet details in a single server call,
 * reducing 3-4 separate client round-trips to just 1 request.
 */
export async function getProfileOverview() {
  const { user } = await getServerSession();
  if (!user) {
    return {
      address: '',
      orders: [],
      orderCount: 0,
      walletCash: null,
      walletStatus: 'unverified',
      fullWalletData: null,
    };
  }

  const { getUserOrders } = await import('@/features/orders/actions/customer');
  const { getWalletDetails } = await import('@/features/wallet/actions');
  const { getCreditAccount } = await import('@/features/bnpl/actions');

  const [addressRes, ordersRes, walletRes] = await Promise.all([
    getServerAddress(),
    getUserOrders(1, 2),
    getWalletDetails(),
  ]);

  let address = addressRes.address?.full_address || '';
  let orders = ordersRes.success && ordersRes.data ? ordersRes.data.orders : [];
  let orderCount = ordersRes.success && ordersRes.data ? ordersRes.data.total : 0;
  let walletCash: number | null = null;
  let walletStatus = 'unverified';
  let fullWalletData: any = null;

  if (walletRes.success && walletRes.data) {
    walletCash = walletRes.data.balance;
    const status = walletRes.data.wallet?.status;
    if (status === 'pending' || (walletRes.data.wallet?.kyc_submitted_at && status !== 'active' && status !== 'rejected')) {
      walletStatus = 'pending';
    } else if (status === 'active') {
      walletStatus = 'active';
    } else if (status === 'rejected') {
      walletStatus = 'rejected';
    } else {
      walletStatus = 'unverified';
    }
    fullWalletData = walletRes.data.wallet;
  } else {
    try {
      const creditRes = await getCreditAccount();
      if (creditRes.success && creditRes.data) {
        walletCash = creditRes.data.available_credit;
      }
    } catch {}
  }

  return {
    address,
    orders,
    orderCount,
    walletCash,
    walletStatus,
    fullWalletData,
  };
}

