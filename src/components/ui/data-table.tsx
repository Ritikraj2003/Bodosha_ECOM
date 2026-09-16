'use client';

import { useState, useCallback, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export type ColumnRenderFn = (item: any) => React.ReactNode;  

export interface Column {
  key: string;
  header: string;
  render: ColumnRenderFn;
  sortable?: boolean;
  width?: string;
  hideOnMobile?: boolean;
  className?: string;
}

interface DataTableProps {
  columns: Column[];
   
  data: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onSort?: (key: string, order: 'asc' | 'desc') => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
   
  keyExtractor: (item: any) => string;
  emptyMessage?: string;
  onRowClick?: (item: Record<string, unknown>) => void;
  selectedIds?: string[];
  onSelectChange?: (ids: string[]) => void;
  onSelectAll?: (selected: boolean) => void;
  selectable?: boolean;
}

export function DataTable({
  columns, data, total, page, pageSize, totalPages, loading,
  onPageChange, onSort, sortBy, sortOrder, keyExtractor,
  emptyMessage = 'No data found', onRowClick, selectedIds = [],
  onSelectChange, onSelectAll, selectable = false,
}: DataTableProps) {
  const allSelected = useMemo(
    () => data.length > 0 && selectedIds.length === data.length,
    [data, selectedIds],
  );

  const handleSort = useCallback((key: string) => {
    if (!onSort) return;
    const newOrder = sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc';
    onSort(key, newOrder);
  }, [onSort, sortBy, sortOrder]);

  const handleSelectAll = useCallback(() => {
    if (onSelectAll) {
      onSelectAll(!allSelected);
    } else if (onSelectChange) {
      onSelectChange(allSelected ? [] : data.map(keyExtractor));
    }
  }, [allSelected, data, keyExtractor, onSelectAll, onSelectChange]);

  const handleSelect = useCallback((id: string) => {
    if (!onSelectChange) return;
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter((sid) => sid !== id)
      : [...selectedIds, id];
    onSelectChange(newIds);
  }, [selectedIds, onSelectChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-ztext-muted" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ztext-lighter">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zborder">
              {selectable && (
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-zred focus:ring-zred"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold text-ztext-lighter uppercase tracking-wider ${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.width ? col.width : ''} ${col.className ?? ''}`}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-ztext-light transition-colors"
                    >
                      {col.header}
                      {sortBy === col.key ? (
                        sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      ) : (
                        <ChevronsUpDown size={14} className="opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((item) => {
              const id = keyExtractor(item);
              const isSelected = selectedIds.includes(id);
              return (
                <tr
                  key={id}
                  onClick={() => onRowClick?.(item)}
                  className={`transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${isSelected ? 'bg-red-500/10' : 'hover:bg-zgray'}`}
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelect(id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 text-zred focus:ring-zred"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm text-ztext-light ${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.className ?? ''}`}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-zborder">
          <p className="text-xs text-ztext-lighter">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
              className="p-1.5 rounded-lg hover:bg-zgray disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                    page === pageNum ? 'bg-zred text-white' : 'text-ztext-light hover:bg-zgray'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="Next page"
              className="p-1.5 rounded-lg hover:bg-zgray disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }: {
  value: string; onChange: (value: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ztext-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 text-sm border border-zborder rounded-xl focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred bg-zcard placeholder-gray-400 transition-all"
      />
    </div>
  );
}

export function StatusFilter({ value, onChange, options }: {
  value: string; onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3.5 py-2 text-sm border border-zborder rounded-xl focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred bg-zcard text-ztext cursor-pointer transition-all"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-zcard text-ztext py-1">
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useState(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  });
  return debounced;
}

export function PageHeader({ title, description, children }: {
  title: string; description?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-ztext">{title}</h1>
        {description && <p className="text-sm text-ztext-lighter mt-0.5">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', variant = 'danger' }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmLabel?: string; variant?: 'danger' | 'primary';
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-zcard rounded-2xl p-6 max-w-sm w-full shadow-z-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-ztext">{title}</h3>
        <p className="text-sm text-ztext-light mt-2">{message}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-ztext-light bg-zgray rounded-xl hover:bg-zsurface transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors ${
              variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-zred hover:bg-zred-dark'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastContainer({ toasts, removeToast }: {
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>;
  removeToast: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all cursor-pointer ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' :
            toast.type === 'error' ? 'bg-red-600 text-white' :
            'bg-blue-600 text-white'
          }`}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

export function StatCard({ label, value, icon: Icon, color, trend }: {
  label: string; value: string; icon: React.ElementType; color?: string; trend?: string;
}) {
  return (
    <div className="bg-zcard rounded-xl border border-zborder p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-ztext-lighter uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color ? `${color}15` : 'rgba(239,68,68,0.1)' }}>
          <Icon size={15} style={{ color: color ?? '#EF4444' }} />
        </div>
      </div>
      <p className="text-xl font-bold text-ztext">{value}</p>
      {trend && <p className="text-[11px] text-ztext-lighter mt-0.5">{trend}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: React.ElementType; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 rounded-xl bg-zgray flex items-center justify-center mx-auto mb-4">
        <Icon size={28} className="text-ztext-muted" />
      </div>
      <p className="text-sm font-semibold text-ztext">{title}</p>
      <p className="text-xs text-ztext-lighter mt-1 max-w-xs mx-auto">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-10 bg-zgray rounded-lg animate-pulse flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DashboardCard({ title, children, className = '' }: {
  title?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-zcard rounded-xl border border-zborder p-5 ${className}`}>
      {title && <h3 className="text-sm font-semibold text-ztext mb-4">{title}</h3>}
      {children}
    </div>
  );
}
