'use server';

import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { createServiceClient } from '@/infrastructure/supabase/service';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { isDeliveryEmail, isAdminEmail, isOwnerEmail } from '@/config/auth-access';
import { getDeliveryEmails, getAdminEmails, getOwnerEmail, getBooleanSetting } from '@/lib/settings';
import { profileUpdateSchema } from '@/schemas/api';

export async function getServerSession() {
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
    },
  };
}

export async function getServerProfile() {
  const supabase = createServiceClient();
  if (!supabase) return { profile: null };

  const { user } = await getServerSession();
  if (!user) return { profile: null };

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

  const supabase = createServiceClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { user } = await getServerSession();
  if (!user) return { error: 'Not authenticated' };

  const profileUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.full_name !== undefined) profileUpdates.full_name = updates.full_name;
  if (updates.phone !== undefined) profileUpdates.phone = updates.phone;
  if (updates.role !== undefined) profileUpdates.role = updates.role;

  const { error } = await supabase
    .from('profiles')
    .update(profileUpdates)
    .eq('id', user.id);

  if (error) return { error: error.message };

  const metadataUpdates: Record<string, string> = {};
  if (updates.full_name) metadataUpdates.full_name = updates.full_name;
  if (updates.phone) metadataUpdates.phone = updates.phone;
  if (updates.role) metadataUpdates.role = updates.role;

  if (Object.keys(metadataUpdates).length > 0) {
    const authSupabase = await createServerSupabaseClient();
    if (authSupabase) {
      await authSupabase.auth.updateUser({ data: metadataUpdates }).catch(() => null);
    }
  }

  return { error: null };
}

export async function getServerAddress() {
  const supabase = createServiceClient();
  if (!supabase) return { address: null };

  const { user } = await getServerSession();
  if (!user) return { address: null };

  const { data } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .maybeSingle();

  return { address: data };
}

export async function updateServerAddress(formData: FormData) {
  const supabase = createServiceClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { user } = await getServerSession();
  if (!user) return { error: 'Not authenticated' };

  const fullAddress = formData.get('fullAddress') as string;
  if (!fullAddress?.trim()) return { error: 'Address is required' };

  const city = formData.get('city') as string || '';
  const state = formData.get('state') as string || '';
  const postalCode = formData.get('postalCode') as string || '';
  const label = formData.get('label') as string || 'Home';

  const { data: existing } = await supabase
    .from('addresses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('addresses')
      .update({ full_address: fullAddress, city, state, postal_code: postalCode, label, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('addresses')
      .insert({ user_id: user.id, full_address: fullAddress, city, state, postal_code: postalCode, label, is_default: true });
    if (error) return { error: error.message };
  }

  return { error: null };
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
 * Check whether an email is already registered (exists in auth.users). Used to
 * block duplicate signups for customers, admins, and delivery partners.
 */
export async function isEmailRegistered(email: string) {
  const admin = createAdminClient();
  const target = email.trim().toLowerCase();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const match = (data?.users ?? []).some((u) => (u.email ?? '').toLowerCase() === target);
  return { registered: match };
}

/**
 * Create a new account via the service role so no Supabase confirmation email
 * is sent. Email ownership is already proven by the app's own OTP flow, so the
 * account is created pre-confirmed and the user can sign in immediately.
 */
export async function createUserAccount(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}) {
  const admin = createAdminClient();
  const { email, password, fullName, phone } = input;
  const cleanPhone = phone ? phone.trim() : '';

  if (!cleanPhone || !/^[0-9]{10}$/.test(cleanPhone)) {
    return { user: null, error: 'Phone number is required and must be exactly 10 digits' };
  }

  // The store owner's account starts as the read-only `owner` role instead of
  // the default customer role.
  const role = isOwnerEmail(email, await getOwnerEmail()) ? 'owner' : 'student';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone: cleanPhone,
      role,
    },
  });
  if (error) return { user: null, error: error.message };

  if (data.user) {
    // Ensure profiles record is updated/inserted immediately with phone number and details
    await admin.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: fullName,
      phone: cleanPhone,
      role,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  }

  return { user: data.user ? { id: data.user.id } : null, error: null };
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
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (error) return { error: error.message };
  return { error: null };
}
