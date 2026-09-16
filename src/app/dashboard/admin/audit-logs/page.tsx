'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Eye } from 'lucide-react';
import { DataTable, SearchInput, PageHeader, ToastContainer, useToast } from '@/components/ui/data-table';
import ExportDropdown from '@/components/admin/ExportDropdown';
import { getAuditLogs } from '@/features/admin/actions';
import type { AuditEntry } from '@/features/admin/types';

const SETTING_LABELS: Record<string, string> = {
  payment_method_wallet_enabled: 'Wallet Payment',
  payment_method_razorpay_enabled: 'Razorpay Payment',
  payment_method_phonepe_enabled: 'PhonePe Payment',
  payment_method_gpay_enabled: 'Google Pay',
  payment_method_cod_enabled: 'Cash on Delivery',
  maintenance_fee: 'Maintenance Fee',
  packaging_charge: 'Packaging Charge',
  packaging_charge_enabled: 'Enable Packaging Charge',
  packaging_big_packet_price: 'Big Packet Price',
  packaging_small_packet_price: 'Small Packet Price',
  telegram_show_qr: 'Telegram Pickup QR',
  dilip_da_email: "Owner's Email (Dilip Da)",
  store_temp_close_until: 'Temporary Close Until',
  delivery_available: 'Delivery Available',
  delivery_unavailable_message: 'Unavailable Message',
  delivery_person_name: 'Delivery Person Name',
  delivery_person_phone: 'Delivery Person Phone',
  delivery_fixed_slots_enabled: 'Fixed Delivery Slots',
  delivery_person_emails: 'Delivery Personnel Emails',
  admin_emails: 'Administrator Emails',
  store_support_phone: 'Support Phone',
  store_support_email: 'Support Email',
  notification_email: 'Notification Email',
  store_address: 'Store Address',
  delivery_slots: 'Delivery Slots Config',
};

function formatRecordDisplay(table: string, recordId: string | null, data?: Record<string, unknown> | null): string {
  if (table === 'system_settings') {
    const key = (data?.key as string) || recordId || '';
    return SETTING_LABELS[key] ? `${SETTING_LABELS[key]} (${key})` : key || recordId || '-';
  }
  return recordId ? `${recordId.slice(0, 16)}...` : '-';
}

function getChangeSummary(l: AuditEntry): string | null {
  if (!l.new_data && !l.old_data) return null;
  if (l.table_name === 'system_settings') {
    const oldVal = l.old_data?.value !== undefined ? String(l.old_data.value) : '';
    const newVal = l.new_data?.value !== undefined ? String(l.new_data.value) : '';
    if (oldVal && newVal && oldVal !== newVal) {
      return `"${oldVal}" → "${newVal}"`;
    }
    if (newVal) return `Set to "${newVal}"`;
  }
  const keys = Object.keys(l.new_data || l.old_data || {});
  if (keys.length > 0) {
    return keys.slice(0, 3).map((k) => {
      const o = l.old_data?.[k];
      const n = l.new_data?.[k];
      if (o !== undefined && n !== undefined && o !== n) return `${k}: ${String(o)} → ${String(n)}`;
      if (n !== undefined) return `${k}: ${String(n)}`;
      return k;
    }).join(', ');
  }
  return null;
}

const AUDIT_EXPORT_HEADERS = ['Timestamp', 'Action', 'Entity / Table', 'Record / Setting', 'Changed By', 'Change Summary', 'IP Address'];

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tableName, setTableName] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditEntry | null>(null);
  const { toasts, removeToast } = useToast();

  const fetchLogs = useCallback(async (p?: number) => {
    setLoading(true);
    const targetPage = p ?? page;
    const res = await getAuditLogs({
      search: search.trim() || undefined,
      tableName: tableName || undefined,
      page: targetPage,
      pageSize: 50,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
    if (res.success && res.data) {
      setLogs(res.data.data as AuditEntry[]);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(res.data.page);
    }
    setLoading(false);
  }, [search, tableName, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs(page);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, tableName, page, fetchLogs]);

  const exportRows = useMemo(() => {
    return logs.map((l) => [
      new Date(l.created_at).toLocaleString('en-IN'),
      l.action,
      l.table_name,
      formatRecordDisplay(l.table_name, l.record_id, l.new_data || l.old_data),
      l.changed_by_name ?? l.changed_by ?? 'System',
      getChangeSummary(l) ?? 'N/A',
      l.ip_address ?? 'N/A',
    ]);
  }, [logs]);

  const columns = [
    { key: 'timestamp', header: 'Timestamp', sortable: true, render: (l: AuditEntry) => (
      <div>
        <span className="text-xs font-semibold text-ztext block whitespace-nowrap">
          {new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <span className="text-[11px] text-ztext-muted font-mono block">
          {new Date(l.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
    )},
    { key: 'action', header: 'Action', render: (l: AuditEntry) => (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize bg-zgray text-ztext border border-zborder">
        {l.action.replace(/_/g, ' ')}
      </span>
    )},
    { key: 'table', header: 'Entity / Setting', render: (l: AuditEntry) => (
      <div className="min-w-0 max-w-[220px]">
        <span className="text-xs font-bold text-ztext block truncate">
          {l.table_name === 'system_settings' ? (SETTING_LABELS[l.record_id ?? ''] || l.record_id || 'System Setting') : l.table_name}
        </span>
        <span className="text-[11px] font-mono text-ztext-lighter truncate block">
          {l.table_name === 'system_settings' ? l.record_id : l.record_id?.slice(0, 16)}
        </span>
      </div>
    )},
    { key: 'summary', header: 'Changes Made', render: (l: AuditEntry) => {
      const summary = getChangeSummary(l);
      return (
        <div className="max-w-xs truncate">
          {summary ? (
            <span className="text-xs text-ztext-light font-mono bg-zgray px-2 py-0.5 rounded border border-zborder/60">
              {summary}
            </span>
          ) : (
            <span className="text-xs text-ztext-muted italic">—</span>
          )}
        </div>
      );
    }, hideOnMobile: true},
    { key: 'changed_by', header: 'Changed By', render: (l: AuditEntry) => (
      <span className="text-xs font-medium text-ztext">{l.changed_by_name ?? l.changed_by?.slice(0, 12) ?? 'System'}</span>
    )},
    { key: 'actions', header: '', render: (l: AuditEntry) => (
      <button onClick={() => setSelectedLog(l)} className="p-1.5 hover:bg-zgray rounded-lg text-ztext-muted hover:text-ztext transition-colors" title="View details">
        <Eye size={14} />
      </button>
    )},
  ];

  const tableOptions = [
    { label: 'All entities', value: '' },
    { label: 'System Settings', value: 'system_settings' },
    { label: 'Profiles', value: 'profiles' },
    { label: 'Orders', value: 'orders' },
    { label: 'Payments', value: 'payments' },
    { label: 'Restaurants', value: 'restaurants' },
    { label: 'Credit Accounts', value: 'credit_accounts' },
    { label: 'Credit Transactions', value: 'credit_transactions' },
  ];

  return (
    <div>
      <PageHeader title="Audit Logs" description={`${total} recorded change${total !== 1 ? 's' : ''}`}>
        <ExportDropdown
          title="Audit Logs Report"
          filenamePrefix="audit-logs-export"
          headers={AUDIT_EXPORT_HEADERS}
          rows={exportRows}
          disabled={logs.length === 0}
        />
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search audit logs by setting, action, ID..." />
        </div>
        <select value={tableName} onChange={(v) => { setTableName(v.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-zborder rounded-xl focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred bg-zcard appearance-none cursor-pointer text-ztext font-medium">
          {tableOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <button onClick={() => fetchLogs()} aria-label="Refresh logs" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="bg-zcard rounded-xl border border-zborder">
        <DataTable
          columns={columns}
          data={logs as unknown as Record<string, unknown>[]}
          total={total}
          page={page}
          pageSize={50}
          totalPages={totalPages}
          loading={loading}
          onPageChange={(p) => setPage(p)}
          keyExtractor={(l) => (l as unknown as AuditEntry).id}
          emptyMessage="No audit logs found"
        />
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelectedLog(null)}>
          <div className="bg-zcard rounded-2xl p-6 max-w-lg w-full shadow-z-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-ztext">Audit Log Entry</h3>
              <button onClick={() => setSelectedLog(null)} aria-label="Close details" className="p-1 hover:bg-zgray rounded-lg text-lg leading-none">&times;</button>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between py-1 border-b border-zborder/50">
                <span className="text-ztext-lighter">Date & Time</span>
                <span className="font-semibold text-ztext">{new Date(selectedLog.created_at).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zborder/50">
                <span className="text-ztext-lighter">Action</span>
                <span className="font-bold text-ztext capitalize">{selectedLog.action.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zborder/50">
                <span className="text-ztext-lighter">Entity</span>
                <span className="font-mono font-medium text-ztext">{selectedLog.table_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zborder/50">
                <span className="text-ztext-lighter">Record / Setting Key</span>
                <span className="font-mono text-xs font-bold text-ztext">{selectedLog.record_id ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zborder/50">
                <span className="text-ztext-lighter">Changed By</span>
                <span className="font-medium text-ztext">{selectedLog.changed_by_name ?? selectedLog.changed_by ?? 'System'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zborder/50">
                <span className="text-ztext-lighter">IP Address</span>
                <span className="font-mono text-xs text-ztext-muted">{selectedLog.ip_address ?? 'N/A'}</span>
              </div>
              {selectedLog.user_agent && (
                <div className="flex justify-between py-1 border-b border-zborder/50">
                  <span className="text-ztext-lighter">User Agent</span>
                  <span className="text-xs text-right max-w-[240px] truncate text-ztext-muted">{selectedLog.user_agent}</span>
                </div>
              )}
            </div>

            {(selectedLog.old_data || selectedLog.new_data) && (
              <div className="mt-4 space-y-3">
                {selectedLog.old_data && (
                  <div>
                    <p className="text-xs font-bold text-red-500 mb-1 flex items-center gap-1">
                      <span>Previous Value</span>
                    </p>
                    <pre className="text-[11px] bg-zgray border border-zborder rounded-xl p-3 overflow-x-auto max-h-36 font-mono text-ztext-light">
                      {JSON.stringify(selectedLog.old_data, null, 2)}
                    </pre>
                  </div>
                )}
                {selectedLog.new_data && (
                  <div>
                    <p className="text-xs font-bold text-emerald-500 mb-1 flex items-center gap-1">
                      <span>New Value</span>
                    </p>
                    <pre className="text-[11px] bg-zgray border border-zborder rounded-xl p-3 overflow-x-auto max-h-36 font-mono text-ztext-light">
                      {JSON.stringify(selectedLog.new_data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
