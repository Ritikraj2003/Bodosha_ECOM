/**
 * Common Permission Service for Admin Portal
 * Dilip Da E-Commerce Platform
 */

export const PERMISSION_CODES = {
  // System / Dashboard
  DASHBOARD_VIEW: 'DASH',

  // Catalog
  PRODUCTS_VIEW: 'PROD_VIEW',
  PRODUCTS_ADD: 'PROD_ADD',
  PRODUCTS_EDIT: 'PROD_EDIT',
  PRODUCTS_DEL: 'PROD_DEL',
  CATEGORIES_MANAGE: 'CAT_MANAGE',

  // Orders & In-Store
  ORDERS_VIEW: 'ORD_VIEW',
  ORDERS_STATUS: 'ORD_STATUS',
  ORDERS_CANCEL: 'ORD_CANCEL',
  ORDERS_REFUND: 'ORD_REFUND',

  // Delivery
  DELIVERY_VIEW: 'DELV_VIEW',
  DELIVERY_ASSIGN: 'DELV_ASSIGN',

  // Users & Staff
  USERS_VIEW: 'USERS_VIEW',
  USERS_MANAGE: 'USERS_MANAGE',
  ROLES_MANAGE: 'ROLES_MANAGE',

  // Finance & Wallet
  WALLET_VIEW: 'WALLET_VIEW',
  WALLET_ADJUST: 'WALLET_ADJUST',
  BNPL_MANAGE: 'BNPL_MANAGE',
  EXPENSES_MANAGE: 'EXP_MANAGE',

  // Administration
  AUDIT_VIEW: 'AUDIT_VIEW',
  SETTINGS_VIEW: 'SETTINGS_VIEW',
  SETTINGS_EDIT: 'SETTINGS_EDIT',
  OFFERS_MANAGE: 'OFFERS_MANAGE',

  // Merchants
  MERCHANTS_VIEW: 'MERCH_VIEW',
  MERCHANTS_EDIT: 'MERCH_EDIT',
  MERCHANTS_APPROVE: 'MERCH_APPROVE',
} as const;

export const ADMIN_PAGE_PERMISSIONS: Record<string, string[]> = {
  '/dashboard/admin': ['DASH', 'dashboard.view'],
  '/dashboard/admin/users': ['USERS_VIEW', 'USERS_MANAGE', 'users.view', 'users.manage'],
  '/dashboard/admin/roles': ['ROLES_MANAGE', 'roles.manage'],
  '/dashboard/admin/in-store': ['ORD_VIEW', 'ORD_STATUS', 'orders.view', 'orders.update_status'],
  '/dashboard/admin/categories': ['CAT_MANAGE', 'categories.manage'],
  '/dashboard/admin/products': [
    'PROD_VIEW', 'PROD_ADD', 'PROD_EDIT', 'PROD_DEL',
    'products.view', 'products.create', 'products.edit', 'products.delete'
  ],
  '/dashboard/admin/students': ['USERS_VIEW', 'USERS_MANAGE', 'users.view', 'users.manage'],
  '/dashboard/admin/wallet': ['WALLET_VIEW', 'WALLET_ADJUST', 'BNPL_MANAGE', 'wallet.view', 'wallet.credit_adjust', 'bnpl.manage'],
  '/dashboard/admin/orders': ['ORD_VIEW', 'ORD_STATUS', 'ORD_CANCEL', 'ORD_REFUND', 'orders.view', 'orders.update_status', 'orders.cancel', 'orders.refund'],
  '/dashboard/admin/payments': ['WALLET_VIEW', 'ORD_VIEW', 'wallet.view', 'orders.view'],
  '/dashboard/admin/expenses': ['EXP_MANAGE', 'expenses.manage'],
  '/dashboard/admin/audit-logs': ['AUDIT_VIEW', 'audit.view'],
  '/dashboard/admin/settings': ['SETTINGS_VIEW', 'SETTINGS_EDIT', 'settings.view', 'settings.edit'],
  '/dashboard/admin/bumper-offers': ['OFFERS_MANAGE', 'PROD_EDIT', 'CAT_MANAGE', 'offers.manage', 'products.edit', 'categories.manage'],
};

export const ADMIN_ORDERED_PAGES = [
  '/dashboard/admin',
  '/dashboard/admin/users',
  '/dashboard/admin/roles',
  '/dashboard/admin/in-store',
  '/dashboard/admin/categories',
  '/dashboard/admin/products',
  '/dashboard/admin/students',
  '/dashboard/admin/wallet',
  '/dashboard/admin/orders',
  '/dashboard/admin/payments',
  '/dashboard/admin/expenses',
  '/dashboard/admin/audit-logs',
  '/dashboard/admin/settings',
  '/dashboard/admin/bumper-offers',
];

/**
 * Check if the given role is Super Admin or Store Owner (unrestricted bypass).
 */
export function isSuperAdminOrOwner(role?: string | null): boolean {
  if (!role) return false;
  const cleanRole = role.toLowerCase().trim();
  return cleanRole === 'super_admin' || cleanRole === 'owner';
}

/**
 * Check whether the user has the required permission(s).
 * - Super admin / owner always returns true.
 * - Wildcard '*' permission always returns true.
 * - Otherwise returns true if user has AT LEAST ONE of the required permissions.
 */
export function hasPermission(
  userPermissions?: string[] | null,
  requiredPermissions?: string | string[] | null,
  role?: string | null
): boolean {
  if (isSuperAdminOrOwner(role)) return true;
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  if (userPermissions.includes('*')) return true;
  if (!requiredPermissions) return true;

  const requiredList = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  if (requiredList.length === 0) return true;

  return requiredList.some((req) => userPermissions.includes(req));
}

/**
 * Check if the user is authorized to access a given admin route.
 */
export function canAccessAdminPage(
  userPermissions?: string[] | null,
  pathname?: string | null,
  role?: string | null
): boolean {
  if (isSuperAdminOrOwner(role)) return true;
  if (!pathname || !pathname.startsWith('/dashboard/admin')) return true;
  if (userPermissions && userPermissions.includes('*')) return true;

  // Exact match first
  if (ADMIN_PAGE_PERMISSIONS[pathname]) {
    return hasPermission(userPermissions, ADMIN_PAGE_PERMISSIONS[pathname], role);
  }

  // Prefix match for subroutes (e.g., /dashboard/admin/products/new -> /dashboard/admin/products)
  const matchingKey = Object.keys(ADMIN_PAGE_PERMISSIONS)
    .filter((route) => route !== '/dashboard/admin' && pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  if (matchingKey) {
    return hasPermission(userPermissions, ADMIN_PAGE_PERMISSIONS[matchingKey], role);
  }

  // If path is exactly /dashboard/admin
  if (pathname === '/dashboard/admin') {
    return hasPermission(userPermissions, ADMIN_PAGE_PERMISSIONS['/dashboard/admin'], role);
  }

  return true;
}

/**
 * Find the first admin page the user is permitted to see.
 */
export function getFirstAllowedAdminPage(
  userPermissions?: string[] | null,
  role?: string | null
): string {
  if (isSuperAdminOrOwner(role) || canAccessAdminPage(userPermissions, '/dashboard/admin', role)) {
    return '/dashboard/admin';
  }

  for (const page of ADMIN_ORDERED_PAGES) {
    if (canAccessAdminPage(userPermissions, page, role)) {
      return page;
    }
  }

  return '/auth/login';
}
