'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import {
  Plus, FolderTree, Edit3, Trash2, Eye, EyeOff, Save, X,
} from 'lucide-react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/features/products/actions';
import type { Category } from '@/features/products/types';
import { Skeleton, EmptyState } from '@/components/ui';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCategories = useCallback(async () => {
    const res = await getCategories(true);
    if (res.success && res.data) setCategories(res.data);
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

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    setName('');
    setDescription('');
    setImage('');
    setImageFile(null);
    setImagePreview('');
    setError('');
  }, []);

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      let finalImageUrl: string | null = image.trim() || null;

      if (imageFile) {
        const uploadFd = new FormData();
        uploadFd.append('file', imageFile);
        uploadFd.append('category', 'category');
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: uploadFd,
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success || !uploadData.url) {
          setError(uploadData.error || 'Failed to upload category image');
          setSaving(false);
          return;
        }
        finalImageUrl = uploadData.url;
      }

      if (editing) {
        await updateCategory(editing.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          image: finalImageUrl,
        });
      } else {
        await createCategory({
          name: name.trim(),
          description: description.trim() || undefined,
          image: finalImageUrl,
        });
      }
      setSaving(false);
      resetForm();
      loadCategories();
    } catch {
      setError('An unexpected error occurred');
      setSaving(false);
    }
  };

  const handleDelete = async (category: Category) => {
    if (!confirm(`Delete "${category.name}"? Products in this category will become uncategorized.`)) return;
    await deleteCategory(category.id);
    loadCategories();
  };

  const handleToggleActive = async (category: Category) => {
    await updateCategory(category.id, { is_active: !category.is_active });
    loadCategories();
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-ztext">Categories</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-zred text-white text-sm font-medium rounded-xl hover:bg-zred-dark transition-colors">
          <Plus size={16} /> Add category
        </button>
      </div>

      {showForm && (
        <div className="bg-zcard rounded-xl border border-zborder p-5 mb-6 max-w-lg">
          <h2 className="text-sm font-semibold text-ztext mb-4">{editing ? 'Edit category' : 'New category'}</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ztext-lighter">Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-z mt-1" placeholder="e.g. Starters" />
            </div>
            <div>
              <label className="text-xs font-medium text-ztext-lighter">Description (optional)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="input-z mt-1" />
            </div>

            <div>
              <label className="text-xs font-medium text-ztext-lighter">Category Image</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                <div>
                  <span className="text-[11px] text-ztext-muted block mb-0.5">Upload File</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setImageFile(file);
                      if (file) setImagePreview(URL.createObjectURL(file));
                      else setImagePreview(image);
                    }}
                    className="input-z text-xs file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:bg-zred file:text-white cursor-pointer"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-ztext-muted block mb-0.5">Or Image URL</span>
                  <input
                    value={image}
                    onChange={(e) => {
                      setImage(e.target.value);
                      if (!imageFile) setImagePreview(e.target.value);
                    }}
                    className="input-z text-xs"
                    placeholder="https://..."
                  />
                </div>
              </div>

              {(imagePreview || image) && (
                <div className="mt-2 flex items-center justify-between gap-2 p-2 bg-zgray/50 rounded-lg border border-zborder">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-zcard border border-zborder overflow-hidden shrink-0 relative">
                      <Image
                        src={imagePreview || image || '/images/category-placeholder.jpg'}
                        alt="Preview"
                        fill
                        className="object-cover"
                        unoptimized={!!imageFile}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (!target.src.includes('category-placeholder.jpg')) {
                            target.src = '/images/category-placeholder.jpg';
                          }
                        }}
                      />
                    </div>
                    <span className="text-xs text-ztext-light truncate">
                      {imageFile ? imageFile.name : image}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setImage(''); setImageFile(null); setImagePreview(''); }}
                    className="text-ztext-muted hover:text-red-400 p-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 px-4 py-2 bg-zred text-white text-sm font-medium rounded-xl hover:bg-zred-dark transition-colors disabled:opacity-50">
                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={resetForm} className="inline-flex items-center gap-1 px-4 py-2 bg-zcard text-ztext-light border border-zborder text-sm font-medium rounded-xl hover:bg-zgray transition-colors">
                <X size={14} /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories yet" description="Create categories to organize your menu." />
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-zcard rounded-xl border border-zborder p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:shadow-z transition-shadow">
              <div className="w-11 h-11 rounded-xl bg-zgray border border-zborder overflow-hidden relative shrink-0">
                <Image
                  src={cat.image && cat.image.trim() ? cat.image : '/images/category-placeholder.jpg'}
                  alt={cat.name}
                  fill
                  sizes="44px"
                  className="object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.src.includes('category-placeholder.jpg')) {
                      target.src = '/images/category-placeholder.jpg';
                    }
                  }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium text-ztext text-sm">{cat.name}</h2>
                  {!cat.is_active && <span className="text-[10px] text-ztext-muted bg-zgray px-1.5 py-0.5 rounded">Hidden</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-ztext-lighter">
                  <span>{cat.product_count} products</span>
                  {cat.description && <span className="truncate">{cat.description}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleToggleActive(cat)} className="p-2 rounded-lg hover:bg-zgray text-ztext-muted hover:text-ztext-light transition-colors">
                  {cat.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={() => {
                    setEditing(cat);
                    setName(cat.name);
                    setDescription(cat.description ?? '');
                    setImage(cat.image ?? '');
                    setImageFile(null);
                    setImagePreview(cat.image ?? '');
                    setShowForm(true);
                  }}
                  className="p-2 rounded-lg hover:bg-zgray text-ztext-muted hover:text-ztext-light transition-colors"
                >
                  <Edit3 size={14} />
                </button>
                <button onClick={() => handleDelete(cat)} className="p-2 rounded-lg hover:bg-red-500/10 text-ztext-muted hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
