'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, FolderTree, Edit3, Trash2, Eye, EyeOff, Save, X, Search, CheckCircle, AlertCircle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/features/products/actions';
import type { Category } from '@/features/products/types';
import { Skeleton, EmptyState } from '@/components/ui';

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const loadCategories = useCallback(async () => {
    const res = await getCategories(true);
    if (res.success && res.data) {
      setCategories(res.data);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await loadCategories();
      if (!mounted) return;
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [loadCategories]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    setName('');
    setDescription('');
    setDisplayOrder(0);
    setIsActive(true);
    setError('');
  }, []);

  const openCreateForm = () => {
    resetForm();
    setDisplayOrder((categories.length + 1) * 10);
    setShowForm(true);
  };

  const openEditForm = (cat: Category) => {
    setError('');
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description ?? '');
    setDisplayOrder(cat.display_order ?? 0);
    setIsActive(cat.is_active ?? true);
    setShowForm(true);
  };

  const handleSave = async () => {
    setError('');
    if (!name.trim()) {
      setError('Category name is required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const res = await updateCategory(editing.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          display_order: displayOrder,
          is_active: isActive,
        });
        if (res.success) {
          showToast(`Category "${name.trim()}" updated successfully!`);
        } else {
          setError(res.error || 'Failed to update category');
        }
      } else {
        const res = await createCategory({
          name: name.trim(),
          description: description.trim() || undefined,
          display_order: displayOrder,
          is_active: isActive,
        });
        if (res.success) {
          showToast(`Category "${name.trim()}" created successfully!`);
        } else {
          setError(res.error || 'Failed to create category');
        }
      }
      resetForm();
      await loadCategories();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Are you sure you want to delete category "${cat.name}"? Products in this category will become uncategorized.`)) return;
    const res = await deleteCategory(cat.id);
    if (res.success) {
      showToast(`Category "${cat.name}" deleted.`);
      loadCategories();
    } else {
      alert(res.error || 'Failed to delete category');
    }
  };

  const handleToggleActive = async (cat: Category) => {
    const res = await updateCategory(cat.id, { is_active: !cat.is_active });
    if (res.success) {
      showToast(`Category status updated`);
      loadCategories();
    }
  };

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(search.toLowerCase()))
  );

  const totalRecords = filteredCategories.length;
  const totalPages = Math.ceil(totalRecords / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalRecords);
  const paginatedCategories = filteredCategories.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-zcard rounded animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast message */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500/90 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-fade-up">
          <CheckCircle size={18} />
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ztext">Create & Manage Categories</h1>
          <p className="text-xs sm:text-sm text-ztext-light mt-0.5">
            Organize menu categories for your store ({categories.length} total categories)
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-zred text-white text-sm font-semibold rounded-xl hover:bg-zred-dark transition-all shadow-z shrink-0"
        >
          <Plus size={18} /> Add New Category
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ztext-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          placeholder="Search categories..."
          className="input-z pl-10 text-sm"
        />
      </div>

      {/* Form Drawer / Modal */}
      {showForm && (
        <div className="bg-zcard rounded-2xl border border-zborder p-6 shadow-z-modal animate-fade-up">
          <div className="flex items-center justify-between mb-5 border-b border-zborder pb-3">
            <h2 className="text-base font-bold text-ztext flex items-center gap-2">
              <FolderTree size={20} className="text-zred" />
              {editing ? `Edit Category: ${editing.name}` : 'Create New Category'}
            </h2>
            <button onClick={resetForm} className="p-1 rounded-lg hover:bg-zgray text-ztext-lighter">
              <X size={20} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-ztext-lighter block mb-1">
                Category Name <span className="text-zred">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Starters, Main Course, Biryani"
                className="input-z"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-ztext-lighter block mb-1">Display Order</label>
              <input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                placeholder="e.g. 10"
                className="input-z"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-ztext-lighter block mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description for customers (optional)"
                className="input-z"
              />
            </div>

            <div className="sm:col-span-2 flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs font-medium text-ztext cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-zborder text-zred focus:ring-zred accent-zred"
                />
                Active (Visible to customers on the menu)
              </label>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-6 pt-4 border-t border-zborder justify-end">
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-zgray text-ztext-light border border-zborder text-sm font-medium rounded-xl hover:bg-zcard transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-zred text-white text-sm font-semibold rounded-xl hover:bg-zred-dark transition-all disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Saving...' : editing ? 'Update Category' : 'Create Category'}
            </button>
          </div>
        </div>
      )}

      {/* Categories Table */}
      {filteredCategories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories found"
          description={search ? 'No categories match your search filter.' : 'Create your first category to get started.'}
        />
      ) : (
        <div className="bg-zcard rounded-2xl border border-zborder overflow-hidden shadow-z">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zgray/50 border-b border-zborder text-ztext-lighter text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Order</th>
                  <th className="px-5 py-3.5 font-semibold">Category Name</th>
                  <th className="px-5 py-3.5 font-semibold">Description</th>
                  <th className="px-5 py-3.5 font-semibold">Products</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zborder">
                {paginatedCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-zgray/40 transition-colors group">
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-ztext-lighter bg-zgray px-2.5 py-1 rounded-md border border-zborder">
                        #{cat.display_order ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-ztext text-sm group-hover:text-zred transition-colors">
                          {cat.name}
                        </span>
                        <span className="text-[11px] text-ztext-muted font-mono">
                          /{cat.slug}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs text-ztext-light max-w-sm line-clamp-1">
                        {cat.description || <span className="italic text-ztext-muted">No description</span>}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-ztext-light bg-zgray px-2.5 py-1 rounded-lg border border-zborder">
                        {cat.product_count ?? 0} {cat.product_count === 1 ? 'Product' : 'Products'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          cat.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zgray text-ztext-lighter border border-zborder'
                        }`}
                      >
                        {cat.is_active ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleActive(cat)}
                          title={cat.is_active ? 'Hide Category' : 'Show Category'}
                          className="p-2 rounded-lg hover:bg-zgray text-ztext-lighter hover:text-ztext transition-colors"
                        >
                          {cat.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                          onClick={() => openEditForm(cat)}
                          title="Edit Category"
                          className="p-2 rounded-lg hover:bg-zgray text-ztext-lighter hover:text-ztext transition-colors"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(cat)}
                          title="Delete Category"
                          className="p-2 rounded-lg hover:bg-red-500/10 text-ztext-lighter hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination & Total Count Footer */}
          <div className="px-5 py-3.5 bg-zgray/30 border-t border-zborder flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ztext-lighter">
            <div>
              Showing <span className="font-semibold text-ztext">{totalRecords > 0 ? startIndex + 1 : 0}</span> to{' '}
              <span className="font-semibold text-ztext">{endIndex}</span> of{' '}
              <span className="font-semibold text-ztext">{totalRecords}</span> categories
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-zcard border border-zborder rounded-lg hover:bg-zgray text-ztext transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <span className="px-2 font-medium text-ztext-light">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-zcard border border-zborder rounded-lg hover:bg-zgray text-ztext transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
