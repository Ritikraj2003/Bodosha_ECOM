'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, Loader2, Save, Pencil, Trash2, Plus,
  ChevronUp, ChevronDown, Upload, ImageIcon, Film,
  FileImage, CheckCircle, AlertTriangle, Link as LinkIcon,
} from 'lucide-react';
import { PageHeader, ToastContainer, useToast, LoadingSkeleton } from '@/components/ui/data-table';
import { getSystemSettings, updateSystemSetting } from '@/features/admin/actions';
import { authService } from '@/features/auth/services/auth-service';
import type { SystemSetting } from '@/features/admin/types';

interface BumperOfferItem {
  type: 'image' | 'video';
  url: string;
  alt?: string;
  order: number;
}

const inputClass = 'w-full bg-zgray border border-zborder rounded-xl px-3 py-2 text-sm text-ztext focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred transition-all';

const ENABLED_KEY = 'bumper_offers_enabled';
const OFFERS_KEY = 'bumper_offers';

export default function AdminBumperOffersPage() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [enabledValue, setEnabledValue] = useState('true');
  const [originalEnabledValue, setOriginalEnabledValue] = useState('true');
  const [bumperOffers, setBumperOffers] = useState<BumperOfferItem[]>([]);
  const [originalBumperOffers, setOriginalBumperOffers] = useState<BumperOfferItem[]>([]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [quickUploading, setQuickUploading] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const quickFileInputRef = useRef<HTMLInputElement | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  const fetchSettings = useCallback(async () => {
    const res = await getSystemSettings();
    if (res.success && res.data) {
      const data = res.data as SystemSetting[];
      setSettings(data);
      const enabledRow = data.find((s) => s.key === ENABLED_KEY);
      const offersRow = data.find((s) => s.key === OFFERS_KEY);
      const enabledVal = enabledRow?.value ?? 'true';
      let offers: BumperOfferItem[] = [];
      try {
        offers = JSON.parse(offersRow?.value ?? '[]');
      } catch {
        offers = [];
      }
      offers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setEnabledValue(enabledVal);
      setOriginalEnabledValue(enabledVal);
      setBumperOffers(offers);
      setOriginalBumperOffers([...offers]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
     
    fetchSettings();
  }, [fetchSettings]);

  const isDirty = bumperOffers.length !== originalBumperOffers.length
    || JSON.stringify(bumperOffers) !== JSON.stringify(originalBumperOffers)
    || enabledValue !== originalEnabledValue;

  const handleSave = async () => {
    const session = await authService.getSession();
    if (!session.user) {
      addToast('Session expired — please sign in again', 'error');
      window.location.href = '/auth/login';
      return;
    }
    if (!isDirty) {
      addToast('No changes to save', 'info');
      return;
    }
    for (let i = 0; i < bumperOffers.length; i++) {
      if (!bumperOffers[i].url.trim()) {
        addToast(`Item #${i + 1} URL is required. Please upload a file or enter a valid URL.`, 'error');
        return;
      }
    }
    setSaving(true);
    const errors: string[] = [];

    const enabledRow = settings.find((s) => s.key === ENABLED_KEY);
    if (enabledRow && enabledValue !== originalEnabledValue) {
      const res = await updateSystemSetting(enabledRow.id, enabledValue);
      if (!res.success) errors.push(`Enable toggle: ${res.error ?? 'save failed'}`);
    }

    const offersRow = settings.find((s) => s.key === OFFERS_KEY);
    if (offersRow && JSON.stringify(bumperOffers) !== JSON.stringify(originalBumperOffers)) {
      const res = await updateSystemSetting(offersRow.id, JSON.stringify(bumperOffers));
      if (!res.success) errors.push(res.error ?? 'save failed');
    }

    setSaving(false);
    if (errors.length) {
      addToast(errors.join('; '), 'error');
      return;
    }
    addToast('Bumper offers saved successfully', 'success');
    setEditing(false);
    fetchSettings();
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= bumperOffers.length) return;
    setEditing(true);
    const next = [...bumperOffers];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    next.forEach((item, i) => { item.order = i; });
    setBumperOffers(next);
  };

  const handleDelete = (index: number) => {
    setEditing(true);
    const next = bumperOffers.filter((_, i) => i !== index);
    next.forEach((item, i) => { item.order = i; });
    setBumperOffers(next);
  };

  const handleUrlChange = (index: number, url: string) => {
    setEditing(true);
    const next = [...bumperOffers];
    next[index] = { ...next[index], url };
    setBumperOffers(next);
  };

  const handleAltChange = (index: number, alt: string) => {
    setEditing(true);
    const next = [...bumperOffers];
    next[index] = { ...next[index], alt };
    setBumperOffers(next);
  };

  const handleTypeChange = (index: number, type: 'image' | 'video') => {
    setEditing(true);
    const next = [...bumperOffers];
    next[index] = { ...next[index], type };
    setBumperOffers(next);
  };

  const handleAdd = () => {
    setEditing(true);
    setBumperOffers((prev) => [
      ...prev,
      { type: 'image', url: '', alt: '', order: prev.length },
    ]);
  };

  const detectTypeFromUrl = (url: string): 'image' | 'video' | null => {
    const clean = url.split('?')[0].toLowerCase();
    if (/\.(mp4|webm|mov|m4v|ogv|ogg|mkv)$/.test(clean)) return 'video';
    if (/\.(jpe?g|png|webp|gif|svg|avif|jfif|bmp|ico)$/.test(clean)) return 'image';
    return null;
  };

  const handleUpload = async (file: File, index: number) => {
    setEditing(true);
    setUploadingIndex(index);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'bumper');
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.url) {
        const detectedType: 'image' | 'video' = data.type === 'video' ? 'video' : 'image';
        setBumperOffers((prev) => {
          const next = [...prev];
          if (next[index]) {
            next[index] = {
              ...next[index],
              url: data.url,
              type: detectedType,
              alt: next[index].alt?.trim() ? next[index].alt : file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            };
          }
          return next;
        });
        addToast(`Uploaded ${file.name}. Click "Save Changes" to apply.`, 'success');
      } else {
        addToast(data.error || 'Failed to upload media file', 'error');
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Network error during upload', 'error');
    } finally {
      setUploadingIndex(null);
    }
  };

  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setEditing(true);
    setQuickUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'bumper');
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.url) {
          const detectedType: 'image' | 'video' = data.type === 'video' ? 'video' : 'image';
          setBumperOffers((prev) => [
            ...prev,
            {
              type: detectedType,
              url: data.url,
              alt: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
              order: prev.length,
            },
          ]);
          addToast(`Uploaded ${file.name}`, 'success');
        } else {
          addToast(data.error || `Failed to upload ${file.name}`, 'error');
        }
      } catch {
        addToast(`Failed to upload ${file.name}`, 'error');
      }
    }
    setQuickUploading(false);
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file, index);
    e.target.value = '';
  };

  const triggerFileInput = (index: number) => {
    setEditing(true);
    const input = document.getElementById(`bumper-upload-${index}`) as HTMLInputElement | null;
    input?.click();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file, index);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="h-8 w-48 bg-zgray rounded-lg animate-pulse mb-6" />
        <LoadingSkeleton rows={4} cols={1} />
      </div>
    );
  }

  const enabled = enabledValue === 'true';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bumper Offers"
        description="Upload images and videos shown in the home screen hero slider. Videos play fully before advancing."
      >
        {editing ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="button-z button-z-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isDirty ? 'Save Changes' : 'Saved'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); fetchSettings(); }}
              disabled={saving}
              className="button-z button-z-ghost flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="button-z button-z-primary flex items-center gap-2 text-sm px-4 py-2"
          >
            <Pencil size={16} />
            Edit Offers
          </button>
        )}
        <button
          onClick={() => { setLoading(true); fetchSettings(); }}
          aria-label="Refresh bumper offers"
          className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </button>
      </PageHeader>

      <div className="bg-zcard rounded-2xl p-6 border border-zborder shadow-sm">
        {/* Enable/disable toggle */}
        <div className="flex items-center justify-between pb-5 border-b border-zborder mb-6">
          <div>
            <h2 className="text-sm font-semibold text-ztext">Show on Home Screen</h2>
            <p className="text-xs text-ztext-lighter mt-0.5">When off, the default promo banner is shown instead.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={saving}
            onClick={() => {
              setEditing(true);
              setEnabledValue(enabled ? 'false' : 'true');
            }}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-60 ${enabled ? 'bg-zred' : 'bg-zsurface border border-zborder'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {/* Action Header for quick uploads */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ztext">Slider Items</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zsurface border border-zborder text-ztext-lighter">
              {bumperOffers.length} {bumperOffers.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={quickFileInputRef}
              accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.avif,.mp4,.webm,.mov,image/*,video/*"
              multiple
              onChange={handleQuickUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => quickFileInputRef.current?.click()}
              disabled={saving || quickUploading}
              className="button-z button-z-secondary flex items-center gap-2 text-xs px-3 py-2 cursor-pointer"
            >
              {quickUploading ? <Loader2 size={14} className="animate-spin text-zred" /> : <Upload size={14} />}
              {quickUploading ? 'Uploading Media...' : 'Upload from Computer'}
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="button-z button-z-outline flex items-center gap-2 text-xs px-3 py-2 cursor-pointer"
            >
              <Plus size={14} />
              Add URL Item
            </button>
          </div>
        </div>

        {!enabled ? (
          <div className="p-8 text-center bg-zsurface/50 border border-dashed border-zborder rounded-2xl">
            <AlertTriangle className="mx-auto text-amber-500 mb-2" size={24} />
            <p className="text-sm font-medium text-ztext">Bumper offers are currently hidden</p>
            <p className="text-xs text-ztext-lighter mt-1">Enable the switch above to activate the slider on the home screen.</p>
          </div>
        ) : bumperOffers.length === 0 ? (
          <div className="text-center py-12 px-4 border-2 border-dashed border-zborder rounded-2xl bg-zsurface/30">
            <div className="w-12 h-12 rounded-full bg-zred/10 text-zred flex items-center justify-center mx-auto mb-3">
              <FileImage size={24} />
            </div>
            <h3 className="text-sm font-semibold text-ztext">No Bumper Offers Added</h3>
            <p className="text-xs text-ztext-lighter max-w-md mx-auto mt-1 mb-5">
              Upload local banners, promotional posters, or video ads to display in the main carousel on dilipda.in.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => quickFileInputRef.current?.click()}
                disabled={saving || quickUploading}
                className="button-z button-z-primary flex items-center gap-2 text-sm px-4 py-2 cursor-pointer"
              >
                {quickUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Upload First File
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                className="button-z button-z-ghost flex items-center gap-2 text-sm px-4 py-2"
              >
                <Plus size={16} />
                Add URL Manually
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {bumperOffers.map((item, index) => {
              const isUploadingThis = uploadingIndex === index;
              const isDragOver = dragOverIndex === index;

              return (
                <div
                  key={index}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`bg-zsurface rounded-2xl p-5 border transition-all flex flex-col lg:flex-row gap-5 items-start lg:items-center relative ${
                    isDragOver ? 'border-zred ring-2 ring-zred/20 bg-zred/5' : 'border-zborder hover:border-zborder/80'
                  }`}
                >
                  {/* Reorder and index indicator */}
                  <div className="flex lg:flex-col items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleReorder(index, index - 1)}
                      disabled={index === 0 || saving}
                      className="p-1.5 rounded-lg hover:bg-zgray text-ztext-lighter disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="Move up"
                      title="Move up"
                    >
                      <ChevronUp size={18} />
                    </button>
                    <span className="text-xs font-bold text-ztext-lighter px-2 py-1 bg-zcard rounded-md border border-zborder">
                      #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleReorder(index, index + 1)}
                      disabled={index >= bumperOffers.length - 1 || saving}
                      className="p-1.5 rounded-lg hover:bg-zgray text-ztext-lighter disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="Move down"
                      title="Move down"
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>

                  {/* Main configuration inputs */}
                  <div className="flex-1 w-full flex flex-col gap-3 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-ztext-lighter">Media Type:</span>
                        <div className="flex rounded-lg bg-zgray p-0.5 border border-zborder">
                          <button
                            type="button"
                            onClick={() => handleTypeChange(index, 'image')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                              item.type === 'image' ? 'bg-zcard text-ztext shadow-sm' : 'text-ztext-lighter hover:text-ztext'
                            }`}
                          >
                            <ImageIcon size={12} /> Image
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTypeChange(index, 'video')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                              item.type === 'video' ? 'bg-zcard text-ztext shadow-sm' : 'text-ztext-lighter hover:text-ztext'
                            }`}
                          >
                            <Film size={12} /> Video
                          </button>
                        </div>
                      </div>

                      {item.url && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                          <CheckCircle size={12} /> Media ready
                        </span>
                      )}
                    </div>

                    {/* File Upload / URL Bar */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ztext-lighter">
                          <LinkIcon size={14} />
                        </div>
                        <input
                          type="text"
                          placeholder="https://... or /uploads/bumper-image.jpg"
                          value={item.url}
                          onChange={(e) => {
                            handleUrlChange(index, e.target.value);
                            const detected = detectTypeFromUrl(e.target.value);
                            if (detected && detected !== item.type) handleTypeChange(index, detected);
                          }}
                          className={`${inputClass} pl-9`}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => triggerFileInput(index)}
                        disabled={saving || isUploadingThis}
                        className="button-z button-z-secondary px-4 py-2 flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-sm"
                        aria-label="Upload local file"
                      >
                        {isUploadingThis ? <Loader2 size={16} className="animate-spin text-zred" /> : <Upload size={16} />}
                        <span>{isUploadingThis ? 'Uploading...' : 'Upload File'}</span>
                      </button>

                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.avif,.jfif,.bmp,.mp4,.webm,.mov,image/*,video/*"
                        onChange={(e) => handleFileSelect(e, index)}
                        className="hidden"
                        id={`bumper-upload-${index}`}
                      />
                    </div>

                    {/* Alt text field */}
                    <input
                      type="text"
                      placeholder="Alt text / Description (e.g., '50% off on all Biryani items')"
                      value={item.alt ?? ''}
                      onChange={(e) => handleAltChange(index, e.target.value)}
                      className={inputClass}
                    />

                    {/* Media Preview Box */}
                    {item.url && (
                      <div className="mt-1 flex items-center gap-3 bg-zgray/60 p-2.5 rounded-xl border border-zborder">
                        <div className="relative h-16 w-28 rounded-lg overflow-hidden bg-black/10 border border-zborder shrink-0 flex items-center justify-center">
                          {item.type === 'image' ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={item.url}
                              alt={item.alt || 'Bumper preview'}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <video
                              src={item.url}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-ztext truncate">{item.url}</p>
                          <p className="text-[11px] text-ztext-lighter mt-0.5">
                            {item.type === 'image' ? 'Image banner (auto-slides every 5s)' : 'Video ad (plays fully before sliding)'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Delete Item Button */}
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    disabled={saving}
                    className="p-2 rounded-xl text-ztext-lighter hover:text-red-500 hover:bg-red-500/10 transition-colors self-end lg:self-center"
                    aria-label={`Delete item ${index + 1}`}
                    title="Remove item"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => quickFileInputRef.current?.click()}
                disabled={saving || quickUploading}
                className="button-z button-z-secondary flex items-center gap-2 px-4 py-2 cursor-pointer"
              >
                <Upload size={16} />
                Upload More Files
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                className="button-z button-z-outline flex items-center gap-2 px-4 py-2 cursor-pointer"
              >
                <Plus size={16} />
                Add URL Item
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3 text-xs text-ztext-lighter bg-zcard/60 border border-zborder/60 rounded-2xl p-4">
        <ImageIcon size={16} className="shrink-0 mt-0.5 text-ztext-light" />
        <div className="space-y-1">
          <p className="font-medium text-ztext">Upload Tips & Supported Formats:</p>
          <p>
            • Images (JPG, PNG, WEBP, GIF, AVIF, SVG) are automatically stored and served from <code className="bg-zgray px-1.5 py-0.5 rounded text-ztext">public/uploads</code> and Supabase CDN.
          </p>
          <p>
            • Videos (MP4, WebM, MOV up to 50MB) are fully supported. They will play without sound until completion before transitioning to the next slide.
          </p>
          <p>
            • You can drag and drop media files directly onto any item card or click &quot;Upload from Computer&quot; to batch upload multiple files at once.
          </p>
        </div>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
