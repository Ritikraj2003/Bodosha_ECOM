'use server';

import { query } from '@/infrastructure/db';
import {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionFromCookies,
  type SessionPayload,
} from '@/lib/session';

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    avatarUrl?: string | null;
    phone?: string | null;
    permissions?: string[];
  };
}

export async function loginWithCredentials(
  emailInput: string,
  passwordInput: string
): Promise<AuthResponse> {
  const email = emailInput?.toLowerCase().trim();
  const password = passwordInput?.trim();

  if (!email || !password) {
    return { success: false, error: 'Email and password are required' };
  }

  try {
    // 1. Verify user with password match via pgcrypto
    const res = await query<{
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      avatar_url: string | null;
      role: string;
      is_active: boolean;
      password_match: boolean;
    }>(
      `
      SELECT 
        id, email, full_name, phone, avatar_url, role, is_active,
        (password_hash IS NOT NULL AND password_hash = crypt($2, password_hash)) AS password_match
      FROM public.users
      WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL AND COALESCE(is_deleted, false) = false
      LIMIT 1;
      `,
      [email, password]
    );

    if (res.rows.length === 0 || !res.rows[0].password_match) {
      return { success: false, error: 'Invalid email or password' };
    }

    const user = res.rows[0];

    if (!user.is_active) {
      return { success: false, error: 'Your account has been deactivated. Please contact support.' };
    }

    // 2. Fetch dynamic role from user_roles if available
    let effectiveRole = user.role;
    try {
      const roleRes = await query<{ slug: string }>(
        `
        SELECT r.slug
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1
        ORDER BY r.is_system DESC
        LIMIT 1;
        `,
        [user.id]
      );
      if (roleRes.rows.length > 0) {
        effectiveRole = roleRes.rows[0].slug;
      }
    } catch {
      // Fall back to users.role
    }

    // 3. Determine permissions
    let permissions: string[] = [];
    const isOwnerOrSuperAdmin =
      effectiveRole === 'super_admin' ||
      effectiveRole === 'owner' ||
      user.role === 'super_admin' ||
      user.role === 'owner';

    if (isOwnerOrSuperAdmin) {
      permissions = ['*'];
    } else if (effectiveRole === 'student' || effectiveRole === 'delivery') {
      permissions = [];
    } else {
      try {
        const permRes = await query<{ code: string }>(
          `
          SELECT DISTINCT p.permission_code AS code
          FROM public.permissions p
          JOIN public.role_permissions rp ON p.id = rp.permission_id
          JOIN public.roles r ON rp.role_id = r.id
          WHERE (r.slug = $1 OR r.name = $1) AND p.permission_code IS NOT NULL
          UNION
          SELECT DISTINCT p.permission_code AS code
          FROM public.user_roles ur
          JOIN public.role_permissions rp ON ur.role_id = rp.role_id
          JOIN public.permissions p ON rp.permission_id = p.id
          WHERE ur.user_id = $2 AND p.permission_code IS NOT NULL
          `,
          [effectiveRole, user.id]
        );
        permissions = permRes.rows.map((r) => r.code);
      } catch (permErr) {
        console.error('Failed to load user permissions:', permErr);
      }
    }

    // 4. Create session & set HTTP-only cookie
    const sessionPayload: SessionPayload = {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      role: effectiveRole,
      avatarUrl: user.avatar_url,
      phone: user.phone,
      permissions,
    };

    const token = await createSessionToken(sessionPayload);
    await setSessionCookie(token);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: effectiveRole,
        avatarUrl: user.avatar_url,
        phone: user.phone,
        permissions,
      },
    };
  } catch (err: unknown) {
    console.error('loginWithCredentials error:', err);
    return { success: false, error: 'An unexpected authentication error occurred.' };
  }
}

export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    await clearSessionCookie();
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getAuthSession(): Promise<{
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string | null;
    avatarUrl: string | null;
    phone: string | null;
    permissions?: string[];
  } | null;
}> {
  try {
    const session = await getSessionFromCookies();
    if (!session) return { user: null };

    // Fetch fresh details from DB
    const res = await query<{
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      avatar_url: string | null;
      role: string;
      is_active: boolean;
    }>(
      `SELECT id, email, full_name, phone, avatar_url, role, is_active FROM public.users WHERE id = $1 LIMIT 1;`,
      [session.userId]
    );

    if (res.rows.length === 0 || !res.rows[0].is_active) {
      await clearSessionCookie();
      return { user: null };
    }

    const u = res.rows[0];
    const userRole = session.role || u.role;
    let permissions = session.permissions || [];

    if (userRole === 'super_admin' || userRole === 'owner') {
      permissions = ['*'];
    } else if (userRole === 'student' || userRole === 'delivery') {
      permissions = [];
    } else if (!permissions || permissions.length === 0) {
      try {
        const permRes = await query<{ code: string }>(
          `
          SELECT DISTINCT p.permission_code AS code
          FROM public.permissions p
          JOIN public.role_permissions rp ON p.id = rp.permission_id
          JOIN public.roles r ON rp.role_id = r.id
          WHERE (r.slug = $1 OR r.name = $1) AND p.permission_code IS NOT NULL
          UNION
          SELECT DISTINCT p.permission_code AS code
          FROM public.user_roles ur
          JOIN public.role_permissions rp ON ur.role_id = rp.role_id
          JOIN public.permissions p ON rp.permission_id = p.id
          WHERE ur.user_id = $2 AND p.permission_code IS NOT NULL
          `,
          [userRole, u.id]
        );
        permissions = permRes.rows.map((r) => r.code);
      } catch {}
    }

    return {
      user: {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: userRole,
        avatarUrl: u.avatar_url,
        phone: u.phone,
        permissions,
      },
    };
  } catch {
    return { user: null };
  }
}
