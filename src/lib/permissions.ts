/**
 * Common Permission Service for Admin Portal
 * Dilip Da E-Commerce Platform
 */

export const PERMISSION_CODES = {
  // Dashboard
  DASH: 'DASH',
  DASHFL: 'DASHFL',

  // In-Store
  INSTORE: 'INSTORE',
  INSTORE_HIST: 'INSTORE_HIST',

  // Wallet KYC
  WALLET_KYC: 'WALLET_KYC',
  WALLET_KYC_HIST: 'WALLET_KYC_HIST',
  WALLET_KYC_LIMIT: 'WALLET_KYC_LIMIT',
  WALLET_KYC_VIEW: 'WALLET_KYC_VIEW',
  WALLET_KYC_PENALTY: 'WALLET_KYC_PENALTY',

  // Orders
  ORDERS: 'ORDERS',
  ORDERS_RUNNING: 'ORDERS_RUNNING',
  ORDERS_HIST: 'ORDERS_HIST',

  // Payments
  PAYMENTS: 'PAYMENTS',
  PAYMENTS_EXPORT: 'PAYMENTS_EXPORT',
  PAYMENTS_TOGGLE: 'PAYMENTS_TOGGLE',

  // Expenses
  EXPENSES: 'EXPENSES',
  EXP_ADD: 'EXP_ADD',
  EXP_INVEST: 'EXP_INVEST',

  // Setting | Category
  SET_CAT: 'SET_CAT',
  SET_CAT_ADD: 'SET_CAT_ADD',
  SET_CAT_EDIT: 'SET_CAT_EDIT',
  SET_CAT_DEL: 'SET_CAT_DEL',

  // Setting | Product
  SET_PROD: 'SET_PROD',
  SET_PROD_ADD: 'SET_PROD_ADD',
  SET_PROD_EDIT: 'SET_PROD_EDIT',
  SET_PROD_DEL: 'SET_PROD_DEL',

  // Setting | General Setting
  SET_GEN: 'SET_GEN',
  SET_GEN_EDIT: 'SET_GEN_EDIT',

  // Setting | Audit Log
  SET_AUDIT: 'SET_AUDIT',

  // Setting | Bumper Offer
  SET_OFFERS: 'SET_OFFERS',

  // User Management | Employee
  USER_EMP: 'USER_EMP',
  USER_EMP_ADD: 'USER_EMP_ADD',
  USER_EMP_EDIT: 'USER_EMP_EDIT',
  USER_EMP_DEL: 'USER_EMP_DEL',

  // User Management | Roles & Permissions
  USER_ROLES: 'USER_ROLES',
  USER_ROLES_ADD: 'USER_ROLES_ADD',
  USER_ROLES_EDIT: 'USER_ROLES_EDIT',
  USER_ROLES_DEL: 'USER_ROLES_DEL',

  // User Management | Customer
  USER_CUST: 'USER_CUST',
  USER_CUST_CREDIT: 'USER_CUST_CREDIT',
  USER_CUST_SUSPEND: 'USER_CUST_SUSPEND',
} as const;

export const ADMIN_PAGE_PERMISSIONS: Record<string, string[]> = {
  '/dashboard/admin': ['DASH', 'DASHFL', 'dashboard.view'],
  '/dashboard/admin/in-store': ['INSTORE', 'ORD_VIEW', 'orders.view'],
  '/dashboard/admin/wallet': ['WALLET_KYC', 'WALLET_KYC_VIEW', 'WALLET_VIEW', 'wallet.view'],
  '/dashboard/admin/orders': ['ORDERS', 'ORDERS_RUNNING', 'ORDERS_HIST', 'ORD_VIEW', 'orders.view'],
  '/dashboard/admin/payments': ['PAYMENTS', 'PAYMENTS_EXPORT', 'PAYMENTS_TOGGLE', 'WALLET_VIEW', 'wallet.view'],
  '/dashboard/admin/expenses': ['EXPENSES', 'EXP_ADD', 'EXP_INVEST', 'EXP_MANAGE', 'expenses.manage'],
  '/dashboard/admin/categories': ['SET_CAT', 'SET_CAT_ADD', 'SET_CAT_EDIT', 'SET_CAT_DEL', 'CAT_MANAGE', 'categories.manage'],
  '/dashboard/admin/products': ['SET_PROD', 'SET_PROD_ADD', 'SET_PROD_EDIT', 'SET_PROD_DEL', 'PROD_VIEW', 'products.view'],
  '/dashboard/admin/settings': ['SET_GEN', 'SET_GEN_EDIT', 'SETTINGS_VIEW', 'settings.view'],
  '/dashboard/admin/audit-logs': ['SET_AUDIT', 'AUDIT_VIEW', 'audit.view'],
  '/dashboard/admin/bumper-offers': ['SET_OFFERS', 'OFFERS_MANAGE', 'offers.manage'],
  '/dashboard/admin/users': ['USER_EMP', 'USER_EMP_ADD', 'USER_EMP_EDIT', 'USER_EMP_DEL', 'USERS_VIEW', 'users.view'],
  '/dashboard/admin/roles': ['USER_ROLES', 'USER_ROLES_ADD', 'USER_ROLES_EDIT', 'USER_ROLES_DEL', 'ROLES_MANAGE', 'roles.manage'],
  '/dashboard/admin/students': ['USER_CUST', 'USER_CUST_CREDIT', 'USER_CUST_SUSPEND', 'USERS_VIEW', 'users.view'],
};

export const ADMIN_ORDERED_PAGES = [
  '/dashboard/admin',
  '/dashboard/admin/in-store',
  '/dashboard/admin/wallet',
  '/dashboard/admin/orders',
  '/dashboard/admin/payments',
  '/dashboard/admin/expenses',
  '/dashboard/admin/categories',
  '/dashboard/admin/products',
  '/dashboard/admin/settings',
  '/dashboard/admin/audit-logs',
  '/dashboard/admin/bumper-offers',
  '/dashboard/admin/users',
  '/dashboard/admin/roles',
  '/dashboard/admin/students',
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
  if (isSuperAdminOrOwner(role)) {
    return '/dashboard/admin';
  }

  for (const page of ADMIN_ORDERED_PAGES) {
    if (canAccessAdminPage(userPermissions, page, role)) {
      return page;
    }
  }

  return '/auth/login';
}
