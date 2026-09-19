'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Trash2,
  Shield,
  ShieldOff,
  ShieldAlert,
  RotateCcw,
  AlertTriangle,
  UserPlus,
  KeyRound,
  X,
  Eye,
  EyeOff,
  Check,
  Loader2,
  ExternalLink,
  Info,
} from 'lucide-react';
import {
  DataTable,
  SearchInput,
  StatusFilter,
  PageHeader,
  ToastContainer,
  useToast,
} from '@/components/ui/data-table';
import { getAdminUsers, deleteUser, restoreUser } from '@/features/admin/actions';
import {
  assignUserRole,
  createAdminUser,
  getRolesWithPermissions,
  getUserRoleAndPermissions,
  type RoleWithPermissions,
} from '@/features/admin/actions/rbac';
import type { AdminUser } from '@/features/admin/types';
import { hasPermission, PERMISSION_CODES } from '@/lib/permissions';
import { useAuthStore } from '@/features/auth/store';

const statusOptions = [
  { label: 'All status', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Soft Deleted', value: 'deleted' },
];

const roleBadge: Record<string, string> = {
  student: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  merchant: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  delivery: 'bg-green-500/10 text-green-500 border-green-500/20',
  staff: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  manager: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  admin: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  super_admin: 'bg-red-500/10 text-red-500 border-red-500/20',
  owner: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteMode, setDeleteMode] = useState<'soft' | 'hard'>('soft');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  const currentUser = useAuthStore((s) => s.user);
  const userRole = currentUser?.role ?? null;
  const userPermissions = currentUser?.permissions ?? [];

  const canAddEmployee = hasPermission(userPermissions, [PERMISSION_CODES.USER_EMP_ADD, 'USERS_MANAGE', 'users.manage'], userRole);
  const canEditEmployee = hasPermission(userPermissions, [PERMISSION_CODES.USER_EMP_EDIT, 'USERS_MANAGE', 'users.manage'], userRole);
  const canDeleteEmployee = hasPermission(userPermissions, [PERMISSION_CODES.USER_EMP_DEL, 'USERS_MANAGE', 'users.manage'], userRole);
  const canManageUsers = canAddEmployee || canEditEmployee || canDeleteEmployee;

  // Roles cache for modals and filters (loaded from public.roles)
  const [availableRoles, setAvailableRoles] = useState<RoleWithPermissions[]>([]);

  const roleOptions = [
    { label: 'All roles', value: 'all' },
    ...availableRoles
      .filter((r) => r.slug !== 'student')
      .map((r) => ({
        label: r.name || r.slug,
        value: r.slug,
      })),
  ];

  // Create user modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createPhone, setCreatePhone] = useState('');
  const [createRole, setCreateRole] = useState('staff');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Manage permissions modal
  const [inspectUser, setInspectUser] = useState<AdminUser | null>(null);
  const [inspectUserPerms, setInspectUserPerms] = useState<string[]>([]);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectRole, setInspectRole] = useState('');
  const [inspectUpdating, setInspectUpdating] = useState(false);

  // Load roles list for dropdowns
  useEffect(() => {
    getRolesWithPermissions().then((res) => {
      if (res.success && res.data) {
        const empRoles = res.data.filter((r) => r.slug !== 'student');
        setAvailableRoles(empRoles);
        if (empRoles.length > 0) {
          const defaultRole = empRoles.find((r) => r.slug === 'staff')?.slug || empRoles[0].slug;
          setCreateRole((prev) => (empRoles.some((r) => r.slug === prev) ? prev : defaultRole));
        }
      }
    });
  }, []);

  const fetchUsers = useCallback(async (p?: number) => {
    setLoading(true);
    const targetPage = p ?? page;
    const res = await getAdminUsers({
      search: search.trim() || undefined,
      role: role !== 'all' ? role : undefined,
      status: status !== 'all' ? status : undefined,
      page: targetPage,
      pageSize: 20,
      sortBy,
      sortOrder,
    });
    if (res.success && res.data) {
      setUsers(res.data.data as AdminUser[]);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(res.data.page);
    }
    setLoading(false);
  }, [search, role, status, sortBy, sortOrder, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(page);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, role, status, sortBy, sortOrder, page, fetchUsers]);

  const handleDelete = async (id: string, softDelete: boolean) => {
    setDeleteLoading(true);
    const res = await deleteUser(id, softDelete);
    setDeleteLoading(false);
    if (res.success) {
      addToast(
        softDelete
          ? 'User soft-deleted successfully (is_deleted set to true)'
          : 'User permanently deleted from database',
        'success'
      );
      setDeleteTarget(null);
      fetchUsers();
    } else {
      addToast(res.error ?? 'Failed to delete user', 'error');
    }
  };

  const handleRestore = async (id: string) => {
    setRestoreLoading(id);
    const res = await restoreUser(id);
    setRestoreLoading(null);
    if (res.success) {
      addToast('User restored successfully', 'success');
      fetchUsers();
    } else {
      addToast(res.error ?? 'Failed to restore user', 'error');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const res = await assignUserRole(userId, newRole);
    if (res.success) {
      addToast(`Role assigned: ${newRole}`, 'success');
      fetchUsers();
    } else {
      addToast(res.error || 'Failed to update role', 'error');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (!createName.trim()) {
      setCreateError('Please enter full name');
      return;
    }
    if (!createEmail.trim()) {
      setCreateError('Please enter email address');
      return;
    }
    if (!createPassword.trim() || createPassword.length < 6) {
      setCreateError('Password must be at least 6 characters');
      return;
    }

    setCreateLoading(true);
    const res = await createAdminUser({
      fullName: createName.trim(),
      email: createEmail.trim(),
      password: createPassword.trim(),
      phone: createPhone.trim() || undefined,
      role: createRole,
    });
    setCreateLoading(false);

    if (res.success) {
      addToast(`User ${createName} created with role ${createRole}!`, 'success');
      setShowCreateModal(false);
      setCreateName('');
      setCreateEmail('');
      setCreatePassword('');
      setCreatePhone('');
      setCreateRole('staff');
      fetchUsers(1);
    } else {
      setCreateError(res.error || 'Failed to create user');
    }
  };

  const openInspectModal = async (u: AdminUser) => {
    setInspectUser(u);
    setInspectRole(u.role);
    setInspectLoading(true);
    const res = await getUserRoleAndPermissions(u.id);
    if (res.success && res.permissionCodes) {
      setInspectUserPerms(res.permissionCodes);
    } else {
      setInspectUserPerms([]);
    }
    setInspectLoading(false);
  };

  const handleInspectRoleSave = async () => {
    if (!inspectUser || !inspectRole) return;
    setInspectUpdating(true);
    const res = await assignUserRole(inspectUser.id, inspectRole);
    if (res.success) {
      addToast(`Role updated to ${inspectRole}`, 'success');
      const permsRes = await getUserRoleAndPermissions(inspectUser.id);
      if (permsRes.success && permsRes.permissionCodes) {
        setInspectUserPerms(permsRes.permissionCodes);
      }
      fetchUsers();
    } else {
      addToast(res.error || 'Failed to update role', 'error');
    }
    setInspectUpdating(false);
  };

  // Find permission count / preview for currently selected createRole
  const activeCreateRoleMeta = availableRoles.find((r) => r.slug === createRole || r.name.toLowerCase() === createRole);

  const columns = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (u: AdminUser) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-zgray flex items-center justify-center text-sm font-medium text-ztext shrink-0">
            {u.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <div className="font-medium text-ztext">{u.full_name}</div>
            <div className="text-xs text-ztext-lighter">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: AdminUser) => (
        <select
          value={u.role}
          disabled={!canEditEmployee}
          onChange={(e) => handleRoleChange(u.id, e.target.value)}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border bg-zcard focus:outline-none focus:ring-1 focus:ring-zred cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
            roleBadge[u.role] ?? 'text-ztext border-zborder'
          }`}
        >
          {availableRoles.map((r) => (
            <option key={r.id} value={r.slug}>
              {r.name || r.slug}
            </option>
          ))}
          {u.role && !availableRoles.some((r) => r.slug === u.role) && (
            <option value={u.role}>
              {u.role}
            </option>
          )}
        </select>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u: AdminUser) => {
        if (u.is_deleted) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <AlertTriangle size={12} />
              Soft Deleted
            </span>
          );
        }
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              u.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
            }`}
          >
            {u.is_active ? <Shield size={12} /> : <ShieldOff size={12} />}
            {u.is_active ? 'Active' : 'Suspended'}
          </span>
        );
      },
    },
    {
      key: 'created',
      header: 'Joined',
      sortable: true,
      render: (u: AdminUser) => (
        <span className="text-sm text-ztext-light">
          {new Date(u.created_at).toLocaleDateString()}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u: AdminUser) => (
        <div className="flex items-center gap-1">
          {canEditEmployee && !u.is_deleted && u.role !== 'student' && (
            <button
              onClick={() => openInspectModal(u)}
              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
              title="View role permissions"
            >
              <KeyRound size={16} />
            </button>
          )}
          {u.is_deleted && canEditEmployee && (
            <button
              onClick={() => handleRestore(u.id)}
              disabled={restoreLoading === u.id}
              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
              title="Restore user"
            >
              {restoreLoading === u.id ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RotateCcw size={16} />
              )}
            </button>
          )}
          {canDeleteEmployee && (
            <button
              onClick={() => {
                setDeleteMode(u.is_deleted ? 'hard' : 'soft');
                setDeleteTarget(u);
              }}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
              title={u.is_deleted ? 'Delete permanently' : 'Delete user (Soft / Hard)'}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description={`${total} employee${total === 1 ? '' : 's'} registered across store`}
      >
        <div className="flex items-center gap-2">
          {canAddEmployee && (
            <button
              onClick={() => {
                setCreateError('');
                setShowCreateModal(true);
              }}
              className="button-z button-z-primary h-9 px-3.5 text-xs flex items-center gap-1.5 font-bold shadow-sm"
            >
              <UserPlus size={15} />
              Add Employee
            </button>
          )}
          <button
            onClick={() => fetchUsers()}
            disabled={loading}
            className="button-z button-z-secondary h-9 px-3 text-xs flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search by name, email or phone..."
        />
        <StatusFilter
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          options={roleOptions}
        />
        <StatusFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={statusOptions}
        />
      </div>

      <DataTable
        columns={columns}
        data={users as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={20}
        totalPages={totalPages}
        loading={loading}
        onPageChange={(p) => setPage(p)}
        onSort={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
          setPage(1);
        }}
        sortBy={sortBy}
        sortOrder={sortOrder}
        keyExtractor={(u) => (u as unknown as AdminUser).id}
        emptyMessage="No users found"
      />

      {/* CREATE EMPLOYEE / USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-lg w-full p-6 shadow-z-modal animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3.5 border-b border-zborder mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-zred/10 border border-zred/20 flex items-center justify-center text-zred">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ztext">Add Employee / User</h3>
                  <p className="text-xs text-ztext-light">Create account and assign store role & permissions</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-ztext-light hover:text-ztext hover:bg-zsurface transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              {createError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 font-medium">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-ztext mb-1.5">
                  Full Name <span className="text-zred">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kalita"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="input-z w-full"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1.5">
                    Email Address <span className="text-zred">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="staff@dilipda.com"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="input-z w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    className="input-z w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ztext mb-1.5">
                  Login Password <span className="text-zred">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Min 6 characters"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="input-z w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ztext-light hover:text-ztext transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ztext mb-1.5">
                  Assign Store Role <span className="text-zred">*</span>
                </label>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                  className="input-z w-full font-medium"
                >
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.slug}>
                      {r.name || r.slug}
                    </option>
                  ))}
                </select>
              </div>

              {/* Role permissions info */}
              <div className="p-3.5 rounded-xl bg-zsurface border border-zborder space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-ztext font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Info size={14} className="text-blue-500" />
                    Role Permissions Overview
                  </span>
                  {activeCreateRoleMeta && (
                    <span className="text-[11px] text-ztext-light">
                      {activeCreateRoleMeta.permission_count} active permissions
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ztext-light leading-relaxed">
                  Employees assigned to <strong className="text-ztext capitalize">{createRole}</strong> receive automatic access to authorized modules.
                </p>
                <Link
                  href="/dashboard/admin/roles"
                  className="inline-flex items-center gap-1 text-[11px] text-zred font-semibold hover:underline mt-1"
                >
                  Customize permissions matrix in Roles & Permissions <ExternalLink size={11} />
                </Link>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zborder">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="button-z button-z-secondary text-xs px-4 h-9"
                  disabled={createLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button-z button-z-primary text-xs px-5 h-9 font-bold flex items-center gap-1.5"
                  disabled={createLoading}
                >
                  {createLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Create Employee
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* USER PERMISSIONS INSPECTOR MODAL */}
      {inspectUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-lg w-full p-6 shadow-z-modal animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3.5 border-b border-zborder mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ztext">{inspectUser.full_name}</h3>
                  <p className="text-xs text-ztext-light">{inspectUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectUser(null)}
                className="p-1.5 rounded-lg text-ztext-light hover:text-ztext hover:bg-zsurface transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ztext mb-1.5">
                  Change Role
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={inspectRole}
                    onChange={(e) => setInspectRole(e.target.value)}
                    className="input-z flex-1 font-medium text-xs"
                  >
                    {availableRoles.map((r) => (
                      <option key={r.id} value={r.slug}>
                        {r.name || r.slug}
                      </option>
                    ))}
                    {inspectRole && !availableRoles.some((r) => r.slug === inspectRole) && (
                      <option value={inspectRole}>
                        {inspectRole}
                      </option>
                    )}
                  </select>
                  <button
                    onClick={handleInspectRoleSave}
                    disabled={inspectUpdating || inspectRole === inspectUser.role}
                    className="button-z button-z-primary text-xs h-9 px-3.5 font-bold disabled:opacity-50"
                  >
                    {inspectUpdating ? <Loader2 size={13} className="animate-spin" /> : 'Save Role'}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-ztext">
                    Granted Permissions ({inspectUserPerms.length})
                  </span>
                  <Link
                    href="/dashboard/admin/roles"
                    className="text-[11px] text-zred font-semibold hover:underline flex items-center gap-1"
                  >
                    Edit Role Matrix <ExternalLink size={10} />
                  </Link>
                </div>

                {inspectLoading ? (
                  <div className="py-8 flex justify-center text-ztext-light">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                ) : inspectUserPerms.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zsurface border border-zborder text-center text-xs text-ztext-light">
                    No explicit permissions granted to this role.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                    {inspectUserPerms.map((code) => (
                      <div
                        key={code}
                        className="px-2.5 py-1.5 rounded-lg bg-zsurface border border-zborder text-[11px] font-medium text-ztext flex items-center gap-1.5"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="truncate">{code}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-zborder flex justify-end">
                <button
                  onClick={() => setInspectUser(null)}
                  className="button-z button-z-secondary text-xs px-4 h-9"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL: SOFT DELETE VS HARD DELETE */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-lg w-full p-6 shadow-z-modal animate-scale-up">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-zborder mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                  <Trash2 size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-ztext leading-tight">Delete User Account</h3>
                  <p className="text-xs text-ztext-light font-medium truncate mt-0.5">
                    {deleteTarget.full_name}{' '}
                    <span className="text-ztext-lighter font-normal">({deleteTarget.email})</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="p-1.5 rounded-lg text-ztext-light hover:text-ztext hover:bg-zsurface transition-colors shrink-0 ml-2"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-ztext-light mb-4 leading-relaxed">
              Please choose how you would like to handle deleting this user account:
            </p>

            {/* Option Cards */}
            <div className="space-y-3 mb-6">
              {/* Soft Delete Option Card */}
              <div
                onClick={() => setDeleteMode('soft')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                  deleteMode === 'soft'
                    ? 'border-amber-500 bg-amber-500/[0.08] shadow-sm ring-1 ring-amber-500/30'
                    : 'border-zborder bg-zsurface/50 hover:border-amber-500/40 hover:bg-amber-500/[0.02]'
                }`}
              >
                <div className="mt-0.5">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      deleteMode === 'soft' ? 'border-amber-500' : 'border-zborder'
                    }`}
                  >
                    {deleteMode === 'soft' && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-ztext flex items-center gap-1.5">
                      <ShieldAlert size={14} className="text-amber-500 shrink-0" />
                      Soft Delete
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-ztext-light leading-relaxed">
                    Sets <code className="text-[10px] bg-zcard px-1.5 py-0.5 rounded border border-zborder font-mono">is_deleted = true</code> and disables login. All historical orders, payments, and activity logs are safely preserved.
                  </p>
                </div>
              </div>

              {/* Hard Delete Option Card */}
              <div
                onClick={() => setDeleteMode('hard')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                  deleteMode === 'hard'
                    ? 'border-red-500 bg-red-500/[0.08] shadow-sm ring-1 ring-red-500/30'
                    : 'border-zborder bg-zsurface/50 hover:border-red-500/40 hover:bg-red-500/[0.02]'
                }`}
              >
                <div className="mt-0.5">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      deleteMode === 'hard' ? 'border-red-500' : 'border-zborder'
                    }`}
                  >
                    {deleteMode === 'hard' && <div className="w-2 h-2 rounded-full bg-red-500" />}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-ztext flex items-center gap-1.5">
                      <Trash2 size={14} className="text-red-500 shrink-0" />
                      Hard Delete
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 whitespace-nowrap">
                      Permanent
                    </span>
                  </div>
                  <p className="text-[11px] text-ztext-light leading-relaxed">
                    Permanently purges the user record and linked profile from the database.{' '}
                    <strong className="text-red-500">This action is irreversible.</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-4 border-t border-zborder">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="button-z button-z-secondary text-xs px-4 h-10 font-semibold whitespace-nowrap justify-center"
                disabled={deleteLoading}
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                {deleteMode === 'soft' ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(deleteTarget.id, true)}
                    className="flex-1 sm:flex-initial h-10 px-5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white transition-all shadow-sm flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
                    <span>Confirm Soft Delete</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDelete(deleteTarget.id, false)}
                    className="flex-1 sm:flex-initial h-10 px-5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white transition-all shadow-sm flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    <span>Permanently Delete User</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
