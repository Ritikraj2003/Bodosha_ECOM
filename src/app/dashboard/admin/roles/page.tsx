'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield, KeyRound, Check, Plus, Trash2, Save,
  RefreshCw, AlertCircle, Info, Lock, Eye,
  Search, ArrowRight, ArrowLeft, X, Store, ToggleLeft, ToggleRight, Pencil,
} from 'lucide-react';
import {
  getRolesWithPermissions,
  getAllPermissions,
  updateRolePermissions,
  createCustomRole,
  deleteCustomRole,
  type RoleWithPermissions,
  type PermissionItem
} from '@/features/admin/actions/rbac';
import { hasPermission } from '@/lib/permissions';
import { useAuthStore } from '@/features/auth/store';

export default function RolesAndPermissionsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const userRole = currentUser?.role ?? null;
  const userPermissions = currentUser?.permissions ?? [];

  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [permissionsByModule, setPermissionsByModule] = useState<Record<string, PermissionItem[]>>({});
  const [allPermissionsList, setAllPermissionsList] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Edit/View Permission Modal
  const [editRole, setEditRole] = useState<RoleWithPermissions | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set());
  const [showEditModal, setShowEditModal] = useState(false);

  // View (read-only) modal
  const [viewRole, setViewRole] = useState<RoleWithPermissions | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);

  // Add Role Modal
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [modalRoleName, setModalRoleName] = useState('');
  const [modalRoleStatus, setModalRoleStatus] = useState(true);
  const [modalSearch, setModalSearch] = useState('');
  const [modalChosenIds, setModalChosenIds] = useState<Set<string>>(new Set());
  const [modalSelectedAvailableId, setModalSelectedAvailableId] = useState<string | null>(null);
  const [modalSelectedChosenId, setModalSelectedChosenId] = useState<string | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);

  const canManageRoles = hasPermission(userPermissions, ['ROLES_MANAGE', 'roles.manage'], userRole);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        getRolesWithPermissions(),
        getAllPermissions()
      ]);
      if (rolesRes.success && rolesRes.data) setRoles(rolesRes.data);
      if (permsRes.success && permsRes.data) {
        setPermissionsByModule(permsRes.data);
        setAllPermissionsList(Object.values(permsRes.data).flat());
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load RBAC data', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, []);

  // ── Edit / Permission panel ────────────────────────────────────────────────
  const openEdit = (role: RoleWithPermissions) => {
    setEditRole(role);
    setSelectedPermIds(new Set(role.permission_ids));
    setShowEditModal(true);
  };

  const openView = (role: RoleWithPermissions) => {
    setViewRole(role);
    setShowViewModal(true);
  };

  const isEditSuperAdmin = editRole?.slug === 'super_admin' || editRole?.name === 'super_admin' || editRole?.name === 'Super Administrator';
  const isViewSuperAdmin = viewRole?.slug === 'super_admin' || viewRole?.name === 'super_admin';

  const handleTogglePermission = (permId: string) => {
    if (isEditSuperAdmin || !canManageRoles) return;
    setSelectedPermIds(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId); else next.add(permId);
      return next;
    });
  };

  const handleToggleModule = (modulePermissions: PermissionItem[]) => {
    if (isEditSuperAdmin || !canManageRoles) return;
    const allModuleIds = modulePermissions.map(p => p.id);
    const hasAll = allModuleIds.every(id => selectedPermIds.has(id));
    setSelectedPermIds(prev => {
      const next = new Set(prev);
      if (hasAll) allModuleIds.forEach(id => next.delete(id));
      else allModuleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const handleSavePermissions = async () => {
    if (!editRole || !canManageRoles) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await updateRolePermissions(editRole.id, Array.from(selectedPermIds));
      if (res.success) {
        setMessage({ text: `Permissions updated for "${editRole.display_name || editRole.name}"!`, type: 'success' });
        setShowEditModal(false);
        fetchData();
      } else {
        setMessage({ text: res.error || 'Failed to update permissions', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Error updating permissions', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (!canManageRoles) return;
    if (!confirm(`Are you sure you want to permanently delete the role "${roleName}"?`)) return;
    try {
      const res = await deleteCustomRole(roleId);
      if (res.success) {
        setMessage({ text: `Role "${roleName}" deleted`, type: 'success' });
        fetchData();
      } else {
        setMessage({ text: res.error || 'Failed to delete role', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Error deleting role', type: 'error' });
    }
  };

  // ── Add Role Modal dual-box ────────────────────────────────────────────────
  const availablePermissions = useMemo(() => allPermissionsList.filter(p => !modalChosenIds.has(p.id)), [allPermissionsList, modalChosenIds]);
  const filteredAvailable = useMemo(() => {
    if (!modalSearch.trim()) return availablePermissions;
    const q = modalSearch.toLowerCase();
    return availablePermissions.filter(p =>
      p.permission_name.toLowerCase().includes(q) ||
      p.permission_code.toLowerCase().includes(q) ||
      p.module.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }, [availablePermissions, modalSearch]);
  const chosenPermissions = useMemo(() => allPermissionsList.filter(p => modalChosenIds.has(p.id)), [allPermissionsList, modalChosenIds]);

  const handleMoveToChosen = () => {
    if (!modalSelectedAvailableId) return;
    setModalChosenIds(prev => new Set(prev).add(modalSelectedAvailableId));
    setModalSelectedAvailableId(null);
  };
  const handleMoveToAvailable = () => {
    if (!modalSelectedChosenId) return;
    setModalChosenIds(prev => { const n = new Set(prev); n.delete(modalSelectedChosenId); return n; });
    setModalSelectedChosenId(null);
  };
  const handleChooseAll = () => {
    setModalChosenIds(prev => { const n = new Set(prev); filteredAvailable.forEach(p => n.add(p.id)); return n; });
    setModalSelectedAvailableId(null);
  };
  const handleRemoveAll = () => { setModalChosenIds(new Set()); setModalSelectedChosenId(null); };

  const handleOpenAddRole = () => {
    setModalRoleName('');
    setModalRoleStatus(true);
    setModalSearch('');
    setModalChosenIds(new Set());
    setModalSelectedAvailableId(null);
    setModalSelectedChosenId(null);
    setShowAddRoleModal(true);
  };

  const handleSaveModalRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalRoleName.trim()) return;
    setCreatingRole(true);
    setMessage(null);
    try {
      const slug = modalRoleName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const res = await createCustomRole({
        name: slug,
        displayName: modalRoleName.trim(),
        description: `Custom role: ${modalRoleName.trim()}`,
        permissionIds: Array.from(modalChosenIds),
      });
      if (res.success) {
        setShowAddRoleModal(false);
        setMessage({ text: `Role "${modalRoleName.trim()}" created with ${modalChosenIds.size} permissions!`, type: 'success' });
        await fetchData();
      } else {
        alert(res.error || 'Failed to create role');
      }
    } catch (err: any) {
      alert(err.message || 'Error creating role');
    } finally {
      setCreatingRole(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading && roles.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-ztext-lighter">
          <RefreshCw className="animate-spin text-zred" size={24} />
          <span className="font-medium">Loading Roles...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ztext flex items-center gap-2">
            <KeyRound className="text-zred" size={28} />
            Roles &amp; Permissions
          </h1>
          <p className="text-sm text-ztext-lighter mt-1">
            Manage roles and assign permissions to control staff access.
          </p>
        </div>
        {canManageRoles && (
          <button
            onClick={handleOpenAddRole}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-zred text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition shadow-sm shrink-0"
          >
            <Plus size={18} />
            Add Role
          </button>
        )}
      </div>

      {/* Alert */}
      {message && (
        <div className={`p-4 rounded-xl text-sm flex items-center gap-3 ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-300'
            : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-800/40 dark:text-rose-300'
        }`}>
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Table Card */}
      <div className="bg-zcard border border-zborder rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zborder bg-zsurface/60">
                <th className="text-left text-xs font-bold text-ztext-lighter uppercase tracking-wider px-5 py-3.5 w-14">#</th>
                <th className="text-left text-xs font-bold text-ztext-lighter uppercase tracking-wider px-4 py-3.5">Role</th>
                <th className="text-left text-xs font-bold text-ztext-lighter uppercase tracking-wider px-4 py-3.5">Permissions</th>
                <th className="text-left text-xs font-bold text-ztext-lighter uppercase tracking-wider px-4 py-3.5">Type</th>
                <th className="text-left text-xs font-bold text-ztext-lighter uppercase tracking-wider px-4 py-3.5">Created By</th>
                <th className="text-center text-xs font-bold text-ztext-lighter uppercase tracking-wider px-4 py-3.5 w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zborder">
              {roles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-ztext-lighter text-sm">
                    No roles found.
                  </td>
                </tr>
              ) : (
                roles.map((role, index) => {
                  const isSys = role.is_system || ['student', 'delivery', 'super_admin'].includes(role.slug);
                  const isSuper = role.slug === 'super_admin' || role.name === 'super_admin';
                  return (
                    <tr key={role.id} className="hover:bg-zsurface/40 transition-colors">
                      {/* # */}
                      <td className="px-5 py-4 text-xs text-ztext-lighter font-mono">
                        {String(index + 1).padStart(2, '0')}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-zred/10 flex items-center justify-center shrink-0">
                            <Shield size={15} className="text-zred" />
                          </div>
                          <div>
                            <div className="font-semibold text-ztext text-sm">
                              {role.display_name || role.name}
                            </div>
                            {role.description && (
                              <div className="text-xs text-ztext-lighter mt-0.5 truncate max-w-[200px]">
                                {role.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Permission count */}
                      <td className="px-4 py-4">
                        {isSuper ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-lg">
                            <Lock size={11} /> Full Access (*)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded-lg">
                            {role.permission_count || 0} permissions
                          </span>
                        )}
                      </td>

                      {/* Type badge */}
                      <td className="px-4 py-4">
                        {isSys ? (
                          <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-600">
                            System
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                            Custom
                          </span>
                        )}
                      </td>

                      {/* Created By */}
                      <td className="px-4 py-4 text-xs text-ztext-lighter">
                        {isSys ? (
                          <span className="flex items-center gap-1">
                            <Lock size={11} /> System
                          </span>
                        ) : (
                          <span>Super Admin</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View */}
                          <button
                            onClick={() => openView(role)}
                            title="View Permissions"
                            className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition"
                          >
                            <Eye size={16} />
                          </button>

                          {/* Edit */}
                          {canManageRoles && (
                            <button
                              onClick={() => openEdit(role)}
                              title="Edit Permissions"
                              className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition"
                            >
                              <Pencil size={16} />
                            </button>
                          )}

                          {/* Delete — only for custom roles */}
                          {!isSys && canManageRoles ? (
                            <button
                              onClick={() => handleDeleteRole(role.id, role.display_name || role.name)}
                              title="Delete Role"
                              className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : (
                            <span className="p-2 opacity-25 cursor-not-allowed">
                              <Trash2 size={16} className="text-ztext-lighter" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {roles.length > 0 && (
          <div className="px-5 py-3 border-t border-zborder text-xs text-ztext-lighter">
            Total {roles.length} roles &nbsp;·&nbsp; {roles.filter(r => !r.is_system).length} custom &nbsp;·&nbsp; {roles.filter(r => r.is_system).length} system
          </div>
        )}
      </div>

      {/* ── VIEW Modal (read-only) ─────────────────────────────────────────── */}
      {showViewModal && viewRole && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zborder">
              <div>
                <h3 className="text-lg font-bold text-ztext flex items-center gap-2">
                  <Eye size={18} className="text-blue-500" />
                  {viewRole.display_name || viewRole.name}
                </h3>
                <p className="text-xs text-ztext-lighter mt-0.5">{viewRole.description}</p>
              </div>
              <button onClick={() => setShowViewModal(false)} className="p-1.5 rounded-lg hover:bg-zgray text-ztext-lighter hover:text-ztext transition">
                <X size={20} />
              </button>
            </div>

            {isViewSuperAdmin ? (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
                <Info size={18} className="shrink-0 text-amber-600" />
                <span>Super Admin bypasses all permission checks with full wildcard access (<code>*</code>).</span>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(permissionsByModule).map(([moduleName, perms]) => {
                  const assigned = perms.filter(p => viewRole.permission_ids.includes(p.id));
                  if (assigned.length === 0) return null;
                  return (
                    <div key={moduleName} className="border border-zborder rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3 font-bold text-sm text-ztext">
                        <Shield size={14} className="text-zred" /> {moduleName} Module
                        <span className="ml-auto text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-lg">{assigned.length} / {perms.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {assigned.map(p => (
                          <span key={p.id} className="text-[11px] font-mono px-2 py-1 bg-zred/5 border border-zred/20 text-zred rounded-lg">
                            {p.permission_code}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {viewRole.permission_count === 0 && (
                  <div className="text-center py-10 text-ztext-lighter text-sm">No permissions assigned.</div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-zborder">
              <button onClick={() => setShowViewModal(false)} className="px-5 py-2 bg-zsurface border border-zborder rounded-xl text-sm font-medium hover:bg-zgray transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT Modal ────────────────────────────────────────────────────── */}
      {showEditModal && editRole && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zborder">
              <div>
                <h3 className="text-lg font-bold text-ztext flex items-center gap-2">
                  <Pencil size={17} className="text-emerald-500" />
                  Edit: {editRole.display_name || editRole.name}
                </h3>
                <p className="text-xs text-ztext-lighter mt-0.5">
                  {isEditSuperAdmin ? 'Super Admin — all permissions granted by default' : `${selectedPermIds.size} permissions selected`}
                </p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1.5 rounded-lg hover:bg-zgray text-ztext-lighter hover:text-ztext transition">
                <X size={20} />
              </button>
            </div>

            {isEditSuperAdmin && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
                <Info size={18} className="shrink-0 text-amber-600" />
                <span>Super Admin bypasses all permission checks. Cannot be modified.</span>
              </div>
            )}

            <div className="space-y-4">
              {Object.entries(permissionsByModule).map(([moduleName, perms]) => {
                const allSelected = perms.every(p => selectedPermIds.has(p.id));
                return (
                  <div key={moduleName} className="border border-zborder rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm text-ztext capitalize flex items-center gap-2">
                        <Shield size={15} className="text-zred" /> {moduleName} Module
                      </div>
                      {!isEditSuperAdmin && canManageRoles && (
                        <button type="button" onClick={() => handleToggleModule(perms)} className="text-xs font-medium text-zred hover:underline">
                          {allSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {perms.map(p => {
                        const isChecked = isEditSuperAdmin || selectedPermIds.has(p.id);
                        return (
                          <label
                            key={p.id}
                            className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                              isChecked ? 'bg-zred/5 border-zred/30' : 'bg-zgray/30 border-transparent hover:border-zborder'
                            } ${isEditSuperAdmin || !canManageRoles ? 'cursor-default' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isEditSuperAdmin || !canManageRoles}
                              onChange={() => handleTogglePermission(p.id)}
                              className="mt-0.5 rounded border-zborder text-zred focus:ring-zred h-4 w-4"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-ztext">{p.permission_name}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zsurface rounded text-zred font-bold">{p.permission_code}</span>
                              </div>
                              {p.description && (
                                <div className="text-[11px] text-ztext-lighter leading-snug mt-0.5">{p.description}</div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zborder">
              <button onClick={() => setShowEditModal(false)} className="button-z button-z-secondary text-xs px-5 h-10">
                Cancel
              </button>
              {!isEditSuperAdmin && canManageRoles && (
                <button
                  onClick={handleSavePermissions}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 h-10 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
                >
                  {saving ? <RefreshCw className="animate-spin" size={15} /> : <Save size={15} />}
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD ROLE Modal (Dual-Box Shuttle) ─────────────────────────────── */}
      {showAddRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl space-y-5 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zborder">
              <h3 className="text-xl font-bold text-ztext">Add Role</h3>
              <button type="button" onClick={() => setShowAddRoleModal(false)} className="p-1 rounded-lg hover:bg-zgray text-ztext-lighter hover:text-ztext transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveModalRole} className="space-y-5">
              {/* Role Name */}
              <div>
                <label className="block text-xs font-bold text-ztext mb-1.5">Role Name <span className="text-zred">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kitchen Specialist, Cashier, Inventory Manager"
                  value={modalRoleName}
                  onChange={(e) => setModalRoleName(e.target.value)}
                  className="input-z w-full text-sm font-medium"
                />
              </div>

              {/* Store (read-only) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-ztext">Assigned Store</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-amber-500/10 text-amber-600 rounded flex items-center gap-1">
                    <Lock size={10} /> Read-Only
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-zsurface border border-zborder text-sm">
                  <div className="flex items-center gap-2 font-medium text-ztext">
                    <Store size={18} className="text-zred" />
                    <span>Dilip Da - Main Central Store (Assam)</span>
                  </div>
                  <span className="text-xs font-semibold text-ztext-lighter flex items-center gap-1"><Lock size={12} /> Locked</span>
                </div>
              </div>

              {/* Dual-Box Shuttle */}
              <div>
                <label className="block text-xs font-bold text-ztext mb-2">User Permissions <span className="text-zred">*</span></label>
                <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
                  {/* Left: Available */}
                  <div className="md:col-span-5 border border-zborder rounded-2xl p-3 bg-zsurface/50 flex flex-col h-[340px]">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-zborder">
                      <span className="text-xs font-bold text-ztext">Available Permissions</span>
                      <span className="text-xs font-bold px-2 py-0.5 bg-orange-500 text-white rounded-full">{availablePermissions.length}</span>
                    </div>
                    <div className="relative mb-2 shrink-0">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ztext-lighter" />
                      <input type="text" placeholder="Search permissions..." value={modalSearch} onChange={(e) => setModalSearch(e.target.value)} className="input-z w-full pl-8 py-1.5 text-xs rounded-xl" />
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                      {filteredAvailable.length === 0 ? (
                        <div className="text-center py-8 text-xs text-ztext-lighter">No available permissions</div>
                      ) : (
                        filteredAvailable.map(p => {
                          const isSel = modalSelectedAvailableId === p.id;
                          return (
                            <div
                              key={p.id}
                              onClick={() => setModalSelectedAvailableId(p.id)}
                              onDoubleClick={() => { setModalChosenIds(prev => new Set(prev).add(p.id)); setModalSelectedAvailableId(null); }}
                              className={`p-2 rounded-xl text-xs cursor-pointer transition border ${isSel ? 'bg-zred/10 border-zred font-semibold text-zred' : 'bg-zcard border-zborder hover:border-ztext-lighter text-ztext'}`}
                            >
                              <div className="truncate font-medium">{p.permission_name}</div>
                              <div className="text-[10px] text-ztext-lighter font-mono mt-0.5">Code: <span className="text-zred font-semibold">{p.permission_code}</span></div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="pt-2 mt-2 border-t border-zborder">
                      <button type="button" onClick={handleChooseAll} className="text-xs font-bold text-orange-500 hover:text-orange-600 transition">Choose All →</button>
                    </div>
                  </div>

                  {/* Middle arrows */}
                  <div className="md:col-span-1 flex md:flex-col items-center justify-center gap-2 py-1">
                    <button type="button" onClick={handleMoveToChosen} disabled={!modalSelectedAvailableId} title="Move to Chosen" className="p-2.5 rounded-xl bg-zsurface border border-zborder text-ztext hover:bg-zred hover:text-white disabled:opacity-40 transition">
                      <ArrowRight size={16} />
                    </button>
                    <button type="button" onClick={handleMoveToAvailable} disabled={!modalSelectedChosenId} title="Move back" className="p-2.5 rounded-xl bg-zsurface border border-zborder text-ztext hover:bg-zred hover:text-white disabled:opacity-40 transition">
                      <ArrowLeft size={16} />
                    </button>
                  </div>

                  {/* Right: Chosen */}
                  <div className="md:col-span-5 border border-zborder rounded-2xl p-3 bg-zsurface/50 flex flex-col h-[340px]">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-zborder">
                      <span className="text-xs font-bold text-ztext">Chosen Permissions</span>
                      <span className="text-xs font-bold px-2 py-0.5 bg-orange-600 text-white rounded-full">{modalChosenIds.size}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                      {chosenPermissions.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-xs text-ztext-lighter italic">No permissions chosen yet</div>
                      ) : (
                        chosenPermissions.map(p => {
                          const isSel = modalSelectedChosenId === p.id;
                          return (
                            <div
                              key={p.id}
                              onClick={() => setModalSelectedChosenId(p.id)}
                              onDoubleClick={() => { setModalChosenIds(prev => { const n = new Set(prev); n.delete(p.id); return n; }); setModalSelectedChosenId(null); }}
                              className={`p-2 rounded-xl text-xs cursor-pointer transition border ${isSel ? 'bg-orange-500/10 border-orange-500 font-semibold text-orange-500' : 'bg-zcard border-zborder hover:border-ztext-lighter text-ztext'}`}
                            >
                              <div className="truncate font-medium">{p.permission_name}</div>
                              <div className="text-[10px] text-ztext-lighter font-mono mt-0.5">Code: <span className="text-orange-500 font-semibold">{p.permission_code}</span></div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="pt-2 mt-2 border-t border-zborder">
                      <button type="button" onClick={handleRemoveAll} disabled={modalChosenIds.size === 0} className="text-xs font-bold text-zred hover:text-red-600 disabled:opacity-40 transition">— Remove All</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-zsurface border border-zborder">
                <div>
                  <div className="text-xs font-bold text-ztext">Role Status</div>
                  <div className="text-[11px] text-ztext-lighter">Allow staff members to be assigned to this role</div>
                </div>
                <button type="button" onClick={() => setModalRoleStatus(!modalRoleStatus)} className="flex items-center gap-2 cursor-pointer">
                  <span className={`text-xs font-bold ${modalRoleStatus ? 'text-emerald-500' : 'text-ztext-lighter'}`}>{modalRoleStatus ? 'Active' : 'Inactive'}</span>
                  {modalRoleStatus ? <ToggleRight size={28} className="text-orange-500" /> : <ToggleLeft size={28} className="text-ztext-lighter" />}
                </button>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zborder">
                <button type="button" onClick={() => setShowAddRoleModal(false)} className="button-z button-z-secondary text-xs px-5 h-10">Cancel</button>
                <button
                  type="submit"
                  disabled={creatingRole || !modalRoleName.trim()}
                  className="px-6 h-10 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {creatingRole ? <><RefreshCw className="animate-spin" size={15} /> Saving...</> : <><Check size={16} /> Save Role</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
