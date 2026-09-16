'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Trash2, Shield, ShieldOff } from 'lucide-react';
import { DataTable, SearchInput, StatusFilter, PageHeader, ConfirmDialog, ToastContainer, useToast } from '@/components/ui/data-table';
import { getAdminUsers, deleteUser } from '@/features/admin/actions';
import type { AdminUser } from '@/features/admin/types';

const roleOptions = [
  { label: 'All roles', value: 'all' },
  { label: 'Student', value: 'student' },
  { label: 'Merchant', value: 'merchant' },
  { label: 'Delivery', value: 'delivery' },
  { label: 'Admin', value: 'admin' },
  { label: 'Super Admin', value: 'super_admin' },
];

const statusOptions = [
  { label: 'All status', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
];

const roleBadge: Record<string, string> = {
  student: 'bg-blue-500/10 text-blue-600',
  merchant: 'bg-purple-500/10 text-purple-600',
  delivery: 'bg-green-500/10 text-green-600',
  admin: 'bg-amber-500/10 text-amber-600',
  super_admin: 'bg-red-500/10 text-red-600',
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
  const [confirmAction, setConfirmAction] = useState<{ type: string; id?: string } | null>(null);
  const { toasts, addToast, removeToast } = useToast();

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

  const handleDelete = async (id: string) => {
    const res = await deleteUser(id);
    if (res.success) { addToast('User deleted permanently', 'success'); fetchUsers(); }
    else addToast(res.error ?? 'Failed to delete user', 'error');
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (u: AdminUser) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-zgray flex items-center justify-center text-sm font-medium text-ztext shrink-0">
            {u.full_name.charAt(0).toUpperCase()}
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
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${roleBadge[u.role] ?? 'bg-zgray text-ztext-light'}`}>
          {u.role.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u: AdminUser) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
          u.is_active ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
        }`}>
          {u.is_active ? <Shield size={12} /> : <ShieldOff size={12} />}
          {u.is_active ? 'Active' : 'Suspended'}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Joined',
      sortable: true,
      render: (u: AdminUser) => (
        <span className="text-sm text-ztext-light">{new Date(u.created_at).toLocaleDateString()}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u: AdminUser) => (
        <button onClick={() => setConfirmAction({ type: 'delete', id: u.id })}
          className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
          title="Delete user"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="All Users" description={`${total} user${total === 1 ? '' : 's'} registered`}>
        <button onClick={() => fetchUsers()} disabled={loading}
          className="button-z button-z-secondary h-9 px-3 text-xs flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name, email or phone..." />
        <StatusFilter value={role} onChange={(v) => { setRole(v); setPage(1); }} options={roleOptions} />
        <StatusFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={statusOptions} />
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
        onSort={(key, order) => { setSortBy(key); setSortOrder(order); setPage(1); }}
        sortBy={sortBy}
        sortOrder={sortOrder}
        keyExtractor={(u) => (u as unknown as AdminUser).id}
        emptyMessage="No users found"
      />

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'delete' && confirmAction.id) handleDelete(confirmAction.id);
        }}
        title="Delete user"
        message="This will permanently delete the user account, profile, and all associated data. This action cannot be undone."
        confirmLabel="Delete permanently"
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
