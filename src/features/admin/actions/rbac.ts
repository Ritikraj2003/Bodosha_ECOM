'use server';

import { query } from '@/infrastructure/db';
import { getServerSession } from '@/features/auth/actions';
import { revalidatePath } from 'next/cache';

async function checkAdminAuth() {
  const { user } = await getServerSession();
  if (!user) throw new Error('Unauthorized');
  const isAuthorized = user.role === 'admin' || user.role === 'super_admin' || user.role === 'owner';
  if (!isAuthorized) throw new Error('Forbidden: Admin privilege required');
  return { user };
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  slug: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  permission_count: number;
  permission_ids: string[];
  created_at: string;
}

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  permission_name: string;
  permission_code: string;
  module: string;
  action: string;
  description: string | null;
}

/**
 * Fetch all roles along with their assigned permission IDs.
 */
export async function getRolesWithPermissions(): Promise<{ success: boolean; data?: RoleWithPermissions[]; error?: string }> {
  try {
    await checkAdminAuth();

    const rolesRes = await query(`
      SELECT 
        r.id,
        r.name,
        r.slug,
        r.name AS display_name,
        r.description,
        r.is_system,
        r.created_at,
        COUNT(rp.permission_id)::int AS permission_count,
        COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') AS permission_ids
      FROM public.roles r
      LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
      WHERE r.slug != 'student'
      GROUP BY r.id, r.name, r.slug, r.description, r.is_system, r.created_at
      ORDER BY r.is_system DESC, r.name ASC;
    `);

    return { success: true, data: rolesRes.rows as RoleWithPermissions[] };
  } catch (err: any) {
    console.error('getRolesWithPermissions error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch all available permissions in the system, grouped by module.
 */
export async function getAllPermissions(): Promise<{ success: boolean; data?: Record<string, PermissionItem[]>; error?: string }> {
  try {
    await checkAdminAuth();

    const permRes = await query<{
      id: string;
      permission_name: string;
      permission_code: string;
      description: string | null;
    }>(`
      SELECT 
        id, 
        permission_name,
        permission_code,
        description
      FROM public.permissions
      ORDER BY permission_name ASC;
    `);

    const grouped: Record<string, PermissionItem[]> = {};
    for (const p of permRes.rows) {
      const parts = (p.permission_name || '').split('|').map((s) => s.trim());
      let mod = 'General';
      let action = 'View / Access';

      if (parts.length === 1) {
        mod = parts[0] || 'General';
        action = 'View / Access';
      } else if (parts.length === 2) {
        const first = parts[0].toLowerCase();
        if (first === 'setting' || first === 'user management') {
          mod = `${parts[0]} | ${parts[1]}`;
          action = 'View / Access';
        } else {
          mod = parts[0];
          action = parts[1];
        }
      } else if (parts.length >= 3) {
        mod = `${parts[0]} | ${parts[1]}`;
        action = parts.slice(2).join(' | ');
      }

      const item: PermissionItem = {
        id: p.id,
        code: p.permission_code,
        name: p.permission_name,
        permission_name: p.permission_name,
        permission_code: p.permission_code,
        module: mod,
        action: action,
        description: p.description,
      };

      if (!grouped[mod]) grouped[mod] = [];
      grouped[mod].push(item);
    }

    return { success: true, data: grouped };
  } catch (err: any) {
    console.error('getAllPermissions error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update permission set for a given role.
 */
export async function updateRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await checkAdminAuth();

    const roleCheck = await query('SELECT is_system, name, slug FROM public.roles WHERE id = $1', [roleId]);
    if (roleCheck.rows.length === 0) {
      return { success: false, error: 'Role not found' };
    }

    await query('BEGIN');
    try {
      await query('DELETE FROM public.role_permissions WHERE role_id = $1', [roleId]);

      if (permissionIds.length > 0) {
        for (const pId of permissionIds) {
          await query(
            'INSERT INTO public.role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [roleId, pId]
          );
        }
      }
      await query('COMMIT');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }

    // Audit log
    await query(`
      INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, created_at)
      VALUES ('roles', $1, 'update_permissions', $2, $3, NOW())
    `, [roleId, JSON.stringify({ permission_count: permissionIds.length }), user.id]);

    revalidatePath('/dashboard/admin/roles');
    return { success: true };
  } catch (err: any) {
    console.error('updateRolePermissions error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Create a new dynamic role and map initial permissions.
 */
export async function createCustomRole(data: {
  name: string;
  displayName: string;
  description?: string;
  permissionIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await checkAdminAuth();
    const cleanSlug = data.name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const cleanName = data.displayName.trim() || cleanSlug;
    if (!cleanSlug) return { success: false, error: 'Valid role identifier is required' };

    const exist = await query('SELECT id FROM public.roles WHERE slug = $1 OR name = $2', [cleanSlug, cleanName]);
    if (exist.rows.length > 0) {
      return { success: false, error: 'A role with this identifier or name already exists' };
    }

    const insertRes = await query(`
      INSERT INTO public.roles (name, slug, description, is_system)
      VALUES ($1, $2, $3, false)
      RETURNING id;
    `, [cleanName, cleanSlug, data.description?.trim() || null]);

    const newRoleId = insertRes.rows[0].id;

    if (data.permissionIds.length > 0) {
      for (const pId of data.permissionIds) {
        await query(
          'INSERT INTO public.role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [newRoleId, pId]
        );
      }
    }

    await query(`
      INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, created_at)
      VALUES ('roles', $1, 'create_role', $2, $3, NOW())
    `, [newRoleId, JSON.stringify({ name: cleanName, slug: cleanSlug }), user.id]);

    revalidatePath('/dashboard/admin/roles');
    return { success: true };
  } catch (err: any) {
    console.error('createCustomRole error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a custom role (system roles cannot be deleted).
 */
export async function deleteCustomRole(roleId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await checkAdminAuth();

    const roleCheck = await query('SELECT is_system, name, slug FROM public.roles WHERE id = $1', [roleId]);
    if (roleCheck.rows.length === 0) return { success: false, error: 'Role not found' };
    if (roleCheck.rows[0].is_system || ['student', 'delivery', 'super_admin'].includes(roleCheck.rows[0].slug)) {
      return { success: false, error: 'Default system roles cannot be deleted' };
    }

    await query('DELETE FROM public.role_permissions WHERE role_id = $1', [roleId]);
    await query('DELETE FROM public.user_roles WHERE role_id = $1', [roleId]);
    await query('DELETE FROM public.roles WHERE id = $1', [roleId]);

    await query(`
      INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, created_at)
      VALUES ('roles', $1, 'delete_role', $2, $3, NOW())
    `, [roleId, JSON.stringify({ name: roleCheck.rows[0].name }), user.id]);

    revalidatePath('/dashboard/admin/roles');
    return { success: true };
  } catch (err: any) {
    console.error('deleteCustomRole error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Assign role to a user.
 */
export async function assignUserRole(
  userId: string,
  roleSlug: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await checkAdminAuth();

    const roleRes = await query('SELECT id, slug, name FROM public.roles WHERE slug = $1 OR name = $1', [roleSlug]);
    if (roleRes.rows.length === 0) return { success: false, error: 'Role does not exist' };
    const roleId = roleRes.rows[0].id;
    const actualSlug = roleRes.rows[0].slug;

    // Update public.users and public.profiles with the slug
    await query('UPDATE public.users SET role = $1, updated_at = NOW() WHERE id = $2', [actualSlug, userId]);
    await query('UPDATE public.profiles SET role = $1, updated_at = NOW() WHERE id = $2', [actualSlug, userId]);

    // Clean up old role assignments and assign the new role
    await query('DELETE FROM public.user_roles WHERE user_id = $1', [userId]);
    await query(`
      INSERT INTO public.user_roles (user_id, role_id, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id, role_id) DO NOTHING
    `, [userId, roleId]);

    // Handle delivery_partners provisioning/status
    if (actualSlug === 'delivery') {
      await query(`
        INSERT INTO public.delivery_partners (id, user_id, vehicle_type, vehicle_no, license_plate, is_available, is_online, total_deliveries, rating, created_at, updated_at)
        VALUES ($1, $1, 'Bike', null, null, true, true, 0, 5.0, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET 
          user_id = EXCLUDED.user_id,
          is_available = true, 
          is_online = true, 
          updated_at = NOW()
      `, [userId]);
    } else {
      await query(`
        UPDATE public.delivery_partners 
        SET is_available = false, is_online = false, updated_at = NOW() 
        WHERE user_id = $1 OR id = $1
      `, [userId]);
    }

    await query(`
      INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, created_at)
      VALUES ('users', $1, 'assign_role', $2, $3, NOW())
    `, [userId, JSON.stringify({ role: actualSlug }), user.id]);

    revalidatePath('/dashboard/admin/users');
    return { success: true };
  } catch (err: any) {
    console.error('assignUserRole error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch a user's current effective role and granted permission codes.
 */
export async function getUserRoleAndPermissions(userId: string): Promise<{
  success: boolean;
  role?: string;
  roleId?: string;
  roleName?: string;
  permissionCodes?: string[];
  error?: string;
}> {
  try {
    await checkAdminAuth();
    const userRes = await query<{ role: string }>('SELECT role FROM public.users WHERE id = $1 LIMIT 1', [userId]);
    if (userRes.rows.length === 0) return { success: false, error: 'User not found' };

    const roleSlug = userRes.rows[0].role;
    const roleRes = await query<{ id: string; name: string; slug: string }>(
      'SELECT id, name, slug FROM public.roles WHERE slug = $1 LIMIT 1',
      [roleSlug]
    );

    if (roleRes.rows.length === 0) {
      return { success: true, role: roleSlug, permissionCodes: [] };
    }

    const role = roleRes.rows[0];
    const permRes = await query<{ permission_code: string }>(`
      SELECT p.permission_code
      FROM public.role_permissions rp
      JOIN public.permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = $1
      ORDER BY p.permission_code ASC;
    `, [role.id]);

    return {
      success: true,
      role: role.slug,
      roleId: role.id,
      roleName: role.name,
      permissionCodes: permRes.rows.map((r) => r.permission_code),
    };
  } catch (err: any) {
    console.error('getUserRoleAndPermissions error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Create a new user (employee, staff, manager, delivery, etc.) with role assignment.
 */
export async function createAdminUser(data: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  role: string;
}): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    const { user: currentAdmin } = await checkAdminAuth();

    const fullName = data.fullName?.trim();
    const email = data.email?.toLowerCase().trim();
    const password = data.password?.trim();
    const phone = data.phone?.trim() || null;
    const roleSlug = data.role?.trim().toLowerCase() || 'staff';

    if (!fullName) return { success: false, error: 'Full name is required' };
    if (!email || !email.includes('@')) return { success: false, error: 'Valid email is required' };
    if (!password || password.length < 6) return { success: false, error: 'Password must be at least 6 characters' };

    // Check if user already exists
    const existing = await query('SELECT id FROM public.users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return { success: false, error: 'A user with this email already exists' };
    }

    // Verify role exists in public.roles
    const roleRes = await query('SELECT id, slug, name FROM public.roles WHERE slug = $1 OR name = $1 LIMIT 1', [roleSlug]);
    let targetRoleId: string | null = null;
    let actualSlug = roleSlug;
    if (roleRes.rows.length > 0) {
      targetRoleId = roleRes.rows[0].id;
      actualSlug = roleRes.rows[0].slug;
    }

    // Insert user with hashed password via crypt()
    const userRes = await query<{
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      role: string;
      is_active: boolean;
      created_at: string;
    }>(`
      INSERT INTO public.users (email, password_hash, full_name, phone, role, is_active, created_at, updated_at)
      VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, $5, true, NOW(), NOW())
      RETURNING id, email, full_name, phone, role, is_active, created_at;
    `, [email, password, fullName, phone, actualSlug]);

    const newUser = userRes.rows[0];

    // Insert into public.profiles
    await query(`
      INSERT INTO public.profiles (id, email, full_name, phone, role, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name, phone = EXCLUDED.phone;
    `, [newUser.id, email, fullName, phone, actualSlug]);

    // Insert into public.user_roles
    if (targetRoleId) {
      await query(`
        INSERT INTO public.user_roles (user_id, role_id, created_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING;
      `, [newUser.id, targetRoleId]);
    }

    // Auto-create delivery partner profile if created with delivery role
    if (actualSlug === 'delivery') {
      await query(`
        INSERT INTO public.delivery_partners (id, user_id, vehicle_type, vehicle_no, license_plate, is_available, is_online, total_deliveries, rating, created_at, updated_at)
        VALUES ($1, $1, 'Bike', null, null, true, true, 0, 5.0, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET 
          user_id = EXCLUDED.user_id,
          is_available = true, 
          is_online = true, 
          updated_at = NOW()
      `, [newUser.id]);
    }

    // Audit log
    await query(`
      INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, created_at)
      VALUES ('users', $1, 'create_user', $2, $3, NOW())
    `, [newUser.id, JSON.stringify({ email, full_name: fullName, role: actualSlug }), currentAdmin.id]);

    revalidatePath('/dashboard/admin/users');

    return {
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        phone: newUser.phone,
        role: newUser.role,
        is_active: newUser.is_active,
        created_at: newUser.created_at,
      },
    };
  } catch (err: any) {
    console.error('createAdminUser error:', err);
    return { success: false, error: err.message || 'Failed to create user' };
  }
}
